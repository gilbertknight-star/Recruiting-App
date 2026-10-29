import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apolloSearch, apolloReveal } from '../api/client'
import SavedInApollo from '../components/SavedInApollo'
import LinkedInAdd from '../components/LinkedInAdd'
import { SENIORITIES, splitList } from '../lib/apolloFilters'

const PER_PAGE = 25

// When you searched by full name, use it for the LinkedIn search instead of the bare first name
function searchedName(typed, firstName) {
  const t = typed.trim()
  return t && t.toLowerCase().startsWith((firstName || '').toLowerCase()) ? t : firstName
}

// Free LinkedIn people search; the free Apollo search hides last names, so this matches on first name, firm and title
function linkedinSearchUrl(name, firm, title) {
  const keywords = [name, firm, title].filter(Boolean).join(' ')
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`
}

export default function FindPeople() {
  const [tab, setTab] = useState('search')
  const tabs = [
    { id: 'search', label: 'Search Apollo' },
    { id: 'saved', label: 'Saved in Apollo' },
    { id: 'linkedin', label: 'Add by LinkedIn' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Find People</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
          {tab === 'search'
            ? 'Searching Apollo is free. Getting contact info uses 1 Apollo credit per person and adds them to Contacts.'
            : tab === 'saved'
              ? 'People you already saved in Apollo. Adding them to Contacts uses no credits.'
              : 'Paste a LinkedIn profile. Checks your Contacts and saved Apollo contacts for free; a fresh Apollo lookup costs 1 credit and always asks first.'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className="btn-sm"
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? 'var(--accent)' : 'var(--surface2)',
              color: tab === t.id ? '#fff' : 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'search' ? <SearchApollo /> : tab === 'saved' ? <SavedInApollo /> : <LinkedInAdd />}
    </div>
  )
}

export function SearchApollo({ initialFirm = '', initialTitles = '', dealId = null, autoSearch = false }) {
  const [firm, setFirm] = useState(initialFirm)
  const [name, setName] = useState('')
  const [titles, setTitles] = useState(initialTitles)
  const [location, setLocation] = useState('')
  const [seniorities, setSeniorities] = useState([])

  // Client side opens this already filled in for a deal's company, so search right away
  useEffect(() => { if (autoSearch && initialFirm) runSearch(1) }, [])
  const [results, setResults] = useState(null)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState({})
  const [revealed, setRevealed] = useState({})
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  async function runSearch(nextPage = 1) {
    if (!firm.trim() && !name.trim()) { setError('Enter a name or a firm first.'); return }
    setError('')
    setLoading(true)
    try {
      const data = await apolloSearch({
        firm: firm.trim(),
        name: name.trim(),
        titles: splitList(titles),
        seniorities,
        locations: splitList(location),
        page: nextPage,
        per_page: PER_PAGE,
      })
      setResults(data)
      setPage(nextPage)
      if (nextPage === 1) { setSelected({}); setSummary(null) }
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleReveal() {
    const ids = Object.keys(selected).filter(id => selected[id])
    setRevealing(true)
    setError('')
    try {
      const res = await apolloReveal(ids, dealId)
      setRevealed(r => ({ ...r, ...Object.fromEntries(res.people.map(p => [p.apollo_id, p])) }))
      setSelected({})
      setSummary(res)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setRevealing(false)
      setConfirming(false)
    }
  }

  function toggleSeniority(value) {
    setSeniorities(s => s.includes(value) ? s.filter(x => x !== value) : [...s, value])
  }

  const people = results?.people || []
  const selectable = people.filter(p => !revealed[p.apollo_id])
  const selectedCount = Object.values(selected).filter(Boolean).length
  const allSelected = selectable.length > 0 && selectable.every(p => selected[p.apollo_id])
  const totalPages = results ? Math.max(1, Math.ceil(Math.min(results.total, 50000) / PER_PAGE)) : 1

  return (
    <div>
      <form className="card" onSubmit={e => { e.preventDefault(); runSearch(1) }} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={lbl}>Name</label>
            <input value={name} onChange={e => { setName(e.target.value); setError('') }} placeholder="Hannah Kelso" />
          </div>
          <div>
            <label style={lbl}>Firm</label>
            <input value={firm} onChange={e => { setFirm(e.target.value); setError('') }} placeholder="Lazard" />
          </div>
          <div>
            <label style={lbl}>Titles (comma separated)</label>
            <input value={titles} onChange={e => setTitles(e.target.value)} placeholder="Investment Banking Analyst, Associate" />
          </div>
          <div>
            <label style={lbl}>Location (comma separated)</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="New York" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...lbl, marginBottom: 0, marginRight: 4 }}>Level</span>
          {SENIORITIES.map(s => (
            <button
              type="button"
              key={s.value}
              className="btn-sm"
              onClick={() => toggleSeniority(s.value)}
              style={{
                background: seniorities.includes(s.value) ? 'var(--accent)' : 'var(--surface2)',
                color: seniorities.includes(s.value) ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
      </form>

      {summary && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--green)' }}>
          Added <strong>{summary.added}</strong> to Contacts
          {summary.skipped > 0 && <>, skipped {summary.skipped} already there</>}
          {summary.no_email.length > 0 && <>, {summary.no_email.length} had no email ({summary.no_email.join(', ')})</>}.{' '}
          <Link to="/contacts" style={{ color: 'var(--accent)' }}>Go to Contacts →</Link>
        </div>
      )}

      {results && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              {results.total.toLocaleString()} people · page {page} of {totalPages.toLocaleString()}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => runSearch(page - 1)}>Previous</button>
              <button className="btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => runSearch(page + 1)}>Next</button>
            </div>
          </div>
          {people.length === 0 ? (
            <p style={{ padding: 20, color: 'var(--muted)' }}>No one matched. Try fewer filters or a different firm spelling.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={allSelected}
                      onChange={e => setSelected(s => ({ ...s, ...Object.fromEntries(selectable.map(p => [p.apollo_id, e.target.checked])) }))}
                    />
                  </th>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Firm</th>
                  <th>Email</th>
                  <th>LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {people.map(p => {
                  const r = revealed[p.apollo_id]
                  return (
                    <tr key={p.apollo_id}>
                      <td>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          disabled={!!r}
                          checked={!!selected[p.apollo_id]}
                          onChange={e => setSelected(s => ({ ...s, [p.apollo_id]: e.target.checked }))}
                        />
                      </td>
                      <td>{r ? r.name : `${p.first_name} ${p.last_name}`}</td>
                      <td>{p.title}</td>
                      <td>{p.firm}</td>
                      <td style={{ color: r?.email ? 'var(--text)' : 'var(--muted)' }}>
                        {r ? (r.email || 'Not found') : (p.has_email ? 'Available' : 'Unlikely')}
                      </td>
                      <td>
                        {r?.linkedin_url
                          ? <a href={r.linkedin_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Profile</a>
                          : <a href={linkedinSearchUrl(r ? r.name : searchedName(name, p.first_name), p.firm, p.title)} target="_blank" rel="noreferrer" style={{ color: 'var(--muted)' }}>Find on LinkedIn</a>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderTop: '1px solid var(--border)', position: 'sticky', bottom: 0, background: 'var(--surface)' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {results.credits_enabled
                ? `${selectedCount} selected · ${selectedCount} credit${selectedCount === 1 ? '' : 's'}`
                : 'Search only · no credits'}
            </span>
            {!results.credits_enabled ? (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                Paid lookups are off. Set APOLLO_ALLOW_CREDITS=true in backend/.env to use Get contact info.
              </span>
            ) : confirming ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>Use {selectedCount} Apollo credit{selectedCount === 1 ? '' : 's'}?</span>
                <button className="btn-secondary btn-sm" onClick={() => setConfirming(false)} disabled={revealing}>Cancel</button>
                <button className="btn-primary btn-sm" onClick={handleReveal} disabled={revealing}>{revealing ? 'Getting info…' : 'Confirm'}</button>
              </div>
            ) : (
              <button className="btn-primary" disabled={selectedCount === 0} onClick={() => setConfirming(true)}>Get contact info</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const lbl = { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }
