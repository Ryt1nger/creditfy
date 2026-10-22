export const rub = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/ /g, ' ') + ' ₽'
export const num = (n: number) => new Intl.NumberFormat('ru-RU').format(n).replace(/ /g, ' ')
export const pct = (n: number) => `${n.toFixed(n % 1 ? 1 : 0).replace('.', ',')}%`
export const dt = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
export const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
export function months(n: number) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return `${n} месяц`
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} месяца`
  return `${n} месяцев`
}
export function age(m?: number) {
  if (m == null) return '—'
  const y = Math.floor(m / 12), r = m % 12
  return [y ? `${y} г.` : '', r ? `${r} мес.` : ''].filter(Boolean).join(' ') || '0 мес.'
}
export const fileSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`)
