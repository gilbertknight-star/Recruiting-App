import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DealBrief from '../components/DealBrief'
import { getDeals, searchDeals, updateDeal, deleteDeal, getDealClientTitles } from '../api/client'
import { SearchApollo } from './FindPeople'

const STATUS = {
  new: { label: 'New', color: '#60a5fa' },
  pursuing: { label: 'Pursuing', color: '#22c55e' },
  skipped: { label: 'Skipped', color: '#64748b' },
}

function formatDate(d) {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

/** Client side: find the companies a bank advised recently, then the finance leaders at those companies. */
export default function Deals() {
  const [bank, setBank] = useState('')
  const [days, setDays] = useState(90)
  const [deals, setDeals] = useState([])
  const [bankFilter, setBankFilter] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [searching, setSearching] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [openDeal, setOpenDeal] = useState(null)
  const [clientTitles, setClientTitles] = useState([])
  const [hideSkipped, setHideSkipped] = useState(true)
  const [briefId, setBriefId] = useState(null)
  const [params] = useSearchParams()

  useEffect(() => {
    getDeals().then(ds => { setDeals(ds); if (params.get('deal')) setBriefId(params.get('deal')) }).catch(() => {})
    getDealClientTitles().then(setClientTitles).catch(() => {})
  }, [])

  async function runSearch() {
    setConfirming(false)
    setSearching(true)
    setError('')
    setMsg('')
    try {
      const res = await searchDeals(bank.trim(), days)
      setMsg(res.found === 0
        ? `No deals found for ${bank.trim()} in the last ${days} days.`
        : `Found ${res.found} deal${res.found === 1 ? '' : 's'} for ${bank.trim()} · ${res.added} new.`)
      setDeals(await getDeals())
      setBankFilter(bank.trim())
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setSearching(false)
    }
  }

  async function setStatus(d, status) {
    setDeals(ds => ds.map(x => x.id === d.id ? { ...x, status } : x))
    await updateDeal(d.id, { status })
  }

  async function remove(d) {
    setDeals(ds => ds.filter(x => x.id !== d.id))
    if (openDeal === d.id) setOpenDeal(null)
    await deleteDeal(d.id)
  }

  const banks = [...new Set(deals.map(d => d.bank))].sort()
  const shown = deals
    .filter(d => !bankFilter || d.bank.toLowerCase() === bankFilter.toLowerCase())
    .filter(d => !hideSkipped || d.status !== 'skipped')

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Deals</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
          Find companies a bank advised recently, then reach the finance leaders who worked with that bank's team.
        </p>
      </div>

      <form className="card" onSubmit={e => { e.preventDefault(); if (bank.trim()) setConfirming(true); else setError('Enter a bank first.') }}
        style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: '1 1 220px' }}>
          <label style={lbl}>Bank</label>
          <input value={bank} onChange={e => { setBank(e.target.value); setError('') }} placeholder="Evercore" />
        </div>
        <div style={{ width: 150 }}>
          <label style={lbl}>Look back</label>
          <select value={days} onChange={e => setDays(Number(e.target.value))}>
            {[30, 60, 90, 180].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>
        {confirming ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Search the web for {bank.trim()}'s deals? About $1 in Claude usage.</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="btn-primary btn-sm" onClick={runSearch}>Search</button>
          </div>
        ) : (
          <button type="submit" className="btn-primary" disabled={searching}>{searching ? 'Searching the web… (about a minute)' : 'Find deals'}</button>
        )}
      </form>
      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: -8, marginBottom: 12 }}>{error}</p>}
      {msg && <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -8, marginBottom: 12 }}>{msg}</p>}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={bankFilter} onChange={e => setBankFilter(e.target.value)} style={{ width: 200 }}>
              <option value="">All banks ({deals.length})</option>
              {banks.map(b => <option key={b} value={b}>{b} ({deals.filter(d => d.bank === b).length})</option>)}
            </select>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={hideSkipped} onChange={e => setHideSkipped(e.target.checked)} />
              Hide skipped
            </label>
          </div>
          <Link to="/client/contacts" style={{ color: 'var(--accent)', fontSize: 13 }}>Client contacts →</Link>
        </div>

        {shown.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>
            No deals yet. Enter a bank above to find the companies it advised in the last {days} days.
          </p>
        ) : shown.map(d => {
          const st = STATUS[d.status] || STATUS.new
          const open = openDeal === d.id
          return (
            <div key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr) auto', gap: 14, padding: '12px 16px', alignItems: 'start' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDate(d.announced_date)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    <span onClick={() => setBriefId(d.id)} style={{ cursor: 'pointer', borderBottom: '1px dashed var(--muted)' }} title="Open deal brief">{d.company}</span>
                    <span className="badge" style={{ marginLeft: 8, background: 'var(--surface2)', color: 'var(--muted)', fontWeight: 500 }}>{d.deal_type || 'Deal'}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>{d.summary}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {d.bank}: {d.bank_role || 'advisor'}
                    {d.source_url && <> · <a href={d.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Source</a></>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={d.status} onChange={e => setStatus(d, e.target.value)}
                    style={{ width: 110, padding: '3px 6px', fontSize: 12, color: st.color, fontWeight: 600 }}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button className="btn-secondary btn-sm" onClick={() => setBriefId(d.id)}>{d.brief ? 'Brief' : 'Get brief'}</button>
                  <button className={open ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} onClick={() => {
                    setOpenDeal(open ? null : d.id)
                    if (!open && d.status === 'new') setStatus(d, 'pursuing')
                  }}>
                    {open ? 'Close' : 'Find people'}
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => remove(d)} aria-label="Delete deal">×</button>
                </div>
              </div>
              {open && (
                <div style={{ padding: '0 16px 16px', background: 'var(--bg)' }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 0' }}>
                    Finance leaders at {d.company}. People you add are saved as client contacts linked to this deal and get the Client referral email.
                  </p>
                  <SearchApollo
                    key={d.id}
                    initialFirm={d.company}
                    initialTitles={clientTitles.join(', ')}
                    dealId={d.id}
                    autoSearch
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {briefId && deals.find(d => d.id === briefId) && (
        <DealBrief
          deal={deals.find(d => d.id === briefId)}
          onClose={() => setBriefId(null)}
          onUpdated={updated => setDeals(ds => ds.map(x => x.id === updated.id ? updated : x))}
        />
      )}
    </div>
  )
}

const lbl = { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }
