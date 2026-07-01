import { useEffect, useState, useMemo } from 'react'
import { getContacts } from '../api/client'

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8am–8pm

const E = {
  sent:     { label: 'Sent',       color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  followup: { label: 'Follow-up',  color: '#eab308', bg: 'rgba(234,179,8,0.15)'   },
  meeting:  { label: 'Meeting',    color: '#c084fc', bg: 'rgba(192,132,252,0.15)' },
  referral: { label: 'Referral',   color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
}

// Use local date to avoid UTC-offset "wrong day" bug
function localDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseLocalDate(iso) {
  if (!iso) return null
  // treat date-only strings as local noon to avoid timezone flip
  const s = iso.length === 10 ? iso + 'T12:00:00' : iso
  return new Date(s)
}

function buildEventMap(contacts) {
  const map = {}
  function add(key, event) {
    if (!key) return
    if (!map[key]) map[key] = []
    map[key].push(event)
  }
  for (const c of contacts) {
    if (c.sent_at) {
      const raw = c.sent_at.endsWith('Z') ? c.sent_at : c.sent_at + 'Z'
      const d = new Date(raw)
      add(localDateKey(d), { ...E.sent, contact: c, time: d })
    }
    if (c.follow_up_due) {
      add(c.follow_up_due.slice(0, 10), { ...E.followup, contact: c, time: null })
    }
    if (c.status === 'Meeting Scheduled') {
      const d = c.meeting_at ? new Date(c.meeting_at) : parseLocalDate(c.replied_at || c.sent_at)
      if (d) add(localDateKey(d), { ...E.meeting, contact: c, time: c.meeting_at ? d : null })
    }
    if (c.status === 'Referral') {
      const d = parseLocalDate(c.replied_at || c.sent_at)
      if (d) add(localDateKey(d), { ...E.referral, contact: c, time: null })
    }
  }
  return map
}

function getWeekStart(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

export default function Calendar() {
  const today = new Date()
  const todayKey = localDateKey(today)

  const [view, setView] = useState('month')
  const [year, setMonth_year] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [weekStart, setWeekStart] = useState(getWeekStart(today))
  const [contacts, setContacts] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [filterTier, setFilterTier] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    const load = () => getContacts().then(setContacts).catch(() => {})
    load()
    const interval = setInterval(load, 30_000)
    window.addEventListener('focus', load)
    return () => { clearInterval(interval); window.removeEventListener('focus', load) }
  }, [])

  const filteredContacts = useMemo(() => contacts.filter(c => {
    if (filterTier && c.tier !== filterTier) return false
    if (filterStatus && c.status !== filterStatus) return false
    return true
  }), [contacts, filterTier, filterStatus])

  const eventMap = useMemo(() => buildEventMap(filteredContacts), [filteredContacts])

  // ── Month navigation ──
  function prevMonth() {
    if (month === 0) { setMonth(11); setMonth_year(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setMonth_year(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }
  function goToday() {
    setMonth(today.getMonth())
    setMonth_year(today.getFullYear())
    setWeekStart(getWeekStart(today))
    setSelectedDay(null)
  }

  // ── Week navigation ──
  function prevWeek() { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }
  function nextWeek() { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d
  })

  // ── Month grid ──
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // ── Selected day ──
  const selectedKey = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null
  const selectedEvents = selectedKey ? (eventMap[selectedKey] || []) : []

  // ── Week view events for a given day ──
  function dayEvents(date) {
    return eventMap[localDateKey(date)] || []
  }

  const weekLabel = (() => {
    const end = new Date(weekStart); end.setDate(end.getDate() + 6)
    if (weekStart.getMonth() === end.getMonth())
      return `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()}–${end.getDate()}, ${weekStart.getFullYear()}`
    return `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}, ${weekStart.getFullYear()}`
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginRight: 4 }}>Calendar</h1>

        <button onClick={goToday} style={toolBtn}>Today</button>

        <div style={{ display: 'flex', gap: 0 }}>
          <button onClick={view === 'month' ? prevMonth : prevWeek} style={{ ...toolBtn, borderRadius: '6px 0 0 6px', borderRight: 'none' }}>‹</button>
          <button onClick={view === 'month' ? nextMonth : nextWeek} style={{ ...toolBtn, borderRadius: '0 6px 6px 0' }}>›</button>
        </div>

        <span style={{ fontWeight: 600, fontSize: 15, minWidth: 160 }}>
          {view === 'month' ? `${MONTHS[month]} ${year}` : weekLabel}
        </span>

        <ToggleGroup
          value={filterTier}
          onChange={setFilterTier}
          options={[
            { value: '', label: 'All' },
            { value: 'analyst_associate', label: 'Analyst' },
            { value: 'vp', label: 'VP' },
            { value: 'md_partner', label: 'MD' },
          ]}
        />

        <ToggleGroup
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: '', label: 'All' },
            { value: 'Contacted', label: 'Contacted' },
            { value: 'Replied', label: 'Replied' },
            { value: 'Warm', label: 'Warm' },
            { value: 'Meeting Scheduled', label: 'Meeting' },
            { value: 'Referral', label: 'Referral' },
          ]}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 3, gap: 2 }}>
          {['month', 'week'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              ...toolBtn, border: 'none',
              background: view === v ? 'var(--surface)' : 'transparent',
              color: view === v ? 'var(--text)' : 'var(--muted)',
              boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
              textTransform: 'capitalize',
            }}>
              {v}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 6px' }}>
          {Object.values(E).map((e, i) => (
            <div key={e.label} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 500, color: 'var(--muted)',
              padding: '3px 10px',
              borderRight: i < Object.values(E).length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: e.color, display: 'inline-block', flexShrink: 0 }} />
              {e.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Month View ── */}
      {view === 'month' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, flex: 1, minHeight: 0 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
              {DAYS_SHORT.map(d => (
                <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.05em' }}>{d}</div>
              ))}
            </div>
            {/* Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${cells.length / 7}, 1fr)`, flex: 1 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={`e-${i}`} style={{ borderRight: i % 7 !== 6 ? '1px solid var(--border)' : 'none', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }} />
                const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const events = eventMap[key] || []
                const isToday = key === todayKey
                const isSelected = key === selectedKey
                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                    style={{
                      borderRight: i % 7 !== 6 ? '1px solid var(--border)' : 'none',
                      borderBottom: '1px solid var(--border)',
                      padding: '8px 10px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                      transition: 'background 0.1s',
                      minHeight: 90,
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 13,
                      fontWeight: isToday ? 700 : 400,
                      background: isToday ? 'var(--accent)' : 'transparent',
                      color: isToday ? '#fff' : 'var(--text)',
                      marginBottom: 2,
                    }}>
                      {day}
                    </div>
                    {events.slice(0, 3).map((e, j) => (
                      <div key={j} style={{
                        fontSize: 11, borderRadius: 4, padding: '2px 6px',
                        background: e.bg, color: e.color,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontWeight: 500,
                      }}>
                        {e.label} · {e.contact.name.split(' ')[0]}
                      </div>
                    ))}
                    {events.length > 3 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 6 }}>+{events.length - 3} more</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sidebar */}
          <Sidebar selectedDay={selectedDay} selectedEvents={selectedEvents} month={month} year={year} eventMap={eventMap} todayKey={todayKey} />
        </div>
      )}

      {/* ── Week View ── */}
      {view === 'week' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div />
            {weekDays.map((d, i) => {
              const key = localDateKey(d)
              const isToday = key === todayKey
              return (
                <div key={i} style={{ padding: '12px 8px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em' }}>{DAYS_SHORT[d.getDay()]}</div>
                  <div style={{
                    fontSize: 22, fontWeight: 700,
                    color: isToday ? '#fff' : 'var(--text)',
                    width: 36, height: 36, borderRadius: '50%',
                    background: isToday ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '4px auto 0',
                  }}>{d.getDate()}</div>
                </div>
              )
            })}
          </div>

          {/* All-day row */}
          {(() => {
            const allDayEvents = weekDays.map(d => dayEvents(d).filter(e => !e.time))
            const hasAny = allDayEvents.some(ev => ev.length > 0)
            if (!hasAny) return null
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0, minHeight: 36 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>all-day</div>
                {allDayEvents.map((events, i) => (
                  <div key={i} style={{ borderLeft: '1px solid var(--border)', padding: '4px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {events.map((e, j) => (
                      <div key={j} style={{ fontSize: 11, borderRadius: 4, padding: '2px 6px', background: e.bg, color: e.color, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.label} · {e.contact.name.split(' ')[0]}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Hour grid */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {HOURS.map(hour => (
              <div key={hour} style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', minHeight: 60, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', paddingRight: 8, paddingTop: 4, flexShrink: 0 }}>
                  {hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
                </div>
                {weekDays.map((d, i) => {
                  const timedEvents = dayEvents(d).filter(e => e.time && new Date(e.time).getHours() === hour)
                  return (
                    <div key={i} style={{ borderLeft: '1px solid var(--border)', padding: '2px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {timedEvents.map((e, j) => {
                        const timeLabel = e.time
                          ? new Date(e.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
                            (e.contact.meeting_end ? '–' + new Date(e.contact.meeting_end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')
                          : ''
                        return (
                          <div key={j} style={{ fontSize: 11, borderRadius: 4, padding: '3px 6px', background: e.bg, color: e.color, fontWeight: 500, borderLeft: `3px solid ${e.color}` }}>
                            {timeLabel && <div style={{ opacity: 0.75, marginBottom: 1 }}>{timeLabel}</div>}
                            <div>{e.contact.name}</div>
                            <div style={{ opacity: 0.8 }}>{e.contact.title} · {e.contact.firm}</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Sidebar({ selectedDay, selectedEvents, month, year, eventMap, todayKey }) {
  const upcoming = useMemo(() => {
    const results = []
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const limit = new Date(now); limit.setDate(limit.getDate() + 30)
    for (const [key, events] of Object.entries(eventMap)) {
      const d = parseLocalDate(key)
      if (d >= now && d <= limit) {
        for (const e of events) results.push({ date: key, ...e })
      }
    }
    return results.sort((a, b) => a.date.localeCompare(b.date))
  }, [eventMap])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
      {selectedDay && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
            {MONTHS[month]} {selectedDay}
          </div>
          {selectedEvents.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing on this day.</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedEvents.map((e, i) => <EventCard key={i} event={e} />)}
              </div>
          }
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Upcoming — Next 30 Days</div>
        {upcoming.length === 0
          ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nothing coming up.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcoming.map((e, i) => {
                const d = parseLocalDate(e.date)
                const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const isOverdue = e.date < todayKey && e.label === 'Follow-up'
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 11, color: isOverdue ? 'var(--red)' : 'var(--muted)', width: 36, flexShrink: 0, paddingTop: 3, fontWeight: isOverdue ? 600 : 400 }}>{label}</div>
                    <EventCard event={e} compact />
                  </div>
                )
              })}
            </div>
        }
      </div>
    </div>
  )
}

function EventCard({ event, compact }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ width: 3, borderRadius: 99, background: event.color, alignSelf: 'stretch', flexShrink: 0, minHeight: 32 }} />
      <div style={{ background: event.bg, borderRadius: 6, padding: compact ? '4px 8px' : '6px 10px', flex: 1 }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: event.color }}>{event.label}</div>
        <div style={{ fontSize: compact ? 11 : 12, color: 'var(--text)', fontWeight: 500, marginTop: 1 }}>{event.contact.name}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{event.contact.title} · {event.contact.firm}</div>
        {event.time && !compact && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {event.time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleGroup({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          ...toolBtn, border: 'none', fontSize: 12,
          background: value === o.value ? 'var(--surface)' : 'transparent',
          color: value === o.value ? 'var(--text)' : 'var(--muted)',
          boxShadow: value === o.value ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
          padding: '4px 10px',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const toolBtn = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', cursor: 'pointer', padding: '5px 12px', fontSize: 13, fontWeight: 500,
}
