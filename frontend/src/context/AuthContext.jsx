import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const DEV_USER = { id: 'dev-user', email: 'dev@dev.com' }

export function isDevMode() {
  return localStorage.getItem('devMode') === 'true'
}

export function AuthProvider({ children }) {
  const devMode = isDevMode()
  const [user, setUser] = useState(devMode ? DEV_USER : null)
  const [loading, setLoading] = useState(!devMode)

  useEffect(() => {
    if (devMode) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function getToken() {
    if (devMode) return 'dev-token'
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
