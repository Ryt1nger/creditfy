// Имитация распознавания документов для демо без бэкенда. В live-режиме числа читают настоящие парсеры PDF/XLSX/CSV.
// Значения берутся из тех же профилей, что и у генератора синтетических документов (backend/app/documents/samples.py).
import { SCENARIOS } from './registry'

export const FIELD_LABELS: Record<string, string> = {
  revenue_year: 'Выручка за год', net_profit_year: 'Чистая прибыль за год', monthly_turnover: 'Средние поступления на счёт в месяц',
  monthly_obligations: 'Платежи по кредитам в месяц', purchase_price: 'Стоимость покупки по счёту',
}
export const FIN_FIELDS = ['revenue_year', 'net_profit_year', 'monthly_turnover', 'monthly_obligations']
export const EXPECTED: Record<string, string[]> = { tax_return: ['revenue_year', 'net_profit_year'], bank_statement: ['monthly_turnover', 'monthly_obligations'], invoice: ['purchase_price'] }
const PROFILES: Record<string, [number, number, number, number]> = {
  strong: [60_000_000, 9_000_000, 5_000_000, 150_000], tight: [18_000_000, 1_800_000, 1_500_000, 25_000], gray: [9_000_000, 1_000_000, 400_000, 18_000],
  bad: [25_000_000, 900_000, 2_000_000, 40_000], liquidating: [12_000_000, 300_000, 950_000, 40_000], newco: [1_200_000, 100_000, 300_000, 0],
}
const profile = (inn: string): [number, number, number, number] => {
  const key = Object.entries(SCENARIOS).find(([, s]) => s.inn === inn)?.[0]
  if (key && PROFILES[key]) return PROFILES[key]
  const h = [...inn].reduce((s, c) => (s * 31 + Number(c)) % 1000, 7), rev = (60 + (h % 340)) * 100_000
  return [rev, Math.round(rev * 0.1), Math.round(rev / 12), h % 3 ? 15_000 : 0]
}
const ext = (n: string) => (n.toLowerCase().split('.').pop() ?? '')
const TITLE: Record<string, string> = { tax_return: 'Отчётность', bank_statement: 'Выписка по счёту', invoice: 'Счёт' }

export interface Ex { id: number; field: string; value: number; original_value: number; source: string; source_label: string; confidence: number; status: 'ok' | 'edited' | 'conflict' | 'confirmed'; note: string | null; application_id: number }
export function recognize(kind: string, filename: string, inn: string, amount: number, nid: () => number, appId: number): { items: Ex[]; status: string; note: string } {
  if (!EXPECTED[kind]) return { items: [], status: 'not_required', note: 'Распознавание для этого документа не требуется' }
  if (!['pdf', 'xlsx', 'csv'].includes(ext(filename))) return { items: [], status: 'not_available', note: 'Не удалось найти числа: загрузите текстовый PDF, XLSX или CSV либо введите значения на шаге проверки' }
  const [rev, prof, turn, obl] = profile(inn)
  const v: Record<string, number> = kind === 'tax_return' ? { revenue_year: rev, net_profit_year: prof } : kind === 'bank_statement' ? { monthly_turnover: turn, monthly_obligations: obl } : { purchase_price: Math.max(500_000, Math.round((amount * 1.1) / 10_000) * 10_000) }
  const label = (f: string) => ({ revenue_year: 'строка 2110 «Выручка»', net_profit_year: 'строка 2400 «Чистая прибыль»', monthly_turnover: '«Среднемесячные поступления»', monthly_obligations: '«Платежи по кредитам в месяц»', purchase_price: '«Итого к оплате»' }[f] ?? f)
  const items = Object.entries(v).map(([f, value]) => ({ id: nid(), field: f, value, original_value: value, source: 'mock', source_label: `${TITLE[kind]}, ${label(f)} (${filename})`, confidence: 0.9, status: 'ok' as const, note: null, application_id: appId }))
  return { items, status: 'ok', note: 'Значения подставлены из примера' }
}

type AppLike = { documents: { status: string; extractions?: Ex[] }[]; financials: Record<string, number | null> }
export function active(a: AppLike): Record<string, Ex> {
  const out: Record<string, Ex> = {}
  for (const d of a.documents) { if (d.status === 'rejected') continue; for (const x of d.extractions ?? []) if (!out[x.field] || x.id > out[x.field].id) out[x.field] = x }
  return out
}
export const conflictRatio = (t?: number | null, r?: number | null) => (!t || !r || r <= 0 ? null : Math.abs(t * 12 - r) / r)
const n0 = (x: number) => new Intl.NumberFormat('ru-RU').format(x).replace(/\s/g, ' ')
export function recheck(a: AppLike) {
  const ex = active(a), t = ex.monthly_turnover, r = ex.revenue_year, ratio = conflictRatio(t?.value, r?.value)
  for (const x of [t, r]) {
    if (!x) continue
    if (ratio != null && ratio > 0.35) { if (x.status !== 'confirmed') { x.status = 'conflict'; x.note = `Поступления ×12 = ${n0(t!.value * 12)} ₽ расходятся с выручкой ${n0(r!.value)} ₽ на ${Math.round(ratio * 100)}%. Исправьте значение или подтвердите, что оно верно.` } }
    else if (x.status === 'conflict' || x.status === 'confirmed') { x.status = x.value !== x.original_value ? 'edited' : 'ok'; x.note = null }
  }
}
export const hasConflicts = (a: AppLike) => Object.values(active(a)).some((x) => x.status === 'conflict')
export function reviewFields(a: AppLike) {
  const ex = active(a)
  return FIN_FIELDS.map((f) => {
    const x = ex[f], val = a.financials[f] ?? null
    if (x && val === x.value) return { field: f, label: FIELD_LABELS[f], value: val, source: x.source, source_label: x.source_label, extraction_id: x.id, status: x.status, note: x.note }
    if (val != null) return { field: f, label: FIELD_LABELS[f], value: val, source: 'client', source_label: 'Введено вами', extraction_id: x?.id ?? null, status: x ? 'edited' : 'ok', note: null }
    return { field: f, label: FIELD_LABELS[f], value: null, source: null, source_label: 'Нет данных — заполните', extraction_id: null, status: 'missing', note: null }
  })
}
export function editExtraction(a: AppLike, x: Ex, value: number | null | undefined, confirm: boolean) {
  if (value != null && value !== x.value) { x.value = value; x.status = 'edited'; if (FIN_FIELDS.includes(x.field)) a.financials = { ...a.financials, [x.field]: value } }
  recheck(a)
  if (confirm && x.status === 'conflict') for (const y of Object.values(active(a))) if (y.status === 'conflict') y.status = 'confirmed'
}
export function dropDocNumbers(a: AppLike, d: { extractions?: Ex[] }) {
  const fin = { ...a.financials }; for (const x of d.extractions ?? []) if (fin[x.field] === x.value) delete fin[x.field]; a.financials = fin
}
