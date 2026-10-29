import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth, isDevMode } from './context/AuthContext'

function exitDevMode() {
  localStorage.removeItem('devMode')
  window.location.reload()
}
import Dashboard from './pages/Dashboard'
import Contacts from './pages/Contacts'
import FindPeople from './pages/FindPeople'
import Deals from './pages/Deals'
import ClientDashboard from './pages/ClientDashboard'
import Calendar from './pages/Calendar'
import EmailStudio from './pages/EmailStudio'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Login from './pages/Login'

function Layout() {
  const { user, signOut } = useAuth()
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
  const devMode = isDevMode()
  const [testMode, setTestMode] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const side = location.pathname.startsWith('/client') ? 'client' : 'banker'

  function switchSide(next) {
    if (next !== side) navigate(next === 'client' ? '/client' : '/')
  }

  useEffect(() => {
    import('./api/client.js').then(({ getMe, getSettings }) => {
      getMe().catch(() => {})
      getSettings().then(s => setTestMode(!!s?.test_mode)).catch(() => {})
    })
  }, [user?.id])

  async function toggleTestMode() {
    const { updateSettings } = await import('./api/client.js')
    const next = !testMode
    await updateSettings({ test_mode: next })
    setTestMode(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {devMode && (
        <div style={{ background: '#dc2626', color: '#fff', textAlign: 'center', padding: '6px 0', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', flexShrink: 0 }}>
          DEV MODE — no data is saved, no emails are sent
        </div>
      )}
      {testMode && !devMode && (
        <div style={{ background: 'var(--yellow)', color: '#1a1d27', textAlign: 'center', padding: '6px 0', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', flexShrink: 0 }}>
          TEST MODE — every email goes to {user?.email} instead of the contact. Contacts are not marked as sent.
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <nav style={sidebar}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 32, letterSpacing: '-0.3px' }}>
          Ducks In a Row
        </div>
        <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 3, marginBottom: 16 }}>
          {[['banker', 'Bankers'], ['client', 'Clients']].map(([key, label]) => (
            <button key={key} className="btn-sm" onClick={() => switchSide(key)} style={{
              flex: 1, background: side === key ? (key === 'client' ? '#f97316' : 'var(--accent)') : 'transparent',
              color: side === key ? '#fff' : 'var(--muted)', fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>
        {(side === 'client' ? [
          { to: '/client', label: 'Dashboard' },
          { to: '/client/deals', label: 'Deals' },
          { to: '/client/contacts', label: 'Client Contacts' },
          // Client-side copies of shared pages, so opening them doesn't flip the sidebar back to Bankers
          { to: '/client/calendar', label: 'Calendar' },
          { to: '/client/studio', label: 'Email Studio' },
        ] : [
          { to: '/', label: 'Dashboard' },
          { to: '/contacts', label: 'Contacts' },
          { to: '/find', label: 'Find People' },
          { to: '/calendar', label: 'Calendar' },
          { to: '/studio', label: 'Email Studio' },
          { to: '/settings', label: 'Settings' },
        ]).map(({ to, label }) => (
          <NavLink key={to} to={to} end={to === '/' || to === '/client'} style={({ isActive }) => ({
            ...navLink,
            background: isActive ? 'var(--surface2)' : 'transparent',
            color: isActive ? 'var(--text)' : 'var(--muted)',
          })}>
            {label}
          </NavLink>
        ))}
        {side === 'banker' && user?.email === adminEmail && (
          <NavLink to="/admin" style={({ isActive }) => ({
            ...navLink,
            background: isActive ? 'var(--surface2)' : 'transparent',
            color: isActive ? 'var(--text)' : 'var(--muted)',
          })}>
            Admin
          </NavLink>
        )}
        <div style={{ marginTop: 'auto' }}>
          {!devMode && (
            <button
              className="btn-sm"
              onClick={toggleTestMode}
              style={{
                width: '100%', marginBottom: 12,
                background: testMode ? 'var(--yellow)' : 'var(--surface2)',
                color: testMode ? '#1a1d27' : 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              {testMode ? 'Test Mode: ON' : 'Test Mode: OFF'}
            </button>
          )}
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
          {devMode
            ? <button className="btn-secondary btn-sm" onClick={exitDevMode} style={{ width: '100%' }}>Exit Dev Mode</button>
            : <button className="btn-secondary btn-sm" onClick={signOut} style={{ width: '100%' }}>Sign Out</button>
          }
        </div>
      </nav>
      <main style={{ flex: 1, padding: '32px 28px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/find" element={<FindPeople />} />
          <Route path="/client" element={<ClientDashboard />} />
          <Route path="/client/deals" element={<Deals />} />
          <Route path="/client/contacts" element={<Contacts side="client" />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/studio" element={<EmailStudio />} />
          <Route path="/client/calendar" element={<Calendar />} />
          <Route path="/client/studio" element={<EmailStudio key="client" side="client" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
      </div>
    </div>
  )
}

function ProtectedApp() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Loading…</div>
  if (!user) return <Login />
  return <Layout />
}

export default function App() {
  return (
    <AuthProvider>
      <ProtectedApp />
    </AuthProvider>
  )
}

const sidebar = {
  width: 200, background: 'var(--surface)', borderRight: '1px solid var(--border)',
  padding: '28px 16px', display: 'flex', flexDirection: 'column', gap: 2,
  flexShrink: 0, height: '100vh', position: 'sticky', top: 0,
}
const navLink = {
  display: 'block', padding: '8px 12px', borderRadius: 'var(--radius)',
  fontSize: 14, fontWeight: 500, transition: 'background 0.1s, color 0.1s',
}
