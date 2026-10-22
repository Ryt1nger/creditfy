import type { ScoreFactor } from '../api/types'
import { PRODUCTS } from './products'
const sp = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g, ' ')
export const PD: Record<string, number> = { A: 0.015, B: 0.03, C: 0.06, D: 0.11, E: 0.25 }
export const gradeOf = (s: number) => (s >= 700 ? 'A' : s >= 620 ? 'B' : s >= 540 ? 'C' : s >= 460 ? 'D' : 'E')
export function scoreApplication(code: string, amount: number, collateral: boolean, fin: any, eg: any, bk: any, pb: any) {
  const prod = PRODUCTS[code]; const factors: ScoreFactor[] = []; const stops: { code: string; name: string }[] = []; const flags: string[] = []
  let pts = 500
  const add = (c: string, name: string, value: string, points: number, comment = '') => { pts += points; factors.push({ code: c, name, value, points, comment }) }
  const revenue = Math.max(1, fin.revenue_year ?? 0), profit = fin.net_profit_year ?? 0, turnover = fin.monthly_turnover ?? 0
  if (eg.status !== 'active') stops.push({ code: 'company_status', name: 'Компания ликвидируется или ликвидирована' })
  if (eg.age_months < 6) stops.push({ code: 'company_age', name: 'Бизнесу меньше 6 месяцев' })
  if (bk.max_overdue_days_24m > 90) stops.push({ code: 'credit_history', name: `Просрочка ${bk.max_overdue_days_24m} дн. за 24 месяца` })
  if (pb.tax_debt > 100000 && pb.tax_debt > 0.05 * revenue) stops.push({ code: 'tax_debt', name: `Налоговая задолженность ${sp(pb.tax_debt)} ₽` })
  const age = eg.age_months
  add('age', 'Возраст бизнеса', `${age} мес.`, age > 60 ? 60 : age > 36 ? 30 : age >= 12 ? 0 : -40)
  const ratio = amount / revenue
  add('amount_to_revenue', 'Сумма кредита к годовой выручке', `${Math.round(ratio * 100)}%`, ratio < 0.15 ? 40 : ratio < 0.3 ? 0 : ratio < 0.5 ? -30 : -80)
  const margin = profit / revenue
  add('margin', 'Рентабельность по чистой прибыли', `${(margin * 100).toFixed(1)}%`, margin < 0 ? -90 : margin < 0.05 ? -20 : margin < 0.15 ? 20 : 50)
  const od = bk.max_overdue_days_24m
  if (!bk.has_history) add('overdue', 'Просрочки по кредитам', 'нет истории', -30, 'Кредитной истории нет — оценить дисциплину нельзя')
  else {
    add('overdue', 'Просрочки по кредитам (24 мес.)', `${od} дн.`, od === 0 ? 40 : od <= 30 ? -50 : od <= 90 ? -120 : -200)
    add('history', 'Длина кредитной истории', `${bk.history_months} мес.`, bk.history_months >= 36 ? 20 : bk.history_months >= 12 ? 10 : -10)
  }
  add('tax_debt', 'Налоговая задолженность', `${sp(pb.tax_debt)} ₽`, pb.tax_debt === 0 ? 20 : -60)
  if (pb.risk_flags.length) { add('registry_flags', 'Риск-признаки в реестрах', pb.risk_flags.join(', '), -70); flags.push('Риск-признаки ФНС: ' + pb.risk_flags.join(', ')) }
  if (collateral && prod.allows_collateral) add('collateral', 'Предоставлен залог', 'да', 50)
  if (turnover > 0 && Math.abs(turnover * 12 - revenue) / revenue > 0.35) {
    add('consistency', 'Оборот по счёту расходится с заявленной выручкой', `${sp(turnover * 12)} против ${sp(revenue)}`, -40)
    flags.push('Оборот по счёту ×12 расходится с выручкой более чем на 35%')
  }
  const declared = fin.monthly_obligations ?? 0, bkiSum = bk.active_loans.reduce((s: number, l: any) => s + l.monthly_payment, 0)
  if (bkiSum > declared * 1.2 + 1000) flags.push(`В БКИ платежи по кредитам больше заявленных (${sp(bkiSum)} против ${sp(declared)} ₽/мес.)`)
  pts = Math.max(0, Math.min(1000, pts)); const grade = gradeOf(pts)
  const route = stops.length || grade === 'E' ? 'reject' : (grade === 'A' || grade === 'B') && !flags.length && amount <= prod.auto_limit ? 'auto_approve' : 'manual'
  return { score: pts, grade, pd: PD[grade], route: route as 'auto_approve' | 'manual' | 'reject', factors, stop_factors: stops, flags, model_version: 'scorecard-v1' }
}
