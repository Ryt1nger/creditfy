import { GRADE_PREMIUM, PRODUCTS } from './products'
export const MIN_DSCR = 1.25
export const annuity = (a: number, t: number, rate: number) => { const r = rate / 1200; return r === 0 ? a / t : (a * r) / (1 - (1 + r) ** -t) }
export function rateFor(code: string, grade: string, collateral: boolean) {
  const p = PRODUCTS[code]; let r = p.base_rate + (GRADE_PREMIUM[grade] ?? 5); if (collateral && p.allows_collateral && !p.public_conditions) r -= 1
  return Math.round(r * 100) / 100
}
export function availableCash(fin: { net_profit_year?: number | null; monthly_obligations?: number | null }, bkiMonthly: number) {
  const cash = Math.max(0, ((fin.net_profit_year ?? 0) / 12) * 1.15)
  const obligations = Math.max(fin.monthly_obligations ?? 0, bkiMonthly)
  return { cash, obligations, free: Math.max(0, cash - obligations) }
}
export const dscr = (a: number, t: number, rate: number, free: number) => { const p = annuity(a, t, rate); return p > 0 ? Math.round((free / p) * 100) / 100 : 0 }
export interface OfferCalc { kind: 'initial' | 'counter'; amount: number; term_months: number; rate: number; monthly_payment: number; total_payment: number; fee: number; dscr: number; explanation: string }
const build = (code: string, a: number, t: number, rate: number, free: number, kind: OfferCalc['kind'], explanation: string): OfferCalc => {
  const p = annuity(a, t, rate)
  return { kind, amount: a, term_months: t, rate, monthly_payment: Math.round(p), total_payment: Math.round(p * t), fee: Math.round((a * PRODUCTS[code].fee_pct) / 100), dscr: dscr(a, t, rate, free), explanation }
}
const space = (n: number) => new Intl.NumberFormat('ru-RU').format(n).replace(/ /g, ' ')
/** Поиск решения: сначала растягиваем срок при той же сумме, затем уменьшаем сумму. */
export function findOffer(code: string, amount: number, term: number, grade: string, collateral: boolean, free: number): OfferCalc | null {
  const p = PRODUCTS[code]; const rate = rateFor(code, grade, collateral)
  amount = Math.min(Math.max(amount, p.min_amount), p.max_amount); term = Math.min(Math.max(term, p.min_term), p.max_term)
  if (dscr(amount, term, rate, free) >= MIN_DSCR) return build(code, amount, term, rate, free, 'initial', 'Запрошенные условия подтверждены.')
  let a = amount
  while (a >= p.min_amount) {
    for (let t = term; t <= p.max_term; t += p.max_term > p.min_term ? 3 : 1) {
      if (dscr(a, t, rate, free) >= MIN_DSCR) {
        const ch: string[] = []
        if (t !== term) ch.push(`срок увеличен с ${term} до ${t} мес.`)
        if (a !== amount) ch.push(`сумма уменьшена с ${space(amount)} до ${space(a)} ₽`)
        return build(code, a, t, rate, free, 'counter', `Платёж по запрошенным условиям занимает слишком большую часть свободного денежного потока (нужно покрытие не ниже ${MIN_DSCR}). Подобрали ближайшие подходящие условия: ${ch.join(', ')}.`)
      }
    }
    const nxt = Math.floor((a * 0.95) / 10000) * 10000
    if (nxt >= a) break
    a = nxt
  }
  return null
}
export function schedule(amount: number, term: number, rate: number, start: Date) {
  const pay = annuity(amount, term, rate); let bal = amount; const r = rate / 1200
  return Array.from({ length: term }, (_, i) => {
    const n = i + 1, interest = bal * r, principal = n < term ? pay - interest : bal; bal = Math.max(0, bal - principal)
    const d = new Date(start.getFullYear(), start.getMonth() + n, Math.min(start.getDate(), 28))
    return { n, date: d.toISOString().slice(0, 10), payment: Math.round(principal + interest), principal: Math.round(principal), interest: Math.round(interest), balance: Math.round(bal) }
  })
}
