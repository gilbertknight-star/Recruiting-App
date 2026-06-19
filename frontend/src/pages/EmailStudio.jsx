import { useEffect, useState, useRef } from 'react'
import { getTemplates, updateTemplate, composeEmail, getSettings, updateSettings, getContacts, patchContact, generateBatchCustom } from '../api/client'
import RichTextEditor, { plainToHtml } from '../components/RichTextEditor'

const TIERS = [
  { key: 'analyst_associate', label: 'Analyst / Associate', short: 'Analyst' },
  { key: 'vp',               label: 'VP / Director',        short: 'VP' },
  { key: 'md_partner',       label: 'MD / Partner',         short: 'MD' },
  { key: 'n_a',              label: 'N/A',                  short: 'N/A' },
]

const VARIABLES = [
  ['{name}',              "First name"],
  ['{firm}',              "Their firm"],
  ['{title}',             "Their job title"],
  ['{location_line}',     "They are based in …"],
  ['{school_line}',       "I am a student at …"],
  ['{notes_line}',        "Notes you've added"],
  ['{availability_line}', "Your availability"],
]

const DEFAULT_RULES = {
  analyst_associate: { drafts: 'Yes', review: 'Optional', send: 'Yes' },
  vp:               { drafts: 'Yes', review: 'Required', send: 'After review' },
  md_partner:       { drafts: 'Yes', review: 'Required', send: 'Never' },
  n_a:              { drafts: 'Yes', review: 'Optional', send: 'Yes' },
}
const DRAFTS_OPTS = ['Yes', 'No']
const REVIEW_OPTS = ['Optional', 'Required']
const SEND_OPTS   = ['Yes', 'After review', 'Never']

function cycle(opts, cur) { return opts[(opts.indexOf(cur) + 1) % opts.length] }

function ruleColor(val) {
  if (val === 'Yes')                        return 'var(--green)'
  if (val === 'After review' || val === 'Required') return 'var(--yellow)'
  if (val === 'No' || val === 'Never')      return '#f87171'
  return 'var(--muted)'
}

