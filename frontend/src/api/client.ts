import { initEngine, mockRequest, ApiError as MockError } from '../mock/engine'

export const MODE: 'mock' | 'live' = (import.meta.env.VITE_API_MODE as string) === 'live' ? 'live' : 'mock'
export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
const TOKEN = 'creditfy.token'
export const getToken = () => { try { return sessionStorage.getItem(TOKEN) } catch { return null } }
export const setToken = (t: string | null) => { try { t ? sessionStorage.setItem(TOKEN, t) : sessionStorage.removeItem(TOKEN) } catch { /* ignore */ } }
if (MODE === 'mock') initEngine()

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  if (MODE === 'mock') {
    try { return (await mockRequest(method, path, body, getToken())) as T } catch (e) { if (e instanceof MockError) throw new ApiError(e.status, e.message); throw e }
  }
  let res: Response
  try {
    res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch { throw new ApiError(0, 'Нет связи с сервером. Проверьте интернет и повторите.') }
  if (!res.ok) {
    let msg = 'Что-то пошло не так'
    try { const j = await res.json(); msg = typeof j.detail === 'string' ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: any) => d.msg).join('; ') : msg } catch { /* ignore */ }
    throw new ApiError(res.status, msg)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export async function uploadDocument(appId: number, kind: string, file: File) {
  if (file.size > 5 * 1024 * 1024) throw new ApiError(413, 'Файл больше 5 МБ')
  if (MODE === 'mock') return api('POST', `/applications/${appId}/documents`, { kind, filename: file.name, size: file.size })
  const fd = new FormData(); fd.append('kind', kind); fd.append('file', file)
  const res = await fetch(`/api/applications/${appId}/documents`, { method: 'POST', headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, body: fd })
  if (!res.ok) { let m = 'Не удалось загрузить файл'; try { m = (await res.json()).detail ?? m } catch { /* ignore */ } throw new ApiError(res.status, m) }
  return res.json()
}
