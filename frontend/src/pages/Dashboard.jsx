import { useEffect, useState } from 'react'
import { getStats, scanReplies } from '../api/client'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => { getStats().then(setStats).catch(() => setStats({})) }, [])

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

  if (!stats || !Object.keys(stats).length) return <p style={{ color: 'var(--muted)' }}>Loading…</p>

  const responseRate = (stats.total_sent || 0) > 0
    ? ((stats.replied / stats.total_sent) * 100).toFixed(1)
    : '0.0'

  const capPct = Math.min(100, Math.round((stats.today_sent / stats.daily_cap) * 100))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Dashboard</h1>
        <button className="btn-secondary" onClick={handleScan} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Scan for Replies'}
        </button>
      </div>

      <div style={grid}>
        <StatCard label="Total Contacts" value={stats.total_contacts} />
        <StatCard label="Emails Sent" value={stats.total_sent} />
        <StatCard label="Replies" value={stats.replied} />
        <StatCard label="Response Rate" value={`${responseRate}%`} color="var(--green)" />
        <StatCard label="Warm Contacts" value={stats.warm} color="var(--yellow)" />
        <StatCard label="Meetings" value={stats.meeting_scheduled} color="#c084fc" />
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 500 }}>Today's Sends</span>
          <span style={{ color: 'var(--muted)' }}>{stats.today_sent} / {stats.daily_cap}</span>
        </div>
        <div style={{ background: 'var(--surface2)', borderRadius: 99, height: 8 }}>
          <div style={{
            width: `${capPct}%`, height: '100%', borderRadius: 99,
            background: capPct >= 90 ? 'var(--red)' : capPct >= 70 ? 'var(--yellow)' : 'var(--accent)',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 16, fontWeight: 500 }}>Pipeline</h3>
        <div style={pipeline}>
          {[
            { label: 'Cold', value: stats.cold, color: 'var(--muted)' },
            { label: 'Contacted', value: stats.contacted, color: '#60a5fa' },
            { label: 'Replied', value: stats.replied, color: 'var(--green)' },
            { label: 'Warm', value: stats.warm, color: 'var(--yellow)' },
            { label: 'Meeting', value: stats.meeting_scheduled, color: '#c084fc' },
            { label: 'Closed', value: stats.closed, color: '#34d399' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="card">
      <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }
const pipeline = { display: 'flex', justifyContent: 'space-between' }