export default function EmailStudio() {
  const [section, setSection] = useState('templates')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Page header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 20, borderBottom: '1px solid var(--border)', marginBottom: 24,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Email Studio</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '3px 0 0' }}>
            {section === 'templates'
              ? 'Configure AI prompts and sending rules for each contact tier'
              : 'Generate a one-off email draft with a free-form AI prompt'}
          </p>
        </div>
        <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 3, gap: 2, border: '1px solid var(--border)' }}>
          {['templates', 'compose'].map(s => (
            <button key={s} onClick={() => setSection(s)} style={{
              padding: '7px 22px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
              background: section === s ? 'var(--accent)' : 'transparent',
              color: section === s ? '#fff' : 'var(--muted)',
            }}>
              {s === 'templates' ? 'Templates' : 'AI Compose'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {section === 'templates' ? <Templates /> : <Compose />}
      </div>
    </div>
  )
}

/* ── Templates ──────────────────────────────────────────────────── */

function Templates() {
  const [templates, setTemplates] = useState(null)
  const [activeTier, setActiveTier] = useState('analyst_associate')
  const [draft, setDraft] = useState({})
  const [saveState, setSaveState] = useState('idle')
  const [rules, setRules] = useState(DEFAULT_RULES)
  const debounceRef = useRef(null)
  const latestDraft = useRef(draft)

  useEffect(() => {
    Promise.all([
      getTemplates().catch(() => ({})),
      getSettings().catch(() => ({})),
    ]).then(([t, s]) => {
      setTemplates(t || {})
      setDraft(t?.[activeTier] || {})
      if (s?.tier_rules) setRules({ ...DEFAULT_RULES, ...s.tier_rules })
    })
  }, [])

  useEffect(() => { if (templates) setDraft({ ...templates[activeTier] }) }, [activeTier])
  useEffect(() => { latestDraft.current = draft }, [draft])

  async function cycleRule(tier, col, opts) {
    const newVal = cycle(opts, rules[tier][col])
    const tierRule = { ...rules[tier], [col]: newVal }
    // if send requires a draft, lock drafts to Yes
    if (col === 'send' && (newVal === 'After review' || newVal === 'Never')) {
      tierRule.drafts = 'Yes'
    }
    const updated = { ...rules, [tier]: tierRule }
    setRules(updated)
    await updateSettings({ tier_rules: updated })
  }

  function draftsLocked(tier) {
    return rules[tier]?.send === 'After review' || rules[tier]?.send === 'Never'
  }

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

  const tierInfo = TIERS.find(t => t.key === activeTier)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 220px', gap: 20, alignItems: 'stretch', flex: 1 }}>

      {/* ── Left: Tier nav + Sending Rules ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 16px 12px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Template Tier</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {TIERS.map(t => (
              <button key={t.key} onClick={() => setActiveTier(t.key)} style={{
                textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 500,
                background: activeTier === t.key ? 'var(--accent)' : 'transparent',
                color: activeTier === t.key ? '#fff' : 'var(--muted)',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => { if (activeTier !== t.key) { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' } }}
              onMouseLeave={e => { if (activeTier !== t.key) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)' } }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sending Rules */}
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Sending Rules</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Click any value to change</div>
          </div>

          {TIERS.map((t, i) => (
            <div key={t.key} style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${activeTier === t.key ? 'var(--accent)' : 'var(--border)'}`, transition: 'border-color 0.15s' }}>
              {/* Tier label row */}
              <div style={{
                padding: '7px 12px',
                background: activeTier === t.key ? 'var(--accent)' : 'var(--surface2)',
                borderBottom: '1px solid var(--border)',
                fontSize: 12, fontWeight: 600,
                color: activeTier === t.key ? '#fff' : 'var(--muted)',
                cursor: 'pointer',
              }} onClick={() => setActiveTier(t.key)}>
                {t.label}
              </div>
              {/* Rule rows */}
              {[
                { col: 'drafts', label: 'AI Drafts', opts: DRAFTS_OPTS },
                { col: 'review', label: 'Review',    opts: REVIEW_OPTS },
                { col: 'send',   label: 'Auto-Send', opts: SEND_OPTS },
              ].map(({ col, label, opts }, ri) => {
                const locked = col === 'drafts' && draftsLocked(t.key)
                return (
                  <div key={col} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 12px',
                    background: ri % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                    borderBottom: ri < 2 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontSize: 12, color: locked ? 'var(--border)' : 'var(--muted)', fontWeight: 500 }}>
                      {label}
                    </span>
                    <button
                      onClick={() => !locked && cycleRule(t.key, col, opts)}
                      disabled={locked}
                      style={{
                        background: 'none', border: 'none', padding: '1px 0',
                        fontSize: 12, fontWeight: 700, color: locked ? 'var(--muted)' : ruleColor(rules[t.key][col]),
                        cursor: locked ? 'not-allowed' : 'pointer',
                        opacity: locked ? 0.45 : 1,
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => { if (!locked) e.currentTarget.style.opacity = '0.6' }}
                      onMouseLeave={e => { if (!locked) e.currentTarget.style.opacity = '1' }}
                    >
                      {rules[t.key][col]}{!locked && ' ›'}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Center: Editor ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', alignSelf: 'stretch' }}>

        {/* Editor header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{tierInfo?.label}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>Template prompt · auto-saves as you type</div>
          </div>
          <span style={{ fontSize: 12, color: saveState === 'saved' ? 'var(--green)' : 'var(--muted)', minWidth: 60, textAlign: 'right', transition: 'color 0.2s' }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : ''}
          </span>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
          <div>
            <label style={lbl}>Subject Line</label>
            <input
              value={draft.subject || ''}
              onChange={e => handleChange('subject', e.target.value)}
              style={{ fontSize: 14, fontWeight: 500 }}
              placeholder="e.g. Interest in {firm} — University of Oregon"
            />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>AI Prompt</label>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              Describe what the AI should write. Use variables from the sidebar to personalize.
            </div>
            <textarea
              value={draft.prompt || ''}
              onChange={e => handleChange('prompt', e.target.value)}
              className="no-scrollbar"
              style={{ flex: 1, resize: 'none', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.7, padding: '12px 14px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Tone</label>
              <input value={draft.tone || ''} onChange={e => handleChange('tone', e.target.value)} placeholder="e.g. professional, concise" />
            </div>
            <div>
              <label style={lbl}>Max Words</label>
              <input type="number" value={draft.max_words || ''} onChange={e => handleChange('max_words', parseInt(e.target.value))} placeholder="150" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Variables ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Variables</div>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {VARIABLES.map(([v, desc]) => (
              <div key={v}>
                <code style={{ fontSize: 11, color: 'var(--accent)', background: `color-mix(in srgb, var(--accent) 12%, transparent)`, padding: '1px 6px', borderRadius: 4 }}>{v}</code>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Tips</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            <div>Use <code style={{ color: 'var(--accent)', fontSize: 11 }}>{'{name}'}</code> to open with their first name</div>
            <div>Shorter prompts with a clear goal outperform long ones</div>
            <div>Set availability in Settings so <code style={{ color: 'var(--accent)', fontSize: 11 }}>{'{availability_line}'}</code> fills automatically</div>
          </div>
        </div>
      </div>

    </div>
  )
}

/* ── AI Compose ─────────────────────────────────────────────────── */

function Compose() {
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [contacts, setContacts] = useState([])
  const [saveContactId, setSaveContactId] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchMsg, setBatchMsg] = useState('')

  useEffect(() => {
    getContacts().then(data => {
      setContacts(data || [])
    }).catch(() => {})
  }, [])

  const selectedIds = (() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('contactSelection') || '[]')) }
    catch { return new Set() }
  })()
  const selectedContacts = contacts.filter(c => selectedIds.has(c.id))
  const selectedUndrafted = selectedContacts.filter(c => !c.generated_email)

  async function handleGenerate() {
    if (!prompt.trim()) return
    setLoading(true)
    setResult('')
    try {
      const r = await composeEmail(prompt, context)
      setResult(plainToHtml(r.body))
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSaveToContact() {
    if (!saveContactId || !result) return
    await patchContact(saveContactId, { generated_email: result })
    setSaveMsg('Saved to contact!')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  async function handleBatchGenerate() {
    if (!prompt.trim() || !selectedUndrafted.length) return
    setBatchLoading(true)
    setBatchMsg('')
    try {
      const r = await generateBatchCustom(prompt, selectedUndrafted.map(c => c.id))
      setBatchMsg(`Done — ${r.generated} generated, ${r.failed} failed. Go to Contacts to review.`)
    } catch {
      setBatchMsg('Something went wrong.')
    } finally {
      setBatchLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flex: 1, minHeight: 0 }}>

      {/* Left: inputs */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Compose with AI</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Write a one-off email or use your prompt as a batch template</div>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ flexShrink: 0 }}>
            <label style={lbl}>
              Recipient Context
              <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>optional — for single emails</span>
            </label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="e.g. Sarah Kim, VP at Goldman Sachs — met at a recruiting event"
              rows={2}
              className="no-scrollbar"
              style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, padding: '8px 12px', resize: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <label style={{ ...lbl, flexShrink: 0 }}>Prompt</label>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, flexShrink: 0 }}>
              Use <code style={{ color: 'var(--accent)', fontSize: 11 }}>{'{name}'}</code> and <code style={{ color: 'var(--accent)', fontSize: 11 }}>{'{firm}'}</code> — filled in per contact when batch generating.
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={"e.g. Write a short cold outreach to {name} at {firm} asking for a 15-minute call. Under 150 words. Genuine, not templated."}
              className="no-scrollbar"
              style={{ fontFamily: 'inherit', fontSize: 14, lineHeight: 1.7, padding: '12px 14px', resize: 'none', flex: 1, minHeight: 0 }}
            />
          </div>

          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600, borderRadius: 8 }}
            >
              {loading ? 'Writing…' : 'Generate Preview'}
            </button>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Generate for Selected Contacts</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {selectedIds.size === 0
                      ? 'Select contacts on the Contacts page first'
                      : selectedUndrafted.length === 0
                        ? `All ${selectedIds.size} selected already have drafts`
                        : `${selectedUndrafted.length} of ${selectedIds.size} selected need a draft`}
                  </div>
                </div>
                <button
                  className="btn-secondary btn-sm"
                  onClick={handleBatchGenerate}
                  disabled={batchLoading || !prompt.trim() || selectedUndrafted.length === 0}
                  style={{ flexShrink: 0 }}
                >
                  {batchLoading ? 'Generating…' : `Run (${selectedUndrafted.length})`}
                </button>
              </div>
              {batchMsg && (
                <div style={{ fontSize: 12, color: batchMsg.includes('wrong') ? 'var(--red)' : 'var(--green)' }}>
                  {batchMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right: output */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Generated Draft</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Edit · copy · or save to a contact</div>
          </div>
          {result && (
            <button className="btn-secondary btn-sm" onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          )}
        </div>

        <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          {result ? (
            <>
              <RichTextEditor
                value={result}
                onChange={setResult}
                style={{ flex: 1, minHeight: 0 }}
                placeholder="Your draft will appear here…"
              />
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn-secondary" onClick={handleGenerate} disabled={loading} style={{ width: '100%' }}>
                  {loading ? 'Regenerating…' : 'Regenerate'}
                </button>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <label style={lbl}>Save this draft to a contact</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={saveContactId} onChange={e => setSaveContactId(e.target.value)} style={{ flex: 1 }}>
                      <option value="">Select contact…</option>
                      {contacts.map(c => (
                        <option key={c.id} value={c.id}>{c.name} — {c.firm}</option>
                      ))}
                    </select>
                    <button className="btn-primary btn-sm" onClick={handleSaveToContact} disabled={!saveContactId} style={{ flexShrink: 0 }}>
                      Save
                    </button>
                  </div>
                  {saveMsg && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 6 }}>{saveMsg}</div>}
                </div>
              </div>
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
              border: '1px dashed var(--border)', borderRadius: 8,
              color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40,
            }}>
              {loading ? (
                <>
                  <div style={{ fontSize: 22 }}>✦</div>
                  <div>Writing your email…</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 22, opacity: 0.4 }}>✉</div>
                  <div style={{ lineHeight: 1.6 }}>Your draft will appear here.<br />Fill in the prompt and hit Generate Preview.</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const lbl = { display: 'block', color: 'var(--muted)', fontSize: 12, fontWeight: 500, marginBottom: 6 }
