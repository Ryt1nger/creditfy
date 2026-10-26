import { beforeEach, describe, expect, it, vi } from 'vitest'

let engine: typeof import('./engine')
beforeEach(async () => {
  vi.resetModules()
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) })
  engine = await import('./engine')
  engine.initEngine()
})
const req = (method: string, path: string, body?: unknown, token: string | null = null) => engine.mockRequest(method, path, body, token)

describe('authentication and API parity', () => {
  it('registers, restores state and logs in again with normalized email', async () => {
    const r = await req('POST', '/auth/register', { name: 'New User', email: 'New@Example.test ', password: 'password1' }) as any
    expect((await req('GET', '/me', undefined, r.token) as any).email).toBe('new@example.test')
    engine.initEngine()
    const login = await req('POST', '/auth/login', { email: ' NEW@example.test ', password: 'password1' }) as any
    expect(login.user.id).toBe(r.user.id)
    await expect(req('POST', '/auth/login', { email: 'new@example.test', password: 'wrong' })).rejects.toMatchObject({ status: 401 })
  })
  it('does not register bank roles', async () => {
    for (const role of ['bank', 'underwriter', 'operator']) {
      await expect(req('POST', '/auth/register', { name: 'New User', email: 'new@example.test', password: 'password1', role })).rejects.toMatchObject({ status: 422 })
    }
  })
  it('opens a seeded client and protects bank routes', async () => {
    const r = await req('POST', '/auth/demo', {}) as any
    expect((await req('GET', '/me', undefined, r.token) as any).role).toBe('client')
    expect((await req('GET', '/applications', undefined, r.token) as any[]).length).toBe(3)
    await expect(req('GET', '/bank/applications', undefined, r.token)).rejects.toMatchObject({ status: 403 })
    await expect(req('POST', '/auth/demo', { role: 'bank' })).rejects.toMatchObject({ status: 422 })
  })
  it('validates calculator bounds and rejects overdraft annuity', async () => {
    const { token } = await req('POST', '/auth/demo', {}) as any
    for (const body of [{ product_code: 'working_capital', amount: 99000000, term_months: 24 }, { product_code: 'overdraft', amount: 300000, term_months: 12 }]) {
      await expect(req('POST', '/calculator', body, token)).rejects.toMatchObject({ status: 422 })
    }
  })
  it('reports the actual rule based mode', async () => {
    const status = await req('GET', '/ai/status') as any
    expect(status.generative_model_active).toBe(false)
    expect(status.mode).toBe('rules')
    expect(status).not.toHaveProperty('planned_model')
    expect(status).not.toHaveProperty('model')
  })
})
