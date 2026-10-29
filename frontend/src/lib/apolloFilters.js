export const SENIORITIES = [
  { value: 'entry', label: 'Analyst / Entry' },
  { value: 'senior', label: 'Associate / Senior' },
  { value: 'manager', label: 'Manager' },
  { value: 'director', label: 'Director' },
  { value: 'vp', label: 'VP' },
  { value: 'partner', label: 'MD / Partner' },
]

export function splitList(value) {
  return value.split(',').map(s => s.trim()).filter(Boolean)
}
