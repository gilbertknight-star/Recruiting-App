import { useEffect, useState } from 'react'
import { getContacts, uploadCSV, createContact, generateEmail, sendEmails, patchContact, deleteContact } from '../api/client'
import TierBadge from '../components/TierBadge'
import StatusBadge from '../components/StatusBadge'
import EmailPreview from '../components/EmailPreview'
import AddContactModal from '../components/AddContactModal'
import MeetingModal from '../components/MeetingModal'

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

  useEffect(() => { loadContacts() }, [])
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

  async function handleGenerateSelected() {
    setLoading(true)
    setMsg('')
    let done = 0
    for (const id of selected) {
      try {
        const result = await generateEmail(id)
        setContacts(prev => prev.map(x => x.id === id ? { ...x, generated_email: result.body, generated_subject: result.subject } : x))
        done++
      } catch {}
    }
    setMsg(`Generated ${done} email${done !== 1 ? 's' : ''}`)
    setLoading(false)
  }

  async function handleSendSelected() {
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
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
              </th>
              <th>Name</th>
              <th>Title / Firm</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Follow-up Due</th>
              <th>Meeting Time</th>
              <th>Draft</th>
              <th></th>
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
                <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
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
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {c.sent_at ? new Date(c.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                </td>
                <td style={{ fontSize: 12, color: c.follow_up_due && new Date(c.follow_up_due + 'T12:00:00') <= new Date() ? 'var(--yellow)' : 'var(--muted)' }}>
                  {c.follow_up_due || '—'}
                </td>
                <td style={{ fontSize: 12 }}>
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
                    : <span style={{ color: 'var(--muted)' }}>—</span>
                  }
                </td>
                <td>
                  {c.generated_email
                    ? <button className="btn-secondary btn-sm" onClick={() => setPreview(c)}>Edit / View</button>
                    : <button className="btn-secondary btn-sm" onClick={async () => {
                        const r = await generateEmail(c.id)
                        const updated = { ...c, generated_email: r.body, generated_subject: r.subject }
                        setContacts(prev => prev.map(x => x.id === c.id ? updated : x))
                        setPreview(updated)
                      }}>Generate</button>
                  }
                </td>
                <td>
                  <button className="btn-danger btn-sm" onClick={() => handleDelete(c.id)}>✕</button>
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
