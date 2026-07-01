const TIER_COLORS = {
  analyst_associate: { bg: '#1a3a2a', color: '#22c55e', label: 'Analyst/Assoc' },
  vp: { bg: '#1a2e4a', color: '#60a5fa', label: 'VP' },
  md_partner: { bg: '#3a1a1a', color: '#f87171', label: 'MD/Partner' },
  n_a: { bg: '#222', color: '#94a3b8', label: 'N/A' },
}

const ALUMNI_COLORS = {
  uoig_alum: { bg: '#1e1a3a', color: '#a78bfa', label: 'UOIG Alum' },
  uo_alum:   { bg: '#2a1a1a', color: '#fb923c', label: 'UO Alum' },
}

export default function TierBadge({ tier, alumni, level }) {
  const { bg, color, label } = TIER_COLORS[tier] || TIER_COLORS.analyst_associate
  const alum = alumni ? ALUMNI_COLORS[alumni] : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="badge" style={{ background: bg, color }}>{label}</span>
      {level && <span className="badge" style={{ background: '#1a2a2a', color: '#67e8f9', fontSize: 10 }}>{level}</span>}
      {alum && <span className="badge" style={{ background: alum.bg, color: alum.color }}>{alum.label}</span>}
    </div>
  )
}
