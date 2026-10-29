import { useEffect, useState, useCallback, useMemo } from 'react'
import { getStats, scanReplies, getContacts, getScheduled, cancelScheduled, cancelAllScheduled } from '../api/client'
import DeadlinesTodos from '../components/DeadlinesTodos'
import FollowUps from '../components/FollowUps'
import UsageCard from '../components/UsageCard'

const STATUS_COLOR = {
  'Cold':              '#64748b',
  'Contacted':         '#60a5fa',
  'Replied':           '#22c55e',
  'Warm':              '#eab308',
  'Meeting Scheduled': '#c084fc',
  'Referral':          '#34d399',
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [stats,     setStats]     = useState(null)
  const [contacts,  setContacts]  = useState([])
  const [scanning,  setScanning]  = useState(false)
  const [scheduled, setScheduled] = useState([])
  const [confirmCancelAll, setConfirmCancelAll] = useState(false)

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats({}))
    getContacts().then(setContacts).catch(() => setContacts([]))
    getScheduled().then(r => setScheduled(r.queued || [])).catch(() => {})
    const interval = setInterval(() => {
      getScheduled().then(r => setScheduled(r.queued || [])).catch(() => {})
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  const responseRate = stats && stats.total_sent > 0
    ? ((stats.replied / stats.total_sent) * 100).toFixed(1) : '0.0'

  const capPct = stats
    ? Math.min(100, Math.round(((stats.today_sent || 0) / (stats.daily_cap || 50)) * 100))
    : 0

  const pipeline = [
    { label: 'Cold',       value: stats?.cold,              color: '#64748b' },
    { label: 'Contacted',  value: stats?.contacted,         color: '#60a5fa' },
    { label: 'Replied',    value: stats?.replied,           color: '#22c55e' },
    { label: 'Warm',       value: stats?.warm,              color: '#eab308' },
    { label: 'Meeting',    value: stats?.meeting_scheduled, color: '#c084fc' },
    { label: 'Referral',   value: stats?.closed,            color: '#34d399' },
  ]

  const recentActivity = useMemo(() =>
    [...contacts]
      .filter(c => c.last_contacted)
      .sort((a, b) => new Date(b.last_contacted) - new Date(a.last_contacted))
      .slice(0, 8),
    [contacts]
  )

  function refreshAfterCancel() {
    getScheduled().then(r => setScheduled(r.queued || [])).catch(() => {})
    getStats().then(setStats).catch(() => {})
    getContacts().then(setContacts).catch(() => {})
  }

  async function handleCancel(id) {
    setScheduled(s => s.filter(e => e.id !== id))
    try { await cancelScheduled(id) } finally { refreshAfterCancel() }
  }

  async function handleCancelAll() {
    setConfirmCancelAll(false)
    try { await cancelAllScheduled() } finally { refreshAfterCancel() }
  }

  async function handleScan() {
    setScanning(true)
    try {
      const result = await scanReplies()
      alert(`Scan complete — ${result.updated} reply(ies) detected`)
      getStats().then(setStats)
      getContacts().then(setContacts)
    } finally {
      setScanning(false)
    }
  }

  const total = stats?.total_contacts || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Headline numbers ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12 }}>
        <StatCard label="Total Contacts"  value={stats?.total_contacts} />
        <StatCard label="Emails Sent"     value={stats?.total_sent} />
        <StatCard label="Replies"         value={stats?.replied} />
        <StatCard label="Response Rate"   value={stats ? `${responseRate}%` : null} color="var(--green)" sub={`${stats?.total_sent ?? 0} emails sent`} />
        <StatCard label="Warm Leads"      value={stats?.warm}              color="#eab308" />
        <StatCard label="Meetings"        value={stats?.meeting_scheduled} color="#c084fc" />
      </div>

      {/* ── Application deadlines + to-dos ───────────────────────── */}
      <DeadlinesTodos />

      {/* ── Pipeline + daily cap ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 12 }}>
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Pipeline</div>
          <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 99, overflow: 'hidden', marginBottom: 20 }}>
            {pipeline.map(s => (
              <div key={s.label} style={{ flex: s.value || 0, background: s.color, minWidth: s.value ? 4 : 0 }} />
            ))}
          </div>
          <div style={{ display: 'flex' }}>
            {pipeline.map(s => {
              const pct = Math.round(((s.value || 0) / total) * 100)
              return (
                <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{s.label}</div>
                  {pct > 0 && <div style={{ fontSize: 10, color: 'var(--border)', marginTop: 2 }}>{pct}%</div>}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Today's Sends</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                {stats?.today_sent ?? 0} / {stats?.daily_cap ?? 50}
              </span>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 99, height: 8 }}>
              <div style={{
                width: `${capPct}%`, height: '100%', borderRadius: 99, transition: 'width 0.4s',
                background: capPct >= 90 ? 'var(--red)' : capPct >= 70 ? 'var(--yellow)' : 'var(--accent)',
              }} />
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
              {stats?.daily_cap ? `${(stats.daily_cap - (stats.today_sent || 0))} remaining today` : 'No cap set'}
            </div>
          </div>

          <button
            className="btn-secondary"
            onClick={handleScan}
            disabled={scanning}
            style={{ width: '100%', padding: 14, fontSize: 13 }}
          >
            {scanning ? 'Scanning…' : 'Scan for Replies'}
          </button>
        </div>
      </div>

      {/* ── API usage & cost ───────────────────────────────────── */}
      <UsageCard />

      {/* ── Scheduled queue ─────────────────────────────────────── */}
      {scheduled.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Scheduled to Send</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 600 }}>{scheduled.length} queued</span>
              {confirmCancelAll ? (
                <>
                  <span style={{ fontSize: 12 }}>Cancel all {scheduled.length}?</span>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmCancelAll(false)}>Keep</button>
                  <button className="btn-danger btn-sm" onClick={handleCancelAll}>Cancel all</button>
                </>
              ) : (
                <button className="btn-secondary btn-sm" onClick={() => setConfirmCancelAll(true)}>Cancel all</button>
              )}
            </div>
          </div>
          <table>
            <thead>
              <tr><th>Recipient</th><th>Subject</th><th>Sends At (your time)</th><th style={{ width: 80 }}></th></tr>
            </thead>
            <tbody>
              {scheduled.map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>
                    {e.to}
                    {e.test && <span className="badge" style={{ marginLeft: 8, background: 'var(--surface2)', color: 'var(--yellow)' }}>Test</span>}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{e.subject}</td>
                  <td style={{ color: '#c084fc', fontSize: 12 }}>
                    {new Date(/[zZ]|[+-]\d\d:\d\d$/.test(e.send_at) ? e.send_at : e.send_at + 'Z')
                      .toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td>
                    <button className="btn-secondary btn-sm" onClick={() => handleCancel(e.id)}>Cancel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
            Cancelling stops the email and puts the contact back to Cold so you can send it again later. The draft is kept.
          </p>
        </div>
      )}

      {/* ── Follow-ups + Recent activity ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Follow-ups due */}
        <FollowUps contacts={contacts} onChanged={() => getContacts().then(setContacts)} />

        {/* Recent activity */}
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Recent Activity</div>
          {recentActivity.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              No activity yet
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Firm</th><th>Status</th><th>Last Contact</th></tr>
              </thead>
              <tbody>
                {recentActivity.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.firm}</td>
                    <td>
                      <span className="badge" style={{
                        background: (STATUS_COLOR[c.status] || '#64748b') + '22',
                        color: STATUS_COLOR[c.status] || '#64748b',
                      }}>{c.status}</span>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {new Date(c.last_contacted + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
