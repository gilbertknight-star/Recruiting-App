import { useState } from 'react'
import { inviteUser } from '../api/client'

export default function Admin() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleInvite(e) {
    e.preventDefault()
    setMsg('')
    setError('')
    setLoading(true)
    try {
      await inviteUser(email)
      setMsg(`Invite sent to ${email}`)
      setEmail('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Admin</h1>

      <div className="card" style={{ maxWidth: 440 }}>
        <h3 style={{ fontWeight: 500, marginBottom: 4 }}>Invite a User</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          They'll receive an email to set their password and access the app.
        </p>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="teammate@email.com"
            required
          />
          <button className="btn-primary" type="submit" disabled={loading} style={{ whiteSpace: 'nowrap' }}>
            {loading ? 'Sending…' : 'Send Invite'}
          </button>
        </form>
        {msg && <p style={{ color: 'var(--green)', fontSize: 13, marginTop: 10 }}>{msg}</p>}
        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>
    </div>
  )
}
