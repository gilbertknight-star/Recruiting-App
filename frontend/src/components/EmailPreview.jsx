import { useState } from 'react'
import { generateEmail, patchContact } from '../api/client'

export default function EmailPreview({ contact, onClose, onSaved }) {
  const [subject, setSubject] = useState(contact.generated_subject || '')
  const [body, setBody] = useState(contact.generated_email || '')
  const [loading, setLoading] = useState(false)

  async function regenerate() {
    setLoading(true)
    try {
      const result = await generateEmail(contact.id)
      setSubject(result.subject)
      setBody(result.body)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    await patchContact(contact.id, { generated_email: body, generated_subject: subject })
    onSaved?.({ ...contact, generated_email: body, generated_subject: subject })
    onClose()
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Email Preview — {contact.name}</h3>
          <button className="btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <label style={label}>Subject</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} style={{ marginBottom: 12 }} />

        <label style={label}>Body</label>
        <textarea value={body} onChange={e => setBody(e.target.value)}
          rows={10} style={{ marginBottom: 16, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={regenerate} disabled={loading}>
            {loading ? 'Generating…' : 'Regenerate'}
          </button>
          <button className="btn-primary" onClick={save}>Save Changes</button>
        </div>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
}
const modal = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: 24, width: 600, maxHeight: '90vh', overflowY: 'auto',
}
const label = { display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4 }
