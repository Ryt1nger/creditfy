// Разбор свободного текста «опишите задачу». Правила зеркалят backend/app/intake/parse.py;
// общие примеры лежат в config/parse_cases.json и проверяются тестами обеих сторон.
import fields from '../config/fields.json'

export interface Parsed { amount?: number; term?: number; legal_form?: 'ООО' | 'ИП'; business_age_months?: number; collateral?: 'yes' | 'no'; goal?: string; goal_candidates?: string[] }
const L = 'а-яёa-z'
const WORDS: Record<string, number> = { один: 1, одного: 1, два: 2, двух: 2, три: 3, трёх: 3, трех: 3, четыре: 4, четырёх: 4, пять: 5, пяти: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 }
const NUM = `(\\d+|${Object.keys(WORDS).join('|')})`
const n = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORDS[s])
const rx = (s: string) => new RegExp(s)

function amountOf(t: string): number | undefined {
  if (rx('полтора\\s+(?:млн|миллион)').test(t)) return 1_500_000
  if (rx('пол\\s?миллиона').test(t)) return 500_000
  let m = t.match(rx(`(\\d+(?:[.,]\\d+)?)\\s*(млн|миллион[${L}]*|тыс[${L}]*\\.?|т\\.\\s?р|к(?![${L}]))`))
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * (m[2].startsWith('м') ? 1_000_000 : 1_000))
  if (rx(`(?<![\\d${L}])миллион(?![${L}])`).test(t)) return 1_000_000
  m = t.match(/(?<!\d)(\d{1,3}(?:[ .]\d{3}){1,3}|\d{5,9})(?!\d)/)
  return m ? Number(m[1].replace(/[ .]/g, '')) : undefined
}
function termOf(t: string): number | undefined {
  let m = t.match(/(\d+)\s*мес/)
  if (m) return Number(m[1])
  m = t.match(rx(`(?:(?<![${L}])на|срок[${L}]*)\\s*(?:до\\s+)?${NUM}\\s*(?:год|лет)`))
  if (m) return (n(m[1]) ?? 1) * 12
  if (rx(`(?<![${L}])(?:на|срок[${L}]*)\\s+полтора\\s+год`).test(t)) return 18
  if (rx(`(?<![${L}])(?:на|срок[${L}]*)\\s+полгода`).test(t)) return 6
  if (rx(`(?<![${L}])на\\s+год(?![${L}])`).test(t)) return 12
  return undefined
}
const LEAD = `(?:работа[${L}]*|существу[${L}]*|на рынке|в бизнесе|бизнесу|компании|открыл[${L}]*)`
function ageOf(t: string): number | undefined {
  let m = t.match(rx(`${LEAD}[^\\d]{0,20}?${NUM}\\s*(?:год|лет|г\\.)`))
  if (m) return (n(m[1]) ?? 0) * 12
  m = t.match(rx(`${LEAD}[^\\d]{0,20}?(\\d+)\\s*мес`))
  if (m) return Number(m[1])
  if (/только (?:открыл|зарегистрир|начина)|недавно открыл/.test(t)) return 3
  return undefined
}
function goalOf(t: string): { goal?: string; candidates?: string[] } {
  const kw = fields.fields.find((f) => f.key === 'goal')!.keywords as Record<string, string[]>
  const hits = Object.entries(kw).map(([g, ks]) => [g, ks.filter((k) => t.includes(k)).length] as const)
  const best = Math.max(0, ...hits.map((h) => h[1]))
  if (!best) return {}
  const top = hits.filter((h) => h[1] === best).map((h) => h[0])
  return top.length === 1 ? { goal: top[0] } : { candidates: top }
}

export function parseNeed(text: string): Parsed {
  let t = (text || '').toLowerCase().replace(/ /g, ' ')
  t = t.replace(/(?:\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g, ' ').replace(/\d{10,}/g, ' ')
  const out: Parsed = {}
  const age = ageOf(t)
  const tw = t.replace(new RegExp(`${LEAD}[^\\d]{0,20}?${NUM}\\s*(?:год[${L}]*|лет|г\\.|мес[${L}]*)`, 'g'), ' ')
  const amount = amountOf(tw), term = termOf(tw)
  if (amount !== undefined) out.amount = amount
  if (term !== undefined) out.term = term
  if (rx(`(?<![${L}])ооо(?![${L}])`).test(t)) out.legal_form = 'ООО'
  else if (rx(`(?<![${L}])ип(?![${L}])|индивидуальн`).test(t)) out.legal_form = 'ИП'
  if (age !== undefined) out.business_age_months = age
  if (/без залог/.test(t)) out.collateral = 'no'
  else if (/залог/.test(t)) out.collateral = 'yes'
  const g = goalOf(t)
  if (g.goal) out.goal = g.goal
  else if (g.candidates) out.goal_candidates = g.candidates
  return out
}
