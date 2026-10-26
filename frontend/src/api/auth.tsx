import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getToken, setToken } from './client'
import type { Me } from './types'

interface Ctx {
  me: Me | null; ready: boolean
  login: (email: string, password: string) => Promise<Me>
  register: (name: string, email: string, password: string, role?: 'client') => Promise<Me>
  demo: () => Promise<Me>; logout: () => void
  enter: (token: string, user?: Me) => Promise<Me>
}
const AuthCtx = createContext<Ctx>(null as any)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [me, setMe] = useState<Me | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const token = getToken()
    if (!token) { setReady(true); return }
    let active = true
    api<Me>('GET', '/me').then((user) => { if (active && getToken() === token) setMe(user) })
      .catch(() => { if (active && getToken() === token) setToken(null) })
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const expired = () => { setMe(null); void qc.cancelQueries(); qc.clear() }
    window.addEventListener('creditfy:session-expired', expired)
    return () => window.removeEventListener('creditfy:session-expired', expired)
  }, [qc])
  const enter = useCallback(async (token: string) => {
    await qc.cancelQueries(); qc.clear(); setMe(null); setToken(token)
    try {
      const user = await api<Me>('GET', '/me')
      setMe(user); return user
    } catch (e) { setToken(null); throw e }
  }, [qc])
  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string }>('POST', '/auth/login', { email: email.trim().toLowerCase(), password })
    return enter(r.token)
  }, [enter])
  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await api<{ token: string }>('POST', '/auth/register', { name: name.trim(), email: email.trim().toLowerCase(), password, role: 'client' })
    return enter(r.token)
  }, [enter])
  const demo = useCallback(async () => {
    const r = await api<{ token: string }>('POST', '/auth/demo', {})
    return enter(r.token)
  }, [enter])
  const logout = useCallback(() => {
    setToken(null); setMe(null); void qc.cancelQueries(); qc.clear()
  }, [qc])
  return <AuthCtx.Provider value={{ me, ready, login, register, demo, logout, enter }}>{children}</AuthCtx.Provider>
}
