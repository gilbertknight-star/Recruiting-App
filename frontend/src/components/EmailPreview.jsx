import { useState } from 'react'
import { generateEmail, patchContact } from '../api/client'
import TierBadge from './TierBadge'
import RichTextEditor, { plainToHtml } from './RichTextEditor'

export default function EmailPreview({ contact, onClose, onSaved }) {
  const [subject, setSubject] = useState(contact.generated_subject || '')
  const [body, setBody] = useState(plainToHtml(contact.generated_email || ''))
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  async function regenerate() {
    setLoading(true)
    try {
      const result = await generateEmail(contact.id)
      setSubject(result.subject)
      setBody(plainToHtml(result.body))
      setSaved(false)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    await patchContact(contact.id, { generated_email: body, generated_subject: subject })
    onSaved?.({ ...contact, generated_email: body, generated_subject: subject })
    setSaved(true)
    setTimeout(onClose, 600)
  }

  return (
    <div style={overlay}>
      <div style={modal}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Edit Draft</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{contact.name} · {contact.title} · {contact.firm}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TierBadge tier={contact.tier} />
            <button className="btn-secondary btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />

        {/* Subject */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Subject</label>
          <input
            value={subject}
            onChange={e => { setSubject(e.target.value); setSaved(false) }}
            style={{ fontSize: 14, fontWeight: 500 }}
          />
        </div>

        {/* Body */}
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Email Body</label>
          <RichTextEditor
            value={body}
            onChange={v => { setBody(v); setSaved(false) }}
            style={{ minHeight: 320 }}
            placeholder="Email body…"
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-secondary" onClick={regenerate} disabled={loading}>
            {loading ? 'Generating…' : 'Regenerate'}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save Changes</button>
          </div>
        </div>

      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
}
const modal = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 32, width: 780, maxWidth: '95vw',
  maxHeight: '92vh', overflowY: 'auto',
}
const lbl = { display: 'block', color: 'var(--muted)', fontSize: 12, fontWeight: 500, marginBottom: 6 }
