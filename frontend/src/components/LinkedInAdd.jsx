import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apolloLinkedIn, createContact } from '../api/client'

export default function LinkedInAdd() {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmCredit, setConfirmCredit] = useState(false)
  const [manual, setManual] = useState(null)
  const [manualSaved, setManualSaved] = useState(false)

  async function lookup(useCredit = false) {
    if (!url.trim()) { setError('Paste a LinkedIn profile link first.'); return }
    setError('')
    setLoading(true)
    setConfirmCredit(false)
    setManualSaved(false)
    try {
      const res = await apolloLinkedIn(url.trim(), useCredit)
      setResult(res)
      setManual(res.source === 'not_found' ? { name: res.guess.name, firm: '', title: '', linkedin_url: res.guess.linkedin_url } : null)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  async function addWithoutEmail(e) {
    e.preventDefault()
    if (!manual.name.trim()) { setError('Enter their name.'); return }
    await createContact({ ...manual, name: manual.name.trim(), email: '', notes: 'Added from LinkedIn (no email yet)' })
    setManualSaved(true)
  }

  const person = result?.person || result?.contact

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <form className="card" onSubmit={e => { e.preventDefault(); lookup(false) }} style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>LinkedIn profile link</label>
          <input
            value={url}
            onChange={e => { setUrl(e.target.value); setError(''); setResult(null) }}
            placeholder="https://www.linkedin.com/in/hannah-kelso/"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Looking up…' : 'Look up'}</button>
      </form>
      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: -8 }}>{error}</p>}

      {result && person && (
        <div className="card" style={{ borderColor: result.source === 'contacts' ? 'var(--border)' : 'var(--green)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            {result.source === 'contacts' && 'Already in your Contacts — nothing added.'}
            {result.source === 'saved' && (result.added ? 'Found in your saved Apollo contacts and added to Contacts. No credits used.' : 'Found in your saved Apollo contacts.')}
            {result.source === 'apollo' && (result.added ? 'Found with Apollo (1 credit) and added to Contacts.' : 'Found with Apollo (1 credit).')}
          </div>
          <div style={{ fontWeight: 600 }}>{person.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>{[person.title, person.firm].filter(Boolean).join(' · ')}</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{person.email || <span style={{ color: 'var(--muted)' }}>No email found</span>}</div>
          {result.skipped > 0 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Someone with that email is already in Contacts, so it wasn't added again.</div>}
          {result.no_email?.length > 0 && <div style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 6 }}>Apollo has no email for them, so they weren't added.</div>}
          <Link to="/contacts" style={{ display: 'inline-block', marginTop: 10, color: 'var(--accent)', fontSize: 13 }}>Go to Contacts →</Link>
        </div>
      )}

      {result?.source === 'not_found' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13 }}>
            {result.credit_tried
              ? "Apollo couldn't find this profile either."
              : "Not in your Contacts or your saved Apollo contacts."}
          </div>

          {!result.credit_tried && (
            result.credits_enabled ? (
              confirmCredit ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>Use 1 Apollo credit to get their email?</span>
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmCredit(false)}>Cancel</button>
                  <button className="btn-primary btn-sm" onClick={() => lookup(true)} disabled={loading}>{loading ? 'Looking up…' : 'Confirm'}</button>
                </div>
              ) : (
                <div><button className="btn-primary btn-sm" onClick={() => setConfirmCredit(true)}>Find email with Apollo (1 credit)</button></div>
              )
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Paid lookups are off, so no credit was used. Set APOLLO_ALLOW_CREDITS=true in backend/.env to look them up with Apollo.
              </div>
            )
          )}

          {manual && (
            <form onSubmit={addWithoutEmail} style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Or add them without an email</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={lbl}>Name</label>
                  <input value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Firm</label>
                  <input value={manual.firm} onChange={e => setManual(m => ({ ...m, firm: e.target.value }))} placeholder="Lazard" />
                </div>
                <div>
                  <label style={lbl}>Title</label>
                  <input value={manual.title} onChange={e => setManual(m => ({ ...m, title: e.target.value }))} placeholder="Investment Banking Analyst" />
                </div>
                <button type="submit" className="btn-secondary" disabled={manualSaved}>{manualSaved ? 'Added' : 'Add contact'}</button>
              </div>
              {manualSaved && (
                <div style={{ fontSize: 12, color: 'var(--green)' }}>
                  Added to Contacts with their LinkedIn. Add an email there before sending. <Link to="/contacts" style={{ color: 'var(--accent)' }}>Go to Contacts →</Link>
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  )
}

const lbl = { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }
