import { useEffect, useState, useMemo, memo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { getStats, scanReplies, getContacts } from '../api/client'
import { resolveCity } from '../lib/cityData'

const STATUS_COLOR = {
  'Cold': '#64748b',
  'Contacted': '#60a5fa',
  'Replied': '#22c55e',
  'Warm': '#eab308',
  'Meeting Scheduled': '#c084fc',
  'Referral': '#34d399',
}
const STATUS_PRIORITY = ['Referral', 'Meeting Scheduled', 'Warm', 'Replied', 'Contacted', 'Cold']

function bestStatus(contacts) {
  for (const s of STATUS_PRIORITY) {
    if (contacts.some(c => c.status === s)) return s
  }
  return 'Cold'
}

// ── Live timezone clocks — isolated so ticks don't re-render the map ─────────
function LiveClockPanel({ contacts }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const clocks = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const c of contacts) {
      const city = resolveCity(c.location)
      if (!city || seen.has(city.tz)) continue
      seen.add(city.tz)
      result.push(city)
    }
    result.sort((a, b) => {
      const off = (tz) => {
        const s = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
          .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || ''
        const m = s.match(/([+-])(\d+):?(\d*)/)
        if (!m) return 0
        return (m[1] === '+' ? 1 : -1) * (parseInt(m[2]) * 60 + parseInt(m[3] || 0))
      }
      return off(a.tz) - off(b.tz)
    })
    return result.slice(0, 6)
  }, [contacts])

  if (!clocks.length) return null

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, zIndex: 1000,
      background: 'rgba(15,17,23,0.88)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(46,50,80,0.7)', borderRadius: 10,
      padding: '14px 18px', minWidth: 170,
    }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>
        Contact Timezones
      </div>
      {clocks.map(city => (
        <div key={city.tz} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, gap: 20 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{city.name}</span>
          <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', letterSpacing: '0.02em' }}>
            {new Intl.DateTimeFormat('en-US', { timeZone: city.tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(time)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Map — memoized so clock ticks don't cause re-renders ─────────────────────
const ContactMap = memo(function ContactMap({ pins }) {
  return (
    <MapContainer
      center={[38, -97]} zoom={4}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      {pins.map((pin, i) => {
        const status = bestStatus(pin.contacts)
        const color = STATUS_COLOR[status]
        const r = Math.min(20, 6 + pin.contacts.length * 2.5)
        return (
          <CircleMarker
            key={i}
            center={pin.coords}
            radius={r}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 2, opacity: 0.35 }}
          >
            <Popup>
              <div style={{ minWidth: 190, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', padding: '2px 0' }}>
                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13, borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>
                  {pin.city.name}
                  <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>
                    {pin.contacts.length} contact{pin.contacts.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {pin.contacts.map(c => (
                  <div key={c.id} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 11 }}>{c.firm}</div>
                    </div>
                    <span style={{
                      padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                      background: (STATUS_COLOR[c.status] || '#64748b') + '25',
                      color: STATUS_COLOR[c.status] || '#64748b',
                    }}>{c.status}</span>
                  </div>
                ))}
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
})

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value ?? '—'}</div>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [contacts, setContacts] = useState([])
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats({}))
    getContacts().then(setContacts).catch(() => setContacts([]))
  }, [])

  const pins = useMemo(() => {
    const groups = {}
    for (const c of contacts) {
      const city = resolveCity(c.location)
      if (!city) continue
      if (!groups[city.name]) groups[city.name] = { coords: city.coords, city, contacts: [] }
      groups[city.name].contacts.push(c)
    }
    return Object.values(groups)
  }, [contacts])

  const responseRate = stats && stats.total_sent > 0
    ? ((stats.replied / stats.total_sent) * 100).toFixed(1) : '0.0'
  const capPct = stats ? Math.min(100, Math.round(((stats.today_sent || 0) / (stats.daily_cap || 50)) * 100)) : 0

  const followUpNeeded = contacts
    .filter(c => c.follow_up_due && new Date(c.follow_up_due) <= new Date())
    .sort((a, b) => new Date(a.follow_up_due) - new Date(b.follow_up_due))
    .slice(0, 5)

  const mappedCount = pins.reduce((n, p) => n + p.contacts.length, 0)

  async function handleScan() {
    setScanning(true)
    try {
      const result = await scanReplies()
      alert(`Scan complete — ${result.updated} reply(ies) detected`)
      getStats().then(setStats)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div style={{ margin: '-32px -28px' }}>

      {/* ── HERO MAP ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative', height: '100vh' }}>
        <ContactMap pins={pins} />

        {/* Network overview — top left */}
        <div style={{
          position: 'absolute', top: 16, left: 16, zIndex: 1000,
          background: 'rgba(15,17,23,0.88)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(46,50,80,0.7)', borderRadius: 10,
          padding: '14px 20px',
        }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase' }}>
            Your Network
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
            {contacts.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {mappedCount > 0 ? `${mappedCount} mapped · ${pins.length} cit${pins.length !== 1 ? 'ies' : 'y'}` : 'contacts total'}
          </div>
        </div>

        {/* Live clocks — top right */}
        <LiveClockPanel contacts={contacts} />

        {/* Status legend — bottom left */}
        <div style={{
          position: 'absolute', bottom: 48, left: 16, zIndex: 1000,
          background: 'rgba(15,17,23,0.88)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(46,50,80,0.7)', borderRadius: 10,
          padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {Object.entries(STATUS_COLOR).map(([status, color]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{status}</span>
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: 'var(--muted)', opacity: 0.6, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>Overview</span>
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
            <path d="M1 1l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* ── STATS SECTION ────────────────────────────────────────── */}
      <div style={{ padding: '36px 28px', background: 'var(--bg)', minHeight: '100vh' }}>

        {/* Headline stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total Contacts" value={stats?.total_contacts} />
          <StatCard label="Emails Sent" value={stats?.total_sent} />
          <StatCard label="Replies" value={stats?.replied} />
          <StatCard label="Response Rate" value={stats ? `${responseRate}%` : null} color="var(--green)" />
          <StatCard label="Warm Contacts" value={stats?.warm} color="var(--yellow)" />
          <StatCard label="Meetings" value={stats?.meeting_scheduled} color="#c084fc" />
        </div>

        {/* Pipeline + Daily cap */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, marginBottom: 20 }}>
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 20, fontSize: 13 }}>Pipeline</div>
            <div style={{ display: 'flex' }}>
              {[
                { label: 'Cold', value: stats?.cold, color: '#64748b' },
                { label: 'Contacted', value: stats?.contacted, color: '#60a5fa' },
                { label: 'Replied', value: stats?.replied, color: '#22c55e' },
                { label: 'Warm', value: stats?.warm, color: '#eab308' },
                { label: 'Meeting', value: stats?.meeting_scheduled, color: '#c084fc' },
                { label: 'Referral', value: stats?.closed, color: '#34d399' },
              ].map((s, i, arr) => {
                const total = stats?.total_contacts || 1
                const pct = Math.round(((s.value || 0) / total) * 100)
                return (
                  <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height: 4, background: s.color, opacity: pct === 0 ? 0.2 : 1, marginBottom: 12,
                      borderRadius: i === 0 ? '99px 0 0 99px' : i === arr.length - 1 ? '0 99px 99px 0' : 0,
                    }} />
                    <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{s.label}</div>
                    {pct > 0 && <div style={{ fontSize: 10, color: 'var(--border)', marginTop: 2 }}>{pct}%</div>}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Today's Sends</span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>{stats?.today_sent ?? 0} / {stats?.daily_cap ?? 50}</span>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 99, height: 7 }}>
                <div style={{
                  width: `${capPct}%`, height: '100%', borderRadius: 99,
                  background: capPct >= 90 ? 'var(--red)' : capPct >= 70 ? 'var(--yellow)' : 'var(--accent)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
            <button
              className="btn-secondary"
              onClick={handleScan}
              disabled={scanning}
              style={{ width: '100%', padding: '13px', fontSize: 13 }}
            >
              {scanning ? 'Scanning…' : 'Scan for Replies'}
            </button>
          </div>
        </div>

        {/* Follow-up needed */}
        {followUpNeeded.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>Follow-Up Needed</span>
              <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 500 }}>{followUpNeeded.length} overdue</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Firm</th>
                  <th>Status</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {followUpNeeded.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.firm}</td>
                    <td>
                      <span className="badge" style={{
                        background: (STATUS_COLOR[c.status] || '#64748b') + '22',
                        color: STATUS_COLOR[c.status] || '#64748b',
                      }}>{c.status}</span>
                    </td>
                    <td style={{ color: 'var(--red)', fontSize: 12 }}>
                      {new Date(c.follow_up_due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}
