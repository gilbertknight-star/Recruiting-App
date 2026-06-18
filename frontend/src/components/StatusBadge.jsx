const STATUS_COLORS = {
  Cold:               { bg: '#1e2235', color: '#94a3b8' },
  Contacted:          { bg: '#1a2e4a', color: '#60a5fa' },
  Replied:            { bg: '#1a3a2a', color: '#22c55e' },
  Warm:               { bg: '#2a2a1a', color: '#eab308' },
  'Meeting Scheduled':{ bg: '#2a1a3a', color: '#c084fc' },
  Closed:             { bg: '#1a3a2a', color: '#34d399' },
}

export default function StatusBadge({ status }) {
  const { bg, color } = STATUS_COLORS[status] || STATUS_COLORS.Cold
  return (
    <span className="badge" style={{ background: bg, color }}>{status}</span>
  )
}
