import { useState } from 'react'
import { addDeal, extractDealFromLink } from '../api/client'

const TYPES = ['M&A sell-side', 'M&A buy-side', 'IPO', 'Equity financing', 'Debt financing', 'Restructuring', 'Other']
const EMPTY = { bank: '', company: '', counterparty: '', deal_type: 'M&A sell-side', bank_role: '', announced_date: '', summary: '', source_url: '' }

/** Add a deal yourself, optionally pre-filled by having Claude read a press release link. */
export default function AddDealForm({ defaultBank = '', onAdded, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY, bank: defaultBank })
  const [link, setLink] = useState('')
  const [reading, setReading] = useState(false)
  const [otherBanks, setOtherBanks] = useState([])
  const [error, setError] = useState('')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); setError('') }

  async function fillFromLink() {
    if (!link.trim()) { setError('Paste a link first.'); return }
    setReading(true)
    setError('')
    try {
      const d = await extractDealFromLink(link.trim())
      setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(d).filter(([k, v]) => k in EMPTY && v)) }))
      setOtherBanks(d.other_banks || [])
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setReading(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    if (!form.bank.trim() || !form.company.trim()) { setError('Enter the bank and the company.'); return }
    try {
      onAdded(await addDeal({ ...form, announced_date: form.announced_date || null }))
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    }
  }

  return (
    <form className="card" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>Add a deal</span>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Fill from a link (press release, SEC filing or article), optional</label>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.businesswire.com/news/home/..." />
        </div>
        <button type="button" className="btn-secondary" onClick={fillFromLink} disabled={reading}>
          {reading ? 'Reading…' : 'Fill from link (~$0.05)'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div><label style={lbl}>Bank *</label><input value={form.bank} onChange={e => set('bank', e.target.value)} placeholder="Citi" /></div>
        <div><label style={lbl}>Company the bank advised *</label><input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Atkore Inc." /></div>
        <div><label style={lbl}>Other party</label><input value={form.counterparty} onChange={e => set('counterparty', e.target.value)} placeholder="Buyer or target" /></div>
        <div>
          <label style={lbl}>Deal type</label>
          <select value={form.deal_type} onChange={e => set('deal_type', e.target.value)}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Bank's role</label><input value={form.bank_role} onChange={e => set('bank_role', e.target.value)} placeholder="financial advisor to the seller" /></div>
        <div><label style={lbl}>Announced</label><input type="date" value={form.announced_date} onChange={e => set('announced_date', e.target.value)} /></div>
      </div>
      <div><label style={lbl}>Summary</label><input value={form.summary} onChange={e => set('summary', e.target.value)} placeholder="One sentence describing the deal" /></div>
      <div><label style={lbl}>Source link</label><input value={form.source_url} onChange={e => set('source_url', e.target.value)} placeholder="https://..." /></div>

      {otherBanks.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          Other banks on this deal: {otherBanks.join('; ')}. Add it again with a different bank to track it there too.
        </p>
      )}
      {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
      <div><button type="submit" className="btn-primary">Save deal</button></div>
    </form>
  )
}

const lbl = { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }
