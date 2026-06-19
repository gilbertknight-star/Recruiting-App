import { useState } from 'react'

const TIMES = []
for (let h = 7; h <= 20; h++) {
  for (let m of [0, 15, 30, 45]) {
    const label = new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    TIMES.push({ label, value })
  }
}

function toLocalDateStr(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function toLocalTimeStr(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function buildISO(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  return new Date(`${dateStr}T${timeStr}:00`).toISOString()
}

export default function MeetingModal({ contact, onSave, onClose }) {
  const [date, setDate]       = useState(toLocalDateStr(contact.meeting_at))
  const [startTime, setStart] = useState(toLocalTimeStr(contact.meeting_at) || '09:00')
  const [endTime, setEnd]     = useState(toLocalTimeStr(contact.meeting_end) || '09:30')
  const [saving, setSaving]   = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({
      meeting_at:  buildISO(date, startTime),
      meeting_end: buildISO(date, endTime),
    })
    setSaving(false)
    onClose()
  }

  async function handleClear() {
    setSaving(true)
    await onSave({ meeting_at: null, meeting_end: null })
    setSaving(false)
    onClose()
  }

  const startIdx = TIMES.findIndex(t => t.value === startTime)
  const validEnds = startIdx >= 0 ? TIMES.slice(startIdx + 1) : TIMES

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Schedule Meeting</div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
              {contact.name} · {contact.title} · {contact.firm}
            </div>
          </div>
          <button className="btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lbl}>Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Start Time</label>
              <select value={startTime} onChange={e => { setStart(e.target.value); if (e.target.value >= endTime) setEnd(TIMES[TIMES.findIndex(t => t.value === e.target.value) + 2]?.value || endTime) }} style={{ width: '100%' }}>
                {TIMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>End Time</label>
              <select value={endTime} onChange={e => setEnd(e.target.value)} style={{ width: '100%' }}>
                {validEnds.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {date && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--muted)' }}>
              {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {' · '}
              {TIMES.find(t => t.value === startTime)?.label} – {TIMES.find(t => t.value === endTime)?.label}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          {contact.meeting_at
            ? <button className="btn-danger btn-sm" onClick={handleClear} disabled={saving}>Clear</button>
            : <div />
          }
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !date}>
              {saving ? 'Saving…' : 'Save Meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
}
const modal = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24, width: 400,
}
const lbl = { display: 'block', color: 'var(--muted)', fontSize: 12, marginBottom: 4, fontWeight: 500 }
