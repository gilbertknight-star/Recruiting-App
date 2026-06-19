import { useState } from 'react'

const TIMES = []
for (let h = 6; h <= 20; h++) {
  for (let m of [0, 30]) {
    const hour12 = h % 12 || 12
    const ampm = h < 12 ? 'AM' : 'PM'
    const label = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    TIMES.push({ label, value })
  }
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function SendModal({ count, onSendNow, onSchedule, onCancel }) {
  const [mode, setMode] = useState('now')
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState('09:00')

  function handleConfirm() {
    if (mode === 'now') {
      onSendNow()
    } else {
      onSchedule(date, time)
    }
  }

  const selectedTime = TIMES.find(t => t.value === time)

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
              Each email will be scheduled to arrive at <strong style={{ color: 'var(--text)' }}>{selectedTime?.label}</strong> in the recipient's local timezone based on their location. Contacts with unknown locations default to Eastern Time.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Date</label>
                <input
                  type="date"
                  value={date}
                  min={todayStr()}
                  onChange={e => setDate(e.target.value)}
                  style={{ fontSize: 14 }}
                />
              </div>
              <div>
                <label style={lbl}>Local Time</label>
                <select value={time} onChange={e => setTime(e.target.value)} style={{ fontSize: 14 }}>
                  {TIMES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={handleConfirm} style={{ minWidth: 140 }}>
            {mode === 'now' ? `Send ${count} Email${count !== 1 ? 's' : ''}` : `Schedule for ${selectedTime?.label}`}
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
