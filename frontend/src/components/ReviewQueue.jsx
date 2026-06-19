import { useState } from 'react'
import { generateEmail, patchContact } from '../api/client'
import TierBadge from './TierBadge'

const TIER_LABELS = {
  analyst_associate: 'Analyst / Associate',
  vp: 'VP / Director',
  md_partner: 'MD / Partner',
  n_a: 'N/A',
}

const TIER_NOTICE = {
  vp: { color: '#eab308', text: 'Review required before sending' },
  md_partner: { color: '#c084fc', text: 'Manual send only — approve the draft here' },
}

export default function ReviewQueue({ contacts, onClose, onCancel, onSaved }) {
  const [index, setIndex] = useState(0)
  const [drafts, setDrafts] = useState(
    Object.fromEntries(contacts.map(c => [c.id, { subject: c.generated_subject || '', body: c.generated_email || '' }]))
  )
  const [regenerating, setRegenerating] = useState(false)
  const [saved, setSaved] = useState(new Set())

  const contact = contacts[index]
  const draft = drafts[contact.id]
  const total = contacts.length
  const notice = TIER_NOTICE[contact.tier]

  function setDraft(id, key, val) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [key]: val } }))
  }

  async function handleSave() {
    await patchContact(contact.id, { generated_email: draft.body, generated_subject: draft.subject })
    onSaved?.({ ...contact, generated_email: draft.body, generated_subject: draft.subject })
    setSaved(prev => new Set([...prev, contact.id]))
  }

  async function handleSaveAndNext() {
    await handleSave()
    if (index < total - 1) setIndex(i => i + 1)
    else onClose()
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const result = await generateEmail(contact.id)
      setDraft(contact.id, 'subject', result.subject)
      setDraft(contact.id, 'body', result.body)
    } finally {
      setRegenerating(false)
    }
  }

  function goTo(i) {
    setIndex(i)
  }

  const allSaved = contacts.every(c => saved.has(c.id))

  return (
    <div style={overlay}>
      <div style={modal}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Email Review</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--surface2)', borderRadius: 99, padding: '2px 10px' }}>
              {index + 1} of {total}
            </span>
          </div>
          <button className="btn-secondary btn-sm" onClick={onCancel || onClose}>✕</button>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {contacts.map((c, i) => (
            <button
              key={c.id}
              onClick={() => goTo(i)}
              title={c.name}
              style={{
                flex: 1, height: 4, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0,
                background: saved.has(c.id) ? 'var(--green)' : i === index ? 'var(--accent)' : 'var(--surface2)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Contact info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{contact.name}</div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{contact.title} · {contact.firm}</div>
          </div>
          <TierBadge tier={contact.tier} />
        </div>

        {/* Tier notice */}
        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: `${notice.color}18`, border: `1px solid ${notice.color}40`, borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: notice.color, fontWeight: 500 }}>
            <span>⚠</span> {notice.text}
          </div>
        )}

        {/* Subject */}
        <label style={lbl}>Subject</label>
        <input
          value={draft.subject}
          onChange={e => setDraft(contact.id, 'subject', e.target.value)}
          style={{ marginBottom: 12 }}
        />

        {/* Body */}
        <label style={lbl}>Email Body</label>
        <textarea
          value={draft.body}
          onChange={e => setDraft(contact.id, 'body', e.target.value)}
          rows={11}
          style={{ marginBottom: 16, resize: 'vertical' }}
        />

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-secondary" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {index > 0 && (
              <button className="btn-secondary" onClick={() => setIndex(i => i - 1)}>← Back</button>
            )}
            {saved.has(contact.id) && (
              <span style={{ fontSize: 12, color: 'var(--green)' }}>Approved</span>
            )}
            <button className="btn-primary" onClick={handleSaveAndNext}>
              {index < total - 1 ? 'Approve & Next →' : allSaved ? 'Done' : 'Approve & Finish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
}
const modal = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 28, width: 660, maxHeight: '92vh', overflowY: 'auto',
}
const lbl = { display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4, fontWeight: 500 }
