export type FinField = 'revenue_year' | 'net_profit_year' | 'monthly_turnover' | 'monthly_obligations'
export interface Found { field: FinField; value: number; label: string }
export const FIN_LABEL: Record<FinField, string> = { revenue_year: 'Выручка за год', net_profit_year: 'Чистая прибыль за год', monthly_turnover: 'Средний оборот в месяц', monthly_obligations: 'Платежи по кредитам в месяц' }
const r = (x: number, s = 50_000) => Math.round(x / s) * s
/** Имитация распознавания: значения выводятся детерминированно из суммы заявки и ИНН. Реального OCR нет. */
export function recognize(kind: string, filename: string, ctx: { amount: number; inn: string }): Found[] {
  const k = 0.9 + ([...ctx.inn].reduce((s, c) => s + Number(c || 0), 0) % 5) * 0.05
  const revenue = r(Math.max(ctx.amount * 5, 6_000_000) * k, 100_000)
  if (kind === 'tax_return') return [
    { field: 'revenue_year', value: revenue, label: 'отчётность' },
    { field: 'net_profit_year', value: r(revenue * 0.14, 10_000), label: 'отчётность' },
  ]
  if (kind === 'bank_statement') return [{ field: 'monthly_turnover', value: r((revenue / 12) * (/conflict|расхожд/i.test(filename) ? 0.5 : 1.03), 10_000), label: 'выписка по счёту' }]
  return []
}
