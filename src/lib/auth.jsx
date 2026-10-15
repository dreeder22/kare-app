/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
        setSetupNeeded(false)
        return data.user
      }
      setUser(null)
      // Check whether this is a first run (no users exist yet).
      try {
        const s = await fetch('/api/auth/setup', { credentials: 'include' })
        if (s.ok) {
          const sd = await s.json()
          setSetupNeeded(!!sd.needed)
        }
      } catch { /* ignore */ }
      return null
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const login = useCallback(async ({ email, password, name, setup }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, setup })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Login failed')
    setUser(data.user)
    setSetupNeeded(false)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch { /* ignore */ }
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, setupNeeded, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
