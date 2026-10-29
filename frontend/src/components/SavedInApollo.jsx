import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apolloLists, apolloSaved, apolloImportSaved, getContacts } from '../api/client'

const PER_PAGE = 25

export default function SavedInApollo() {
  const [lists, setLists] = useState([])
  const [listId, setListId] = useState('')
  const [keywords, setKeywords] = useState('')
  const [results, setResults] = useState(null)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState({})
  const [inContacts, setInContacts] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    apolloLists().then(setLists).catch(e => setError(e.response?.data?.detail || e.message))
    refreshContacts()
    load(1, '', '')
  }, [])

  function refreshContacts() {
    return getContacts().then(cs => setInContacts(new Set(cs.map(c => (c.email || '').toLowerCase())))).catch(() => {})
  }

  async function load(nextPage = 1, kw = keywords, list = listId) {
    setLoading(true)
    setError('')
    try {
      const data = await apolloSaved({ keywords: kw.trim(), list_id: list, page: nextPage, per_page: PER_PAGE })
      setResults(data)
      setPage(nextPage)
      setSelected({})
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  async function runImport(body) {
    setImporting(true)
    setError('')
    try {
      const res = await apolloImportSaved(body)
      setSummary(res)
      setSelected({})
      await refreshContacts()
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setImporting(false)
      setConfirmAll(false)
    }
  }

  const people = results?.people || []
  const isIn = p => p.email && inContacts.has(p.email.toLowerCase())
  const selectable = people.filter(p => p.email && !isIn(p))
  const selectedPeople = people.filter(p => selected[p.apollo_id])
  const allSelected = selectable.length > 0 && selectable.every(p => selected[p.apollo_id])
  const totalPages = results ? Math.max(1, Math.ceil(results.total / PER_PAGE)) : 1

  return (
    <div>
      <form className="card" onSubmit={e => { e.preventDefault(); load(1) }} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 12, alignItems: 'end', marginBottom: 16 }}>
        <div>
          <label style={lbl}>List</label>
          <select value={listId} onChange={e => { setListId(e.target.value); load(1, keywords, e.target.value) }}>
            <option value="">All saved contacts</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.count.toLocaleString()})</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Search name, firm or title</label>
          <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="Lazard" />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Loading…' : 'Search'}</button>
        {error && <p style={{ color: 'var(--red)', fontSize: 13, gridColumn: '1 / -1' }}>{error}</p>}
      </form>

      {summary && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--green)' }}>
          Added <strong>{summary.added}</strong> to Contacts
          {summary.skipped > 0 && <>, skipped {summary.skipped} already there</>}
          {summary.no_email.length > 0 && <>, {summary.no_email.length} had no email</>}.{' '}
          <Link to="/contacts" style={{ color: 'var(--accent)' }}>Go to Contacts →</Link>
        </div>
      )}

      {results && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              {results.total.toLocaleString()} saved · page {page} of {totalPages.toLocaleString()}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>Previous</button>
              <button className="btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>Next</button>
            </div>
          </div>
          {people.length === 0 ? (
            <p style={{ padding: 20, color: 'var(--muted)' }}>No saved contacts match.</p>
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
                {people.map(p => (
                  <tr key={p.apollo_id}>
                    <td>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        disabled={!p.email || isIn(p)}
                        checked={!!selected[p.apollo_id]}
                        onChange={e => setSelected(s => ({ ...s, [p.apollo_id]: e.target.checked }))}
                      />
                    </td>
                    <td>
                      {p.name}
                      {isIn(p) && <span className="badge" style={{ marginLeft: 8, background: 'var(--surface2)', color: 'var(--green)' }}>In Contacts</span>}
                    </td>
                    <td>{p.title}</td>
                    <td>{p.firm}</td>
                    <td style={{ color: p.email ? 'var(--text)' : 'var(--muted)' }}>{p.email || 'No email'}</td>
                    <td>
                      {p.linkedin_url
                        ? <a href={p.linkedin_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Profile</a>
                        : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderTop: '1px solid var(--border)', position: 'sticky', bottom: 0, background: 'var(--surface)' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{selectedPeople.length} selected · no credits used</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {confirmAll ? (
                <>
                  <span style={{ fontSize: 13 }}>Add all {results.total.toLocaleString()} to Contacts?</span>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmAll(false)} disabled={importing}>Cancel</button>
                  <button className="btn-primary btn-sm" disabled={importing} onClick={() => runImport({ all: true, keywords: keywords.trim(), list_id: listId })}>
                    {importing ? 'Adding…' : 'Confirm'}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary" disabled={!results.total || importing} onClick={() => setConfirmAll(true)}>
                    Add all {results.total.toLocaleString()}
                  </button>
                  <button className="btn-primary" disabled={selectedPeople.length === 0 || importing} onClick={() => runImport({ people: selectedPeople })}>
                    {importing ? 'Adding…' : 'Add selected to Contacts'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl = { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }
