import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { ApplicationDetail, ApplicationSummary, Notification, Product, Stats, DemoInn } from './types'

export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('GET', '/products'), staleTime: Infinity })
export const useDemoInns = () => useQuery({ queryKey: ['demo-inns'], queryFn: () => api<DemoInn[]>('GET', '/demo/inns'), staleTime: Infinity, retry: false })
export const useMyApps = () =>
  useQuery({ queryKey: ['apps'], queryFn: () => api<ApplicationSummary[]>('GET', '/applications'), refetchInterval: (q) => (q.state.data?.some((a) => a.processing) ? 1500 : 8000) })
export const useApp = (id: number | string, bank = false) =>
  useQuery({
    queryKey: ['app', String(id), bank], queryFn: () => api<ApplicationDetail>('GET', `${bank ? '/bank' : ''}/applications/${id}`),
    refetchInterval: (q) => (q.state.data?.processing ? 1200 : 6000),
  })
export const useBankApps = (group: string, q: string) =>
  useQuery({ queryKey: ['bank-apps', group, q], queryFn: () => api<ApplicationSummary[]>('GET', `/bank/applications?group=${group}&q=${encodeURIComponent(q)}`), refetchInterval: 4000 })
export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('GET', '/bank/stats'), refetchInterval: 8000 })
export const useNotifications = () => useQuery({ queryKey: ['notifications'], queryFn: () => api<Notification[]>('GET', '/notifications'), refetchInterval: 5000 })

export function useAct<T = ApplicationDetail>(appId: number, bank = false) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ method, path, body }: { method: string; path: string; body?: unknown }) => api<T>(method, path, body),
    onSuccess: (d: any) => {
      if (d?.id) qc.setQueryData(['app', String(appId), bank], d)
      qc.invalidateQueries({ queryKey: ['apps'] }); qc.invalidateQueries({ queryKey: ['bank-apps'] }); qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}
