import { useEffect, useState, useRef } from 'react'
import { getTemplates, updateTemplate } from '../api/client'

const TIERS = [
  { key: 'analyst_associate', label: 'Analyst / Associate' },
  { key: 'vp', label: 'VP / Director' },
  { key: 'md_partner', label: 'MD / Partner' },
  { key: 'n_a', label: 'N/A' },
]

export default function EmailStudio() {
  const [templates, setTemplates] = useState(null)
  const [activeTier, setActiveTier] = useState('analyst_associate')
  const [draft, setDraft] = useState({})
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved'
  const debounceRef = useRef(null)
  const latestDraft = useRef(draft)

  useEffect(() => {
    getTemplates().then(t => {
      setTemplates(t || {})
      setDraft(t?.[activeTier] || {})
    }).catch(() => { setTemplates({}); setDraft({}) })
  }, [])

  useEffect(() => {
    if (templates) setDraft({ ...templates[activeTier] })
  }, [activeTier])

  // keep ref in sync so the debounce timeout always has the latest draft
  useEffect(() => { latestDraft.current = draft }, [draft])

  function handleChange(key, val) {
    setDraft(d => ({ ...d, [key]: val }))
    setSaveState('saving')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      await updateTemplate(activeTier, { ...latestDraft.current, [key]: val })
      setTemplates(prev => ({ ...prev, [activeTier]: { ...latestDraft.current, [key]: val } }))
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    }, 1000)
  }

  if (!templates) return <p style={{ color: 'var(--muted)' }}>Loading…</p>

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Email Studio</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TIERS.map(t => (
          <button key={t.key}
            className={activeTier === t.key ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTier(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontWeight: 500, margin: 0 }}>{TIERS.find(t => t.key === activeTier)?.label}</h3>
          <span style={{ fontSize: 12, color: saveState === 'saved' ? 'var(--green)' : 'var(--muted)', transition: 'color 0.2s' }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Auto-saves as you type'}
          </span>
        </div>

        <div>
          <label style={lbl}>Subject Line</label>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>Variables: {'{name}'}, {'{firm}'}, {'{title}'}</p>
          <input value={draft.subject || ''} onChange={e => handleChange('subject', e.target.value)} />
        </div>

        <div>
          <label style={lbl}>AI Prompt</label>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>
            Variables: {'{name}'}, {'{title}'}, {'{firm}'}, {'{school_line}'}, {'{notes_line}'}
          </p>
          <textarea
            value={draft.prompt || ''}
            onChange={e => handleChange('prompt', e.target.value)}
            rows={10}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Tone</label>
            <input value={draft.tone || ''} onChange={e => handleChange('tone', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Max Words</label>
            <input type="number" value={draft.max_words || ''} onChange={e => handleChange('max_words', parseInt(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontWeight: 500, marginBottom: 12 }}>Tier Behavior</h3>
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>AI Drafts</th>
              <th>User Reviews</th>
              <th>Auto-Send</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Analyst / Associate</td>
              <td style={{ color: 'var(--green)' }}>Yes</td>
              <td style={{ color: 'var(--muted)' }}>Optional</td>
              <td style={{ color: 'var(--green)' }}>Yes</td>
            </tr>
            <tr>
              <td>VP / Director</td>
              <td style={{ color: 'var(--green)' }}>Yes</td>
              <td style={{ color: 'var(--yellow)' }}>Required</td>
              <td style={{ color: 'var(--yellow)' }}>After Review</td>
            </tr>
            <tr>
              <td>MD / Partner</td>
              <td style={{ color: 'var(--green)' }}>Yes</td>
              <td style={{ color: 'var(--red)' }}>Required</td>
              <td style={{ color: 'var(--red)' }}>Never</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const lbl = { display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4, fontWeight: 500 }
