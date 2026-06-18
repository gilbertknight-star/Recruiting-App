import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Contacts from './pages/Contacts'
import EmailStudio from './pages/EmailStudio'
import Settings from './pages/Settings'

export default function App() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={sidebar}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 32, letterSpacing: '-0.3px' }}>
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
      </nav>
      <main style={{ flex: 1, padding: '32px 28px', maxWidth: 1100 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/studio" element={<EmailStudio />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

const sidebar = {
  width: 200, background: 'var(--surface)', borderRight: '1px solid var(--border)',
  padding: '28px 16px', display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0,
}
const navLink = {
  display: 'block', padding: '8px 12px', borderRadius: 'var(--radius)',
  fontSize: 14, fontWeight: 500, transition: 'background 0.1s, color 0.1s',
}
