export interface Extracted { amount?: number; term?: number; form?: 'ООО' | 'ИП'; ageYears?: number }
const W: Record<string, number> = { один: 1, одного: 1, два: 2, двух: 2, три: 3, трёх: 3, трех: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 }
const n = (s: string) => (/^\d+$/.test(s) ? Number(s) : W[s.toLowerCase()])
/** Извлекает параметры из свободного текста (локальная имитация ИИ-разбора). */
export function parseNeed(text: string): Extracted {
  const t = text.toLowerCase().replace(/ /g, ' ')
  const out: Extracted = {}
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*(млн|миллион\w*|тыс\w*|к\b)/)
  if (m) { const v = parseFloat(m[1].replace(',', '.')); out.amount = Math.round(v * (m[2].startsWith('м') ? 1_000_000 : 1_000)) }
  else { m = t.match(/(\d{1,3}(?:\s\d{3}){1,3}|\d{5,9})\s*(?:₽|руб|р\b)?/); if (m) out.amount = Number(m[1].replace(/\s/g, '')) }
  m = t.match(/(\d+)\s*мес/); if (m) out.term = Number(m[1])
  else {
    m = t.match(/(?:на|срок\D{0,6})\s*(\d+|один|два|три|четыре|пять|шесть|семь|восемь|девять|десять)\s*(?:год|лет)/)
    if (m) out.term = (n(m[1]) ?? 1) * 12
    else if (/полгода/.test(t)) out.term = 6
    else if (/на год\b/.test(t)) out.term = 12
  }
  if (/\bооо\b/.test(t)) out.form = 'ООО'; else if (/\bип\b|индивидуальн/.test(t)) out.form = 'ИП'
  m = t.match(/(?:работа\w*|существу\w*|на рынке|в бизнесе)\D{0,20}?(\d+|один|два|три|четыре|пять|шесть|семь|восемь|девять|десять)\s*(?:год|лет|г\.)/)
  if (m) out.ageYears = n(m[1])
  return out
}
