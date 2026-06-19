import { useEffect, useState, useMemo } from 'react'
import { getContacts } from '../api/client'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// event types
const E = {
  sent:     { label: 'Sent',        color: '#60a5fa', bg: '#1a2e4a' },
  followup: { label: 'Follow-up',   color: '#eab308', bg: '#2a2a1a' },
  meeting:  { label: 'Meeting',     color: '#c084fc', bg: '#2a1a3a' },
  referral: { label: 'Referral',    color: '#34d399', bg: '#1a3a2a' },
}

function toDateKey(iso) {
  if (!iso) return null
  return iso.slice(0, 10) // "YYYY-MM-DD"
}

function buildEventMap(contacts) {
  const map = {}
  function add(key, event) {
    if (!key) return
    if (!map[key]) map[key] = []
    map[key].push(event)
  }
  for (const c of contacts) {
    if (c.sent_at)       add(toDateKey(c.sent_at),       { ...E.sent,     contact: c })
    if (c.follow_up_due) add(toDateKey(c.follow_up_due), { ...E.followup, contact: c })
    if (c.status === 'Meeting Scheduled') add(toDateKey(c.replied_at || c.sent_at), { ...E.meeting, contact: c })
    if (c.status === 'Referral')          add(toDateKey(c.replied_at || c.sent_at), { ...E.referral, contact: c })
  }
  return map
}

export default function Calendar() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [contacts, setContacts] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => {
    getContacts().then(setContacts).catch(() => setContacts([]))
  }, [])

  const eventMap = useMemo(() => buildEventMap(contacts), [contacts])

  // calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  const todayKey = toDateKey(today.toISOString())
  const selectedKey = selectedDay ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}` : null
  const selectedEvents = selectedKey ? (eventMap[selectedKey] || []) : []

  // upcoming events for sidebar — next 30 days
  const upcoming = useMemo(() => {
    const results = []
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const limit = new Date(now); limit.setDate(limit.getDate() + 30)
    for (const [key, events] of Object.entries(eventMap)) {
      const d = new Date(key + 'T12:00:00')
      if (d >= now && d <= limit) {
        for (const e of events) results.push({ date: key, ...e })
      }
    }
    return results.sort((a, b) => a.date.localeCompare(b.date))
  }, [eventMap])

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Calendar</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

        {/* Calendar grid */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <button onClick={prevMonth} style={navBtn}>‹</button>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{MONTHS[month]} {year}</span>
            <button onClick={nextMonth} style={navBtn}>›</button>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
            {Object.values(E).map(e => (
              <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.color, display: 'inline-block' }} />
                {e.label}
              </div>
            ))}
          </div>

          {/* Day labels */}
          <div style={weekRow}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600, padding: '8px 0' }}>{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div style={weekRow}>
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />
              const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const events = eventMap[key] || []
              const isToday = key === todayKey
              const isSelected = key === selectedKey
              const dotTypes = [...new Set(events.map(e => e.color))]

              return (
                <div
                  key={day}
                  onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                  style={{
                    minHeight: 60, padding: '6px 8px', cursor: events.length ? 'pointer' : 'default',
                    border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                    borderRadius: 6, margin: 2,
                    background: isSelected ? 'var(--surface2)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{
                    fontSize: 13, fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'var(--accent)' : 'var(--text)',
                    width: 24, height: 24, borderRadius: '50%',
                    background: isToday ? 'rgba(99,102,241,0.15)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {day}
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                    {dotTypes.slice(0, 4).map((color, j) => (
                      <span key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Selected day detail */}
          {selectedDay && (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
                {MONTHS[month]} {selectedDay}
              </div>
              {selectedEvents.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing on this day.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedEvents.map((e, i) => (
                    <EventRow key={i} event={e} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upcoming 30 days */}
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Next 30 Days</div>
            {upcoming.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing coming up.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {upcoming.map((e, i) => {
                  const d = new Date(e.date + 'T12:00:00')
                  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  const isOverdue = e.date < todayKey && e.label === 'Follow-up'
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 11, color: isOverdue ? 'var(--red)' : 'var(--muted)', width: 40, flexShrink: 0, paddingTop: 2 }}>{label}</div>
                      <EventRow event={e} compact />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EventRow({ event, compact }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: event.color, flexShrink: 0, marginTop: 4 }} />
      <div>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 500, color: 'var(--text)' }}>
          {event.contact.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {event.label} · {event.contact.firm}
        </div>
      </div>
    </div>
  )
}

const navBtn = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', cursor: 'pointer', width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
}
const weekRow = {
  display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 8px 8px',
}
