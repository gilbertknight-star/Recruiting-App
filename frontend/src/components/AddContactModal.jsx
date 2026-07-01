import { useState, useEffect } from 'react'

const TIER_KEYWORDS = {
  analyst: 'analyst_associate',
  associate: 'analyst_associate',
  'vp': 'vp',
  'vice president': 'vp',
  director: 'vp',
  md: 'md_partner',
  'managing director': 'md_partner',
  partner: 'md_partner',
  principal: 'md_partner',
  head: 'md_partner',
}

function detectTier(title) {
  const lower = title.toLowerCase()
  for (const [keyword, tier] of Object.entries(TIER_KEYWORDS)) {
    if (lower.includes(keyword)) return tier
  }
  return 'analyst_associate'
}

const TIER_LABELS = {
  analyst_associate: 'Analyst / Associate',
  vp: 'VP / Director',
  md_partner: 'MD / Partner',
  n_a: 'N/A',
}

const LEVELS = [
  '',
  '1st Year Analyst', '2nd Year Analyst', '3rd Year Analyst',
  '1st Year Associate', '2nd Year Associate', 'Senior Associate',
  'VP', 'Senior VP', 'Director',
  'Managing Director', 'Partner', 'Principal',
]

const empty = {
  name: '', email: '', title: '', firm: '',
  linkedin_url: '', school: '', location: '', notes: '', tier: 'analyst_associate', alumni: '', level: '',
}

export default function AddContactModal({ onClose, onSaved, editContact }) {
  const [form, setForm] = useState(editContact ? { ...editContact } : { ...empty })
  const [tierOverride, setTierOverride] = useState(!!editContact)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!tierOverride && form.title) {
      setForm(f => ({ ...f, tier: detectTier(f.title) }))
    }
  }, [form.title, tierOverride])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Required'
    if (!form.email.trim()) e.email = 'Required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email'
    if (!form.title.trim()) e.title = 'Required'
    if (!form.firm.trim()) e.firm = 'Required'
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    await onSaved(form)
    setSaving(false)
    onClose()
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontWeight: 600 }}>{editContact ? 'Edit Contact' : 'Add Contact'}</h3>
          <button className="btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={grid2}>
          <Field label="Full Name *" error={errors.name}>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Smith" />
          </Field>
          <Field label="Email *" error={errors.email}>
            <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="jsmith@gs.com" />
          </Field>
          <Field label="Title *" error={errors.title}>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Investment Banking Analyst" />
          </Field>
          <Field label="Firm *" error={errors.firm}>
            <input value={form.firm} onChange={e => set('firm', e.target.value)} placeholder="Goldman Sachs" />
          </Field>
          <Field label="Location">
            <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="New York" />
          </Field>
          <Field label="School (theirs)">
            <input value={form.school} onChange={e => set('school', e.target.value)} placeholder="UPenn" />
          </Field>
          <Field label="LinkedIn URL">
            <input value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} placeholder="linkedin.com/in/jsmith" />
          </Field>
          <Field label="Alumni Label">
            <select value={form.alumni || ''} onChange={e => set('alumni', e.target.value || null)}>
              <option value="">None</option>
              <option value="uoig_alum">UOIG Alum</option>
              <option value="uo_alum">UO Alum</option>
            </select>
          </Field>
          <Field label="Level">
            <select value={form.level || ''} onChange={e => set('level', e.target.value || null)}>
              {LEVELS.map(l => <option key={l} value={l}>{l || 'Not specified'}</option>)}
            </select>
          </Field>
          <Field label="Tier">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={form.tier} onChange={e => { set('tier', e.target.value); setTierOverride(true) }} style={{ flex: 1 }}>
                {Object.entries(TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {tierOverride && (
                <button className="btn-secondary btn-sm" onClick={() => { setTierOverride(false); set('tier', detectTier(form.title)) }}>
                  Auto
                </button>
              )}
            </div>
            {!tierOverride && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>Auto-detected from title</div>}
          </Field>
        </div>

        <Field label="Notes (context for Claude)" style={{ marginTop: 12 }}>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="e.g. focuses on TMT, went to same undergrad, met at career fair"
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editContact ? 'Save Changes' : 'Add Contact'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, error, children, style }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>{label}</label>
      {children}
      {error && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 3 }}>{error}</div>}
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
}
const modal = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: 24, width: 640, maxHeight: '90vh', overflowY: 'auto',
}
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }
