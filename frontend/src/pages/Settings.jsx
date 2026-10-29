import { useEffect, useState } from 'react'
import { getSettings, updateSettings, getGmailAuthUrl, getGmailStatus, browseFile, getAvailabilityPreview, getCalendarList } from '../api/client'
import RichTextEditor, { plainToHtml } from '../components/RichTextEditor'

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState('')
  const [calendars, setCalendars] = useState(null)
  const [calendarError, setCalendarError] = useState('')

  useEffect(() => {
    getCalendarList()
      .then(setCalendars)
      .catch(e => setCalendarError(e.response?.data?.detail || e.message))
  }, [])

  function toggleCalendar(id) {
    const current = settings.calendar_ids || calendars.filter(c => c.used).map(c => c.id)
    set('calendar_ids', current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }
  const usedIds = settings?.calendar_ids || (calendars || []).filter(c => c.used).map(c => c.id)

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

  async function handlePreview() {
    await updateSettings(settings)  // preview uses the saved hours, so save first
    try {
      const { text } = await getAvailabilityPreview('New York')
      setPreview(text || 'No open times found in your calling hours.')
    } catch (e) {
      setPreview(e.response?.data?.detail || 'Could not reach Google Calendar. Reconnect Gmail above.')
    }
  }

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
            <div style={{ marginTop: 16 }}>
              <label style={lbl}>BCC every email to</label>
              <input
                type="email"
                value={settings.bcc_email || ''}
                onChange={e => set('bcc_email', e.target.value)}
                placeholder="you@uoregon.edu"
              />
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                Sends you a hidden copy of every outreach email. Recipients can't see it. Leave blank to turn off.
              </p>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={lbl}>Calendars the app reads</label>
              {calendarError && <p style={{ color: 'var(--muted)', fontSize: 12 }}>{calendarError}</p>}
              {!calendars && !calendarError && <p style={{ color: 'var(--muted)', fontSize: 12 }}>Loading…</p>}
              {calendars && calendars.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={usedIds.includes(c.id)} onChange={() => toggleCalendar(c.id)} />
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                  {c.name}{c.primary && <span style={{ color: 'var(--muted)' }}> (main)</span>}
                </label>
              ))}
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                Checked calendars show on the Calendar page and count as busy for live availability. Coffee chats you set in the app are added to your main calendar.
              </p>
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
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={!!settings.live_availability}
                  onChange={e => set('live_availability', e.target.checked)}
                />
                Live availability from Google Calendar
              </label>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>
                Emails list your open times, checked against your Google Calendar the moment each email sends, in the recipient's time zone.
                New drafts include a placeholder line that gets replaced at send time.
              </p>
              {settings.live_availability && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Your time zone</label>
                    <select value={settings.avail_timezone || 'America/Los_Angeles'} onChange={e => set('avail_timezone', e.target.value)}>
                      {TIMEZONES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Calling hours (your time)</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select value={settings.avail_start_hour ?? 9} onChange={e => set('avail_start_hour', Number(e.target.value))}>
                        {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
                      </select>
                      <span style={{ color: 'var(--muted)' }}>to</span>
                      <select value={settings.avail_end_hour ?? 17} onChange={e => set('avail_end_hour', Number(e.target.value))}>
                        {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Look ahead (days)</label>
                    <input type="number" min={1} max={21} value={settings.avail_days_ahead ?? 7} onChange={e => set('avail_days_ahead', Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={lbl}>Shortest slot to offer (minutes)</label>
                    <input type="number" min={15} step={15} value={settings.avail_min_minutes ?? 30} onChange={e => set('avail_min_minutes', Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={lbl}>Days to list in each email</label>
                    <input type="number" min={1} max={7} value={settings.avail_max_days ?? 4} onChange={e => set('avail_max_days', Number(e.target.value))} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'end' }}>
                    <button type="button" className="btn-secondary btn-sm" onClick={handlePreview}>Preview for a New York contact</button>
                  </div>
                  {preview && (
                    <div style={{ gridColumn: '1 / -1', background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 12, fontSize: 13 }}
                      dangerouslySetInnerHTML={{ __html: preview }} />
                  )}
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>{settings.live_availability ? 'Written availability (used if Google Calendar is unavailable)' : 'Availability (shown in emails)'}</label>
              <input
                value={settings.availability || ''}
                onChange={e => set('availability', e.target.value)}
                placeholder="e.g. Monday through Friday, 9am to 5pm PST"
              />
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>Leave blank to omit from emails.</p>
            </div>
            <div>
              <label style={lbl}>LinkedIn URL</label>
              {settings.linkedin_url ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{
                    flex: 1, padding: '7px 10px', borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)', background: 'var(--surface2)',
                    fontSize: 12, color: 'var(--accent)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {settings.linkedin_url}
                  </div>
                  <button
                    type="button"
                    onClick={() => set('linkedin_url', '')}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--muted)', padding: '0 10px', cursor: 'pointer', flexShrink: 0, fontSize: 16, lineHeight: '32px' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  >✕</button>
                </div>
              ) : (
                <input
                  value={settings.linkedin_url || ''}
                  onChange={e => set('linkedin_url', e.target.value)}
                  placeholder="https://www.linkedin.com/in/your-name"
                />
              )}
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>Used in your email signature.</p>
            </div>
            <div>
              <label style={lbl}>Attachments (sent with every email)</label>
              {(settings.attachments || []).filter(Boolean).map((path, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <div style={{
                    flex: 1, padding: '7px 10px', borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)', background: 'var(--surface2)',
                    fontSize: 12, color: 'var(--text)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    title: path,
                  }}>
                    {path.split(/[\\/]/).pop()}
                    <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11 }}>
                      {path.substring(0, path.lastIndexOf('\\') + 1) || path.substring(0, path.lastIndexOf('/') + 1)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => set('attachments', (settings.attachments || []).filter((_, j) => j !== i))}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--muted)', padding: '0 10px', cursor: 'pointer', flexShrink: 0, fontSize: 16, lineHeight: '32px' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                  >✕</button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={async () => {
                  const r = await browseFile()
                  if (r.path) set('attachments', [...(settings.attachments || []).filter(Boolean), r.path])
                }}
                style={{ marginTop: 4 }}
              >+ Browse for File</button>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>Opens file explorer. Selected files are attached to every outgoing email.</p>
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
          <h3 style={{ fontWeight: 500 }}>Email Font</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Font</label>
              <select value={settings.email_font || 'Arial'} onChange={e => set('email_font', e.target.value)}>
                {Object.keys(FONT_STACKS).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Size</label>
              <select value={settings.email_font_size || 14} onChange={e => set('email_font_size', Number(e.target.value))}>
                {[12, 13, 14, 15, 16].map(s => <option key={s} value={s}>{s}px</option>)}
              </select>
            </div>
          </div>
          <div style={{
            background: '#fff', color: '#222', borderRadius: 'var(--radius)', padding: 14,
            fontFamily: FONT_STACKS[settings.email_font || 'Arial'], fontSize: settings.email_font_size || 14, lineHeight: 1.5,
          }}>
            Hello Hannah,<br />My name is Gilbert Knight, and I'm a freshman at the University of Oregon.
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: -8 }}>
            Applies to every email when it sends, including drafts you've already generated.
          </p>

          <h3 style={{ fontWeight: 500, marginTop: 8 }}>Email Signature</h3>
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

// Keep in sync with FONT_STACKS in backend/email_gen.py
const FONT_STACKS = {
  'Arial': "Arial, Helvetica, sans-serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  'Georgia': "Georgia, 'Times New Roman', serif",
  'Garamond': "Garamond, 'Times New Roman', serif",
  'Calibri': "Calibri, Arial, sans-serif",
  'Verdana': "Verdana, Geneva, sans-serif",
  'Helvetica': "Helvetica, Arial, sans-serif",
}

const TIMEZONES = [
  ['America/Los_Angeles', 'Pacific Time'],
  ['America/Denver', 'Mountain Time'],
  ['America/Chicago', 'Central Time'],
  ['America/New_York', 'Eastern Time'],
]
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6am–10pm
function hourLabel(h) {
  return h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`
}
