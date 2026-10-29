import { useEffect, useState } from 'react'
import { getUsage } from '../api/client'

function money(n) {
  return n < 0.01 && n > 0 ? '<$0.01' : `$${n.toFixed(2)}`
}

function tokens(n) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`
}

/** Claude dollars and Apollo credits the app has spent, this month and all time. */
export default function UsageCard() {
  const [usage, setUsage] = useState(null)
  const [period, setPeriod] = useState('this_month')

  useEffect(() => { getUsage().then(setUsage).catch(() => setUsage(null)) }, [])
  if (!usage) return null
  const u = usage[period]
  const actions = Object.entries(u.claude_by_action).sort((a, b) => b[1].cost_usd - a[1].cost_usd)

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>API Usage & Cost</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['this_month', 'This month'], ['all_time', 'All time']].map(([k, label]) => (
            <button key={k} className="btn-sm" onClick={() => setPeriod(k)} style={{
              background: period === k ? 'var(--accent)' : 'var(--surface2)', color: period === k ? '#fff' : 'var(--muted)',
              border: '1px solid var(--border)',
            }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Claude API</div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{money(u.claude_cost_usd)}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {u.claude_calls} call{u.claude_calls === 1 ? '' : 's'} · {tokens(u.claude_input_tokens)} in / {tokens(u.claude_output_tokens)} out
          </div>
          {actions.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {actions.map(([action, a]) => (
                <div key={action} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>{action} ({a.calls})</span>
                  <span>{money(a.cost_usd)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Apollo</div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{u.apollo_credits} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>credits</span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {u.apollo_cost_usd > 0 ? `≈ ${money(u.apollo_cost_usd)}` : 'Set your cost per credit in Settings to see dollars'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Searches and saved-contact imports are free and not counted.</div>
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>
        Counted by this app since tracking started. Claude cost uses Anthropic's list price; check your Anthropic and Apollo billing pages for the official totals.
      </p>
    </div>
  )
}
