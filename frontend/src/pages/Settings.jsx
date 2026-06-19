import { useEffect, useState } from 'react'
import { getSettings, updateSettings, getGmailAuthUrl, getGmailStatus } from '../api/client'
import RichTextEditor, { plainToHtml } from '../components/RichTextEditor'

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSettings().then(setSettings).catch(() => setSettings({}))
    getGmailStatus().then(r => setGmailConnected(r.connected)).catch(() => {})

    const params = new URLSearchParams(window.location.search)
    if (params.get('gmail') === 'connected') {
      setGmailConnected(true)
      window.history.replaceState({}, '', '/settings')
    }
  }, [])

  async function handleSave() {
    await updateSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleConnectGmail() {
    const { url } = await getGmailAuthUrl()
    window.location.href = url
  }

  function set(key, val) { setSettings(s => ({ ...s, [key]: val })) }

  if (!settings) return <p style={{ color: 'var(--muted)' }}>Loading…</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Settings</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-primary" onClick={handleSave}>Save Settings</button>
          {saved && <span style={{ color: 'var(--green)', fontSize: 13 }}>Saved!</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ fontWeight: 500, marginBottom: 16 }}>Gmail</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: gmailConnected ? 'var(--green)' : 'var(--muted)' }} />
              <span style={{ fontSize: 13 }}>{gmailConnected ? 'Gmail connected' : 'Gmail not connected'}</span>
              <button className="btn-secondary btn-sm" onClick={handleConnectGmail} style={{ marginLeft: 'auto' }}>
                {gmailConnected ? 'Reconnect Gmail' : 'Connect Gmail'}
              </button>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontWeight: 500 }}>Profile</h3>
            <div>
              <label style={lbl}>Your Name (used in emails)</label>
              <input value={settings.sender_name || ''} onChange={e => set('sender_name', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Your School</label>
              <input value={settings.sender_school || ''} onChange={e => set('sender_school', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Availability (shown in emails)</label>
              <input
                value={settings.availability || ''}
                onChange={e => set('availability', e.target.value)}
                placeholder="e.g. Monday through Friday, 9am to 5pm PST"
              />
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>Leave blank to omit from emails.</p>
            </div>
            <div>
              <label style={lbl}>Attachments (sent with every email)</label>
              {(settings.attachments || []).map((path, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    value={path}
                    onChange={e => {
                      const updated = [...(settings.attachments || [])]
                      updated[i] = e.target.value
                      set('attachments', updated)
                    }}
                    placeholder={`C:\\Users\\you\\Documents\\resume.pdf`}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => set('attachments', (settings.attachments || []).filter((_, j) => j !== i))}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--muted)', padding: '0 10px', cursor: 'pointer', flexShrink: 0, fontSize: 16, lineHeight: 1 }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  >✕</button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => set('attachments', [...(settings.attachments || []), ''])}
                style={{ marginTop: 4 }}
              >+ Add File</button>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>Full file path on your computer. Attached to every outgoing email.</p>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontWeight: 500 }}>Sending Limits</h3>
            <div>
              <label style={lbl}>Daily Email Cap</label>
              <input type="number" min={1} max={75} value={settings.daily_cap || 50} onChange={e => set('daily_cap', parseInt(e.target.value))} />
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>Max 75 to stay safe on Gmail free tier.</p>
            </div>
            <div>
              <label style={lbl}>Rate Limit (emails per minute)</label>
              <input type="number" min={1} max={20} value={settings.emails_per_minute || 10} onChange={e => set('emails_per_minute', parseInt(e.target.value))} />
            </div>
          </div>
        </div>

        {/* Right column — Signature */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontWeight: 500 }}>Email Signature</h3>
          <div>
            <label style={lbl}>Signature (appended to every email)</label>
            <RichTextEditor
              value={plainToHtml(settings.signature || '')}
              onChange={v => set('signature', v)}
              placeholder="Best,&#10;Gilbert Knight&#10;University of Oregon | Mathematics &amp; Finance"
              style={{ minHeight: 160 }}
            />
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
              Supports bold, italic, underline — renders in the recipient's email client.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

const lbl = { display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4, fontWeight: 500 }
