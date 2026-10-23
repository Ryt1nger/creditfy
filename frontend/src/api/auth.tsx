import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from './client'
import type { Me } from './types'

interface Ctx { me: Me | null; ready: boolean; login: (email: string, password: string) => Promise<Me>; register: (name: string, email: string, password: string, role: 'client' | 'bank') => Promise<Me>; logout: () => void; enter: (token: string, user: Me) => void }
const AuthCtx = createContext<Ctx>(null as any)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null); const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!getToken()) { setReady(true); return }
    api<Me>('GET', '/me').then(setMe).catch(() => setToken(null)).finally(() => setReady(true))
  }, [])
  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: Me }>('POST', '/auth/login', { email, password }); setToken(r.token); setMe(r.user); return r.user
  }, [])
  const register = useCallback(async (name: string, email: string, password: string, role: 'client' | 'bank') => {
    const r = await api<{ token: string; user: Me }>('POST', '/auth/register', { name, email, password, role }); setToken(r.token); setMe(r.user); return r.user
  }, [])
  const enter = useCallback((token: string, user: Me) => { setToken(token); setMe(user) }, [])
  const logout = useCallback(() => { setToken(null); setMe(null) }, [])
  return <AuthCtx.Provider value={{ me, ready, login, register, logout, enter }}>{children}</AuthCtx.Provider>
}
