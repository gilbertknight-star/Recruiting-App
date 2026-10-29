import { useState } from 'react'
import { getDealBrief } from '../api/client'

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

function List({ items }) {
  if (!items?.length) return <div style={{ fontSize: 13, color: 'var(--muted)' }}>Not found in public sources.</div>
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((x, i) => <li key={i} style={{ fontSize: 13 }}>{x}</li>)}
    </ul>
  )
}

/** AI briefing on one deal, with every source it used. Generated once, then saved. */
export default function DealBrief({ deal, onClose, onUpdated }) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const brief = deal.brief
  const sources = deal.brief_sources || []

  async function generate(refresh) {
    setConfirming(false)
    setBusy(true)
    setError('')
    try {
      onUpdated(await getDealBrief(deal.id, refresh))
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }} onClick={onClose}>
      <div style={{ width: 620, maxWidth: '95vw', height: '100%', overflowY: 'auto', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: 24 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{deal.bank} · {deal.deal_type}</div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{deal.company}</h2>
            {deal.announced_date && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Announced {new Date(`${deal.announced_date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>}
          </div>
          <button className="btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>

        {!brief && (
          <div className="card" style={{ marginTop: 16 }}>
            <p style={{ fontSize: 13 }}>{deal.summary}</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Get an AI brief: Claude searches coverage of this deal and writes up the terms, rationale, timeline, advisors and people involved, with links to every source. About $0.50; saved afterward so reopening it is free.
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              {confirming ? (
                <>
                  <span style={{ fontSize: 13 }}>Spend about $0.50 on this brief?</span>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
                  <button className="btn-primary btn-sm" onClick={() => generate(false)}>Generate</button>
                </>
              ) : (
                <button className="btn-primary btn-sm" disabled={busy} onClick={() => setConfirming(true)}>
                  {busy ? 'Researching… (about a minute)' : 'Generate brief'}
                </button>
              )}
            </div>
          </div>
        )}
        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}

        {brief && (
          <>
            <p style={{ fontSize: 15, fontWeight: 500, marginTop: 16 }}>{brief.headline}</p>
            <Section title="Overview"><p style={{ fontSize: 13 }}>{brief.overview}</p></Section>
            <Section title="Key terms"><List items={brief.terms} /></Section>
            <Section title="Why they did it"><p style={{ fontSize: 13 }}>{brief.rationale || 'Not found in public sources.'}</p></Section>
            <Section title="Timeline"><List items={brief.timeline} /></Section>
            <Section title="Advisors"><List items={brief.advisors} /></Section>
            <Section title="People involved"><List items={brief.people} /></Section>
            <Section title="Talking points for outreach"><List items={brief.talking_points} /></Section>
            <Section title={`Sources (${sources.length})`}>
              {sources.length === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>No source links were returned.</div> : (
                <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sources.map(s => (
                    <li key={s.url} style={{ fontSize: 13 }}>
                      <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{s.title || s.url}</a>
                      {s.cited && <span style={{ fontSize: 11, color: 'var(--green)', marginLeft: 6 }}>cited</span>}
                      <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                AI-written from the sources above{deal.brief_at ? ` on ${new Date(deal.brief_at).toLocaleDateString()}` : ''}. Check the sources before quoting anything.
              </span>
              <button className="btn-secondary btn-sm" disabled={busy} onClick={() => generate(true)}>{busy ? 'Researching…' : 'Refresh (~$0.50)'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
