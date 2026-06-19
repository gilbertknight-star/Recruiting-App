import { useEffect, useState } from 'react'
import { getSettings, updateSettings, getGmailAuthUrl, getGmailStatus } from '../api/client'

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
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Settings</h1>

      <div className="card" style={{ maxWidth: 480, marginBottom: 16 }}>
        <h3 style={{ fontWeight: 500, marginBottom: 16 }}>Gmail</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: gmailConnected ? 'var(--green)' : 'var(--muted)'
          }} />
          <span style={{ fontSize: 13 }}>{gmailConnected ? 'Gmail connected' : 'Gmail not connected'}</span>
          <button className="btn-secondary btn-sm" onClick={handleConnectGmail} style={{ marginLeft: 'auto' }}>
            {gmailConnected ? 'Reconnect Gmail' : 'Connect Gmail'}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
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
          <label style={lbl}>Resume File Path</label>
          <input
            placeholder="C:\Users\you\Documents\resume.pdf"
            value={settings.resume_attachment_path || ''}
            onChange={e => set('resume_attachment_path', e.target.value)}
          />
        </div>

        <h3 style={{ fontWeight: 500, marginTop: 4 }}>Sending Limits</h3>
        <div>
          <label style={lbl}>Daily Email Cap</label>
          <input type="number" min={1} max={75} value={settings.daily_cap || 50} onChange={e => set('daily_cap', parseInt(e.target.value))} />
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>Max 75 to stay safe on Gmail free tier.</p>
        </div>
        <div>
          <label style={lbl}>Rate Limit (emails per minute)</label>
          <input type="number" min={1} max={20} value={settings.emails_per_minute || 10} onChange={e => set('emails_per_minute', parseInt(e.target.value))} />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-primary" onClick={handleSave}>Save Settings</button>
          {saved && <span style={{ color: 'var(--green)', fontSize: 13 }}>Saved!</span>}
        </div>
      </div>
    </div>
  )
}

const lbl = { display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4, fontWeight: 500 }
