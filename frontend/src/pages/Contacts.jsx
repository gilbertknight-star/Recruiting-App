import { useEffect, useState } from 'react'
import { getContacts, uploadCSV, createContact, generateEmail, sendEmails, patchContact, deleteContact, getSettings } from '../api/client'
import TierBadge from '../components/TierBadge'
import StatusBadge from '../components/StatusBadge'
import EmailPreview from '../components/EmailPreview'
import AddContactModal from '../components/AddContactModal'
import MeetingModal from '../components/MeetingModal'
import ReviewQueue from '../components/ReviewQueue'

function formatMeeting(startIso, endIso) {
  const s = new Date(startIso)
  const date = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const start = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (!endIso) return `${date}, ${start}`
  const end = new Date(endIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date}, ${start}–${end}`
}

const STATUSES = ['Cold', 'Contacted', 'Replied', 'Warm', 'Meeting Scheduled', 'Referral']

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [selected, setSelected] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('contactSelection') || '[]')) }
    catch { return new Set() }
  })
  const [preview, setPreview] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [editContact, setEditContact] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [meetingContact, setMeetingContact] = useState(null)
  const [reviewQueue, setReviewQueue] = useState(null)
  const [reviewed, setReviewed] = useState(new Set())
  const [sendAfterReview, setSendAfterReview] = useState(false)
  const [tierRules, setTierRules] = useState({})

  useEffect(() => {
    loadContacts()
    getSettings().then(s => setTierRules(s?.tier_rules || {})).catch(() => {})
  }, [])
  useEffect(() => {
    sessionStorage.setItem('contactSelection', JSON.stringify([...selected]))
  }, [selected])

  async function loadContacts() {
    try {
      const data = await getContacts()
      setContacts(data || [])
    } catch {
      setContacts([])
    }
  }

  function downloadTemplate() {
    const headers = ['Name', 'Email', 'Title', 'Firm', 'LinkedIn URL', 'School', 'Location', 'Notes']
    const example = ['Jane Smith', 'jsmith@blackstone.com', 'Vice President', 'Blackstone', 'https://linkedin.com/in/jsmith', 'University of Oregon', 'New York, NY', 'Met at info session']
    const csv = [headers, example].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleAddContact(form) {
    if (editContact) {
      await patchContact(editContact.id, form)
      setContacts(prev => prev.map(c => c.id === editContact.id ? { ...c, ...form } : c))
      setEditContact(null)
    } else {
      const created = await createContact(form)
      setContacts(prev => [...prev, created])
      setMsg(`Added ${created.name}`)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    try {
      const result = await uploadCSV(file)
      setMsg(`Bulk import: added ${result.added} contacts (${result.skipped} duplicates skipped)`)
      loadContacts()
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  function autosendTier(tier) {
    return tierRules[tier]?.drafts === 'No'
  }

  async function handleGenerateSelected() {
    setLoading(true)
    setMsg('')
    const drafted = []
    const autoSentIds = []
    for (const id of selected) {
      try {
        const contact = contacts.find(c => c.id === id)
        const result = await generateEmail(id)
        const updated = { ...contact, generated_email: result.body, generated_subject: result.subject }
        setContacts(prev => prev.map(x => x.id === id ? updated : x))
        if (autosendTier(contact.tier)) {
          autoSentIds.push(id)
        } else {
          drafted.push(updated)
        }
      } catch {}
    }
    if (autoSentIds.length) {
      await sendEmails(autoSentIds)
      await loadContacts()
    }
    setLoading(false)
    const parts = []
    if (drafted.length) parts.push(`${drafted.length} draft${drafted.length !== 1 ? 's' : ''} ready to review`)
    if (autoSentIds.length) parts.push(`${autoSentIds.length} auto-sent`)
    setMsg(parts.join(' · '))
  }

  async function executeSend() {
    const sendable = [...selected].filter(id => {
      const c = contacts.find(c => c.id === id)
      return c && c.generated_email && c.tier !== 'md_partner'
    })
    if (!sendable.length) {
      setMsg('No sendable emails — generate drafts first, and MD/Partner contacts must be sent manually')
      return
    }
    if (!confirm(`Send ${sendable.length} email${sendable.length !== 1 ? 's' : ''}?`)) return
    setLoading(true)
    try {
      const results = await sendEmails(sendable)
      const sent = results.filter(r => r.success).length
      setMsg(`Sent ${sent} / ${sendable.length}`)
      loadContacts()
    } finally {
      setLoading(false)
    }
  }

  async function handleSendSelected() {
    const selectedContacts = [...selected].map(id => contacts.find(c => c.id === id)).filter(Boolean)
    const unreviewedSenior = selectedContacts.filter(c =>
      c.generated_email && (c.tier === 'vp' || c.tier === 'md_partner') && !reviewed.has(c.id)
    )
    if (unreviewedSenior.length > 0) {
      setReviewQueue(unreviewedSenior)
      setSendAfterReview(true)
      return
    }
    await executeSend()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this contact?')) return
    await deleteContact(id)
    setContacts(prev => prev.filter(c => c.id !== id))
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(c => c.id)))
  }

  const filtered = contacts.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false
    if (filterTier && c.tier !== filterTier) return false
    if (search) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.firm.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div>
      {(addModal || editContact) && (
        <AddContactModal
          editContact={editContact}
          onClose={() => { setAddModal(false); setEditContact(null) }}
          onSaved={handleAddContact}
        />
      )}
      {reviewQueue && (
        <ReviewQueue
          contacts={reviewQueue}
          onCancel={() => {
            setReviewQueue(null)
            setSendAfterReview(false)
          }}
          onClose={async () => {
            setReviewQueue(null)
            if (sendAfterReview) {
              setSendAfterReview(false)
              await executeSend()
            }
          }}
          onSaved={updated => {
            setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))
            setReviewed(prev => new Set([...prev, updated.id]))
          }}
        />
      )}
      {meetingContact && (
        <MeetingModal
          contact={meetingContact}
          onClose={() => setMeetingContact(null)}
          onSave={async updates => {
            await patchContact(meetingContact.id, updates)
            setContacts(prev => prev.map(c => c.id === meetingContact.id ? { ...c, ...updates } : c))
          }}
        />
      )}
      {preview && (
        <EmailPreview
          contact={preview}
          onClose={() => setPreview(null)}
          onSaved={updated => setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Contacts <span style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 400 }}>({contacts.length})</span></h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={downloadTemplate} style={{ fontSize: 13 }}>
            ↓ Download Template
          </button>
          <label className="btn-secondary" style={{ cursor: 'pointer', padding: '8px 16px', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
            {loading ? 'Importing…' : 'Bulk Import CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleUpload} />
          </label>
          <button className="btn-primary" onClick={() => setAddModal(true)}>+ Add Contact</button>
        </div>
      </div>

      {msg && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', marginBottom: 12, color: 'var(--green)', fontSize: 13 }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="Search name, firm, email…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 140 }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={{ width: 150 }}>
          <option value="">All Tiers</option>
          <option value="analyst_associate">Analyst / Assoc</option>
          <option value="vp">VP / Director</option>
          <option value="md_partner">MD / Partner</option>
          <option value="n_a">N/A</option>
        </select>
        {selected.size > 0 && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn-secondary btn-sm" onClick={handleGenerateSelected} disabled={loading}>
              {loading ? 'Generating…' : `Generate (${selected.size})`}
            </button>
            {(() => {
              const withDrafts = [...selected].map(id => contacts.find(c => c.id === id)).filter(c => c?.generated_email)
              return withDrafts.length > 0 && (
                <button className="btn-secondary btn-sm" onClick={() => setReviewQueue(withDrafts)} style={{ color: '#c084fc', borderColor: '#c084fc' }}>
                  Review ({withDrafts.length})
                </button>
              )
            })()}
            <button className="btn-primary btn-sm" onClick={handleSendSelected} disabled={loading}>
              {loading ? 'Sending…' : `Send (${selected.size})`}
            </button>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 44, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  title="Select all"
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ minWidth: 140 }}>Name</th>
              <th style={{ minWidth: 160 }}>Title / Firm</th>
              <th style={{ minWidth: 100 }}>Tier</th>
              <th style={{ minWidth: 140 }}>Status</th>
              <th style={{ minWidth: 110 }}>Sent</th>
              <th style={{ minWidth: 110 }}>Follow-up Due</th>
              <th style={{ minWidth: 130 }}>Meeting Time</th>
              <th style={{ minWidth: 100 }}>Draft</th>
              <th style={{ width: 64, textAlign: 'center' }}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>
                  {contacts.length === 0
                    ? <span>No contacts yet. <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14 }} onClick={() => setAddModal(true)}>Add your first contact →</button></span>
                    : 'No contacts match your filters.'
                  }
                </td>
              </tr>
            )}
            {filtered.map(c => (
              <tr key={c.id}>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ cursor: 'pointer' }} /></td>
                <td>
                  <div style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => setEditContact(c)}>{c.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{c.email}</div>
                </td>
                <td>
                  <div>{c.title}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{c.firm}{c.location ? ` · ${c.location}` : ''}</div>
                </td>
                <td><TierBadge tier={c.tier} /></td>
                <td>
                  <select value={c.status} onChange={e => {
                    patchContact(c.id, { status: e.target.value })
                    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, status: e.target.value } : x))
                  }} style={{ width: 130 }}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ color: 'var(--muted)' }}>
                  {c.sent_at ? new Date(c.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                </td>
                <td style={{ color: c.follow_up_due && new Date(c.follow_up_due + 'T12:00:00') <= new Date() ? 'var(--yellow)' : 'var(--muted)' }}>
                  {c.follow_up_due || '—'}
                </td>
                <td>
                  {c.status === 'Meeting Scheduled'
                    ? <button
                        className="btn-secondary btn-sm"
                        onClick={() => setMeetingContact(c)}
                        style={{ color: c.meeting_at ? '#c084fc' : 'var(--muted)', borderColor: c.meeting_at ? '#c084fc' : undefined }}
                      >
                        {c.meeting_at
                          ? formatMeeting(c.meeting_at, c.meeting_end)
                          : '+ Set Time'
                        }
                      </button>
                    : <span style={{ color: 'var(--muted)', paddingLeft: 10 }}>—</span>
                  }
                </td>
                <td>
                  {c.generated_email
                    ? <button className="btn-secondary btn-sm" onClick={() => setPreview(c)}>Edit / View</button>
                    : <button className="btn-secondary btn-sm" onClick={async () => {
                        const r = await generateEmail(c.id)
                        const updated = { ...c, generated_email: r.body, generated_subject: r.subject }
                        setContacts(prev => prev.map(x => x.id === c.id ? updated : x))
                        if (autosendTier(c.tier)) {
                          await sendEmails([c.id])
                          await loadContacts()
                        } else {
                          setPreview(updated)
                        }
                      }}>Generate</button>
                  }
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => handleDelete(c.id)}
                    title="Delete contact"
                    style={{ background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--muted)', padding: '2px 8px', borderRadius: 6, fontSize: 12, lineHeight: '18px', transition: 'color 0.15s, border-color 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
        {filtered.length} of {contacts.length} contacts
      </div>
    </div>
  )
}
