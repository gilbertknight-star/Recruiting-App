const TIER_COLORS = {
  analyst_associate: { bg: '#1a3a2a', color: '#22c55e', label: 'Analyst/Assoc' },
  vp: { bg: '#1a2e4a', color: '#60a5fa', label: 'VP' },
  md_partner: { bg: '#3a1a1a', color: '#f87171', label: 'MD/Partner' },
  n_a: { bg: '#222', color: '#94a3b8', label: 'N/A' },
}

export default function TierBadge({ tier }) {
  const { bg, color, label } = TIER_COLORS[tier] || TIER_COLORS.analyst_associate
  return (
    <span className="badge" style={{ background: bg, color }}>{label}</span>
  )
}
