import { useState } from 'react'
import { generateFollowups, sendFollowups, patchContact } from '../api/client'
import RichTextEditor from './RichTextEditor'

const WARM = ['Replied', 'Warm', 'Meeting Scheduled', 'Referral']

function kindOf(c) {
  return WARM.includes(c.status)
    ? { label: 'Reconnect', color: '#34d399' }
    : { label: 'No reply', color: '#38bdf8' }
}

/** Contacts due for their weekly follow-up: draft with Claude, review, then send as a reply in the same thread. */
export default function FollowUps({ contacts, onChanged }) {
  const [selected, setSelected] = useState({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(null)
  const [draftBody, setDraftBody] = useState('')

  const today = new Date(); today.setHours(23, 59, 59, 999)
  const due = contacts
    .filter(c => c.email && (c.followup_email || (c.follow_up_due && new Date(`${c.follow_up_due}T12:00:00`) <= today)))
    .sort((a, b) => (a.follow_up_due || '') < (b.follow_up_due || '') ? -1 : 1)

  const ids = Object.keys(selected).filter(id => selected[id] && due.some(c => c.id === id))
  const chosen = due.filter(c => ids.includes(c.id))
  const toDraft = chosen.filter(c => !c.followup_email)
  const toSend = chosen.filter(c => c.followup_email)
  const allSelected = due.length > 0 && due.every(c => selected[c.id])

  async function handleDraft() {
    setBusy('draft'); setMsg('')
    try {
      const res = await generateFollowups(toDraft.map(c => c.id))
      const failed = res.filter(r => !r.success)
      setMsg(`Drafted ${res.length - failed.length}${failed.length ? ` · ${failed.length} failed: ${failed[0].error}` : ''}. Review them, then send.`)
      await onChanged()
    } finally { setBusy('') }
  }

  async function handleSend() {
    setBusy('send'); setMsg('')
    try {
      const res = await sendFollowups(toSend.map(c => c.id))
      const ok = res.filter(r => r.success)
      const failed = res.filter(r => !r.success)
      const test = ok.some(r => r.test)
      setMsg(test
        ? `Test Mode: ${ok.length} follow-up${ok.length === 1 ? '' : 's'} sent to you. Contacts unchanged.`
        : `Sent ${ok.length} (${ok.filter(r => r.threaded).length} as replies in the original thread). Next follow-up set for a week from today.${failed.length ? ` ${failed.length} failed: ${failed[0].error}` : ''}`)
      setSelected({})
      await onChanged()
    } finally { setBusy('') }
  }

  function openDraft(c) {
    setEditing(c)
    setDraftBody(c.followup_email)
  }

  async function saveDraft() {
    await patchContact(editing.id, { followup_email: draftBody })
    setEditing(null)
    await onChanged()
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Follow-Ups Due</span>
          {due.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>{due.length} due</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary btn-sm" disabled={!toDraft.length || !!busy} onClick={handleDraft}>
            {busy === 'draft' ? 'Drafting…' : `Draft (${toDraft.length})`}
          </button>
          <button className="btn-primary btn-sm" disabled={!toSend.length || !!busy} onClick={handleSend}>
            {busy === 'send' ? 'Sending…' : `Send (${toSend.length})`}
          </button>
        </div>
      </div>
      {msg && <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{msg}</p>}

      {due.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>All caught up</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={allSelected}
                  onChange={e => setSelected(Object.fromEntries(due.map(c => [c.id, e.target.checked])))} />
              </th>
              <th>Name</th><th>Type</th><th>Sent</th><th>Due</th><th>Draft</th>
            </tr>
          </thead>
          <tbody>
            {due.map(c => {
              const k = kindOf(c)
              return (
                <tr key={c.id}>
                  <td><input type="checkbox" style={{ width: 'auto' }} checked={!!selected[c.id]} onChange={e => setSelected(s => ({ ...s, [c.id]: e.target.checked }))} /></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.firm}</div>
                  </td>
                  <td><span className="badge" style={{ background: `${k.color}22`, color: k.color }}>{k.label}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.followup_count ? `${c.followup_count} follow-up${c.followup_count === 1 ? '' : 's'}` : 'First'}</td>
                  <td style={{ fontSize: 12, color: 'var(--red)' }}>
                    {c.follow_up_due ? new Date(`${c.follow_up_due}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td>
                    {c.followup_email
                      ? <button className="btn-secondary btn-sm" onClick={() => openDraft(c)}>Review</button>
                      : <span style={{ fontSize: 12, color: 'var(--muted)' }}>None yet</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
        "No reply" and "Reconnect" use the follow-up templates in Email Studio. Follow-ups go out as replies in the original email thread, and the next one is due a week later. A contact who replies switches to Reconnect.
      </p>

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setEditing(null)}>
          <div className="card" style={{ width: 640, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>Follow-up to {editing.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {editing.gmail_thread_id ? 'Sends as a reply in your original email thread' : `Sends as a new email: "${editing.followup_subject}"`}
                </div>
              </div>
              <span className="badge" style={{ background: `${kindOf(editing).color}22`, color: kindOf(editing).color }}>{kindOf(editing).label}</span>
            </div>
            <RichTextEditor value={draftBody} onChange={setDraftBody} style={{ minHeight: 220 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-secondary btn-sm" onClick={() => setEditing(null)}>Close</button>
              <button className="btn-primary btn-sm" onClick={saveDraft}>Save draft</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
