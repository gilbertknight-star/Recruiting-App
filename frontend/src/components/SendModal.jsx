import { useState } from 'react'

function dateStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(value) {
  if (!value) return ''
  const [h, m] = value.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function SendModal({ count, onSendNow, onSchedule, onCancel }) {
  const [mode, setMode] = useState('now')
  const [date, setDate] = useState(dateStr(0))   // default today
  const [time, setTime] = useState('09:00')

  function handleConfirm() {
    if (mode === 'now') {
      onSendNow()
    } else {
      onSchedule(date, time)
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Send {count} Email{count !== 1 ? 's' : ''}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Choose when to deliver</div>
          </div>
          <button className="btn-secondary btn-sm" onClick={onCancel}>✕</button>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          {[
            { key: 'now',      label: 'Send Now',       desc: 'Deliver immediately' },
            { key: 'schedule', label: 'Schedule Send',  desc: "Deliver at recipient's local time" },
          ].map(opt => (
            <button key={opt.key} onClick={() => setMode(opt.key)} style={{
              flex: 1, padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              border: `2px solid ${mode === opt.key ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === opt.key ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface2)',
              transition: 'all 0.15s',
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: mode === opt.key ? 'var(--accent)' : 'var(--text)', marginBottom: 3 }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* Schedule options */}
        {mode === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              Emails will arrive at <strong style={{ color: 'var(--text)' }}>{formatTime(time)}</strong> in each recipient's local timezone. Note: this is <em>their</em> time, not yours — a 9:00 AM Eastern send fires at 6:00 AM Pacific. Contacts with unknown locations default to Eastern.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Date</label>
                <input
                  type="date"
                  value={date}
                  min={dateStr(0)}
                  onChange={e => setDate(e.target.value)}
                  style={{ fontSize: 14 }}
                />
              </div>
              <div>
                <label style={lbl}>Local Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  style={{ fontSize: 14 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={handleConfirm} style={{ minWidth: 140 }}>
            {mode === 'now' ? `Send ${count} Email${count !== 1 ? 's' : ''}` : `Schedule for ${formatTime(time)}`}
          </button>
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
  borderRadius: 12, padding: 28, width: 520, maxWidth: '95vw',
}
const lbl = { display: 'block', color: 'var(--muted)', fontSize: 12, fontWeight: 500, marginBottom: 6 }
