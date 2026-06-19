import { useEffect } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Dashboard from './pages/Dashboard'
import Contacts from './pages/Contacts'
import EmailStudio from './pages/EmailStudio'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Login from './pages/Login'

function Layout() {
  const { user, signOut } = useAuth()
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL

  useEffect(() => {
    // Initialize user defaults in Supabase on first login
    import('./api/client.js').then(({ getMe }) => getMe().catch(() => {}))
  }, [user?.id])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={sidebar}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 32, letterSpacing: '-0.3px' }}>
          Recruiting Bot
        </div>
        {[
          { to: '/', label: 'Dashboard' },
          { to: '/contacts', label: 'Contacts' },
          { to: '/studio', label: 'Email Studio' },
          { to: '/settings', label: 'Settings' },
        ].map(({ to, label }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
            ...navLink,
            background: isActive ? 'var(--surface2)' : 'transparent',
            color: isActive ? 'var(--text)' : 'var(--muted)',
          })}>
            {label}
          </NavLink>
        ))}
        {user?.email === adminEmail && (
          <NavLink to="/admin" style={({ isActive }) => ({
            ...navLink,
            background: isActive ? 'var(--surface2)' : 'transparent',
            color: isActive ? 'var(--text)' : 'var(--muted)',
          })}>
            Admin
          </NavLink>
        )}
        <div style={{ marginTop: 'auto' }}>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
          <button className="btn-secondary btn-sm" onClick={signOut} style={{ width: '100%' }}>Sign Out</button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: '32px 28px', maxWidth: 1100, overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/studio" element={<EmailStudio />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
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
