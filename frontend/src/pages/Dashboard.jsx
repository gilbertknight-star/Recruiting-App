import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import Globe from 'react-globe.gl'
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

// ── Live timezone clocks ──────────────────────────────────────────────────────
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
      position: 'absolute', top: 16, right: 16, zIndex: 10,
      background: 'rgba(10,12,20,0.82)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
      padding: '14px 18px', minWidth: 175,
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>
        Contact Timezones
      </div>
      {clocks.map(city => (
        <div key={city.tz} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, gap: 20 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{city.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#fff' }}>
            {new Intl.DateTimeFormat('en-US', { timeZone: city.tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(time)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value ?? '—'}</div>
    </div>
  )
}

// ── Popup for clicked pin ─────────────────────────────────────────────────────
function PinPopup({ pin, onClose }) {
  if (!pin) return null
  return (
    <div style={{
      position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, background: 'rgba(10,12,20,0.92)', backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
      padding: '16px 20px', minWidth: 220, maxWidth: 300,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{pin.city.name}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 18, padding: 0, lineHeight: 1, cursor: 'pointer' }}>×</button>
      </div>
      {pin.contacts.map(c => (
        <div key={c.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>{c.name}</span>
            <span style={{
              padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
              background: (STATUS_COLOR[c.status] || '#64748b') + '30',
              color: STATUS_COLOR[c.status] || '#64748b',
            }}>{c.status}</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{c.firm}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const globeRef = useRef()
  const containerRef = useRef()
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [stats, setStats] = useState(null)
  const [contacts, setContacts] = useState([])
  const [scanning, setScanning] = useState(false)
  const [selectedPin, setSelectedPin] = useState(null)

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats({}))
    getContacts().then(setContacts).catch(() => setContacts([]))
  }, [])

  // Track container size for the globe
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: e.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Slow auto-rotation
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.4
    globe.controls().enableDamping = true
    globe.pointOfView({ altitude: 2.2 }, 0)
  }, [])

  const pins = useMemo(() => {
    const groups = {}
    for (const c of contacts) {
      const city = resolveCity(c.location)
      if (!city) continue
      if (!groups[city.name]) groups[city.name] = { city, lat: city.coords[0], lng: city.coords[1], contacts: [] }
      groups[city.name].contacts.push(c)
    }
    return Object.values(groups).map(p => ({
      ...p,
      color: STATUS_COLOR[bestStatus(p.contacts)],
      size: Math.min(0.6, 0.25 + p.contacts.length * 0.08),
      label: `${p.city.name} (${p.contacts.length})`,
    }))
  }, [contacts])

  const handlePointClick = useCallback((point) => {
    setSelectedPin(point)
    globeRef.current?.pointOfView({ lat: point.lat, lng: point.lng, altitude: 1.4 }, 800)
  }, [])

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

      {/* ── GLOBE HERO ─────────────────────────────────────────── */}
      <div ref={containerRef} style={{ position: 'relative', height: '100vh', background: '#000' }}>
        <Globe
          ref={globeRef}
          width={dims.w}
          height={dims.h}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          showAtmosphere={true}
          atmosphereColor="#00ffe0"
          atmosphereAltitude={0.12}
          pointsData={pins}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointAltitude="size"
          pointRadius={0.45}
          pointLabel={d => `
            <div style="background:rgba(0,0,0,0.85);padding:8px 12px;border-radius:8px;font-family:sans-serif;font-size:12px;color:#fff;border:1px solid rgba(255,255,255,0.15)">
              <strong>${d.city.name}</strong> · ${d.contacts.length} contact${d.contacts.length !== 1 ? 's' : ''}
            </div>
          `}
          onPointClick={handlePointClick}
        />

        {/* Network overview — top left */}
        <div style={{
          position: 'absolute', top: 16, left: 16, zIndex: 10,
          background: 'rgba(10,12,20,0.82)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
          padding: '14px 20px',
        }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>
            Your Network
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
            {contacts.length}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            {mappedCount > 0 ? `${mappedCount} mapped · ${pins.length} cit${pins.length !== 1 ? 'ies' : 'y'}` : 'contacts total'}
          </div>
        </div>

        {/* Live clocks — top right */}
        <LiveClockPanel contacts={contacts} />

        {/* Status legend — bottom left */}
        <div style={{
          position: 'absolute', bottom: 48, left: 16, zIndex: 10,
          background: 'rgba(10,12,20,0.82)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
          padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {Object.entries(STATUS_COLOR).map(([status, color]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{status}</span>
            </div>
          ))}
        </div>

        {/* Clicked pin popup */}
        <PinPopup pin={selectedPin} onClose={() => setSelectedPin(null)} />

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: 'rgba(255,255,255,0.35)', opacity: 0.8, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Overview</span>
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
            <path d="M1 1l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* ── STATS SECTION ─────────────────────────────────────── */}
      <div style={{ padding: '36px 28px', background: 'var(--bg)', minHeight: '100vh' }}>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total Contacts" value={stats?.total_contacts} />
          <StatCard label="Emails Sent" value={stats?.total_sent} />
          <StatCard label="Replies" value={stats?.replied} />
          <StatCard label="Response Rate" value={stats ? `${responseRate}%` : null} color="var(--green)" />
          <StatCard label="Warm Contacts" value={stats?.warm} color="var(--yellow)" />
          <StatCard label="Meetings" value={stats?.meeting_scheduled} color="#c084fc" />
        </div>

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
            <button className="btn-secondary" onClick={handleScan} disabled={scanning}
              style={{ width: '100%', padding: '13px', fontSize: 13 }}>
              {scanning ? 'Scanning…' : 'Scan for Replies'}
            </button>
          </div>
        </div>

        {followUpNeeded.length > 0 && (
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>Follow-Up Needed</span>
              <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 500 }}>{followUpNeeded.length} overdue</span>
            </div>
            <table>
              <thead>
                <tr><th>Name</th><th>Firm</th><th>Status</th><th>Due</th></tr>
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
