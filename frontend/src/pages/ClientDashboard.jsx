import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDealsOverview, getContacts } from '../api/client'
import FollowUps from '../components/FollowUps'

const STATUS_COLOR = { new: '#60a5fa', pursuing: '#22c55e', skipped: '#64748b' }

function Stat({ label, value, color }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
    </div>
  )
}

/** Client side overview: every deal found, grouped by bank, with how far outreach has gone on each. */
export default function ClientDashboard() {
  const [banks, setBanks] = useState(null)
  const [open, setOpen] = useState({})
  const [contacts, setContacts] = useState([])

  useEffect(() => {
    getDealsOverview().then(setBanks).catch(() => setBanks([]))
    getContacts().then(setContacts).catch(() => {})
  }, [])

  async function refresh() {
    setContacts(await getContacts())
    setBanks(await getDealsOverview())
  }
  if (!banks) return <p style={{ color: 'var(--muted)' }}>Loading…</p>

  const sum = k => banks.reduce((n, b) => n + b[k], 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Client Dashboard</h1>
        <Link to="/client/deals" className="btn-primary" style={{ padding: '8px 16px', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500 }}>Find deals</Link>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Stat label="Banks tracked" value={banks.length} />
        <Stat label="Deals" value={sum('deal_count')} />
        <Stat label="Pursuing" value={sum('pursuing')} color="#22c55e" />
        <Stat label="Client contacts" value={sum('contacts')} color="#f97316" />
        <Stat label="Emailed" value={sum('emailed')} color="#60a5fa" />
        <Stat label="Replied" value={sum('replied')} color="#c084fc" />
      </div>

      <FollowUps contacts={contacts} side="client" onChanged={refresh} />

      {banks.length === 0 ? (
        <div className="card" style={{ color: 'var(--muted)', fontSize: 13 }}>
          No deals yet. <Link to="/client/deals" style={{ color: 'var(--accent)' }}>Search a bank's recent deals →</Link>
        </div>
      ) : banks.map(b => {
        const isOpen = open[b.bank] ?? true
        return (
          <div key={b.bank} className="card" style={{ padding: 0 }}>
            <div onClick={() => setOpen(o => ({ ...o, [b.bank]: !isOpen }))}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', cursor: 'pointer', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}>
              <span style={{ color: 'var(--muted)', width: 10 }}>{isOpen ? '▾' : '▸'}</span>
              <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{b.bank}</span>
              {[['deals', b.deal_count], ['pursuing', b.pursuing], ['contacts', b.contacts], ['emailed', b.emailed], ['replied', b.replied]].map(([label, n]) => (
                <span key={label} style={{ fontSize: 12, color: 'var(--muted)' }}><strong style={{ color: 'var(--text)' }}>{n}</strong> {label}</span>
              ))}
            </div>
            {isOpen && (
              <table>
                <thead>
                  <tr><th style={{ paddingLeft: 18 }}>Company</th><th>Deal</th><th>Announced</th><th>Status</th><th>Contacts</th><th>Emailed</th><th>Replied</th></tr>
                </thead>
                <tbody>
                  {b.deals.map(d => (
                    <tr key={d.id}>
                      <td style={{ paddingLeft: 18, fontWeight: 500 }}>
                        <Link to={`/client/deals?deal=${d.id}`} style={{ color: 'var(--text)' }}>{d.company}</Link>
                        {d.has_brief && <span className="badge" style={{ marginLeft: 6, background: 'var(--surface2)', color: 'var(--muted)' }}>Brief</span>}
                      </td>
                      <td style={{ color: 'var(--muted)', maxWidth: 320 }}>{d.deal_type}{d.counterparty ? ` · with ${d.counterparty}` : ''}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{d.announced_date ? new Date(`${d.announced_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                      <td><span className="badge" style={{ background: `${STATUS_COLOR[d.status] || '#64748b'}22`, color: STATUS_COLOR[d.status] || '#64748b', textTransform: 'capitalize' }}>{d.status}</span></td>
                      <td>{d.contacts}</td>
                      <td>{d.emailed}</td>
                      <td>{d.replied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}
