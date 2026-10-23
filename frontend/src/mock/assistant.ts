// Демо-ответы помощника «Нужна помощь?» по ключевым словам (без ИИ). Зеркало backend/app/assistant.py.
import faq from '../config/faq.json'
import { DOC_KINDS, PRODUCTS } from './products'

export interface AssistantReply { matched: boolean; intent: string | null; answer: string; suggestions: string[]; source: 'demo'; is_demo: true }
const rub = (n: number) => (n >= 1_000_000 ? `${String(n / 1_000_000).replace('.', ',')} млн ₽` : `${Math.floor(n / 1000)} тыс. ₽`)
const term = (p: { min_term: number; max_term: number }) => (p.min_term === p.max_term ? `${p.min_term} мес.` : `${p.min_term}–${p.max_term} мес.`)
function fill(text: string) {
  const ps = Object.values(PRODUCTS)
  const vals: Record<string, string> = {
    products: ps.map((p) => `• ${p.name} — ${p.tagline.toLowerCase()}`).join('\n'),
    rates: ps.map((p) => `• ${p.name}: от ${String(p.base_rate).replace('.', ',')}%`).join('\n'),
    limits: ps.map((p) => `• ${p.name}: ${rub(p.min_amount)}–${rub(p.max_amount)}, срок ${term(p)}`).join('\n'),
    docs: ps.map((p) => `• ${p.name}: ${p.docs.map((d) => DOC_KINDS[d.kind].split(' за ')[0].toLowerCase()).join(', ')}`).join('\n'),
  }
  return text.replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m)
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// короткие ключи («ии», «бот») — только целым словом
const has = (t: string, k: string) => (k.length <= 3 ? new RegExp(`(?<![а-яa-z])${esc(k)}(?![а-яa-z])`).test(t) : t.includes(k))

export function ask(text: string): AssistantReply {
  const t = (text || '').toLowerCase().replace(/ё/g, 'е')
  let best: (typeof faq.items)[number] | null = null, bestHits = 0
  for (const it of faq.items) { const hits = it.keywords.filter((k) => has(t, k.replace(/ё/g, 'е'))).length; if (hits > bestHits) { best = it; bestHits = hits } }
  if (!best) return { matched: false, intent: null, answer: faq.fallback.answer, suggestions: faq.fallback.suggestions, source: 'demo', is_demo: true }
  return { matched: true, intent: best.id, answer: fill(best.answer), suggestions: faq.items.filter((i) => i !== best).map((i) => i.question).slice(0, 4), source: 'demo', is_demo: true }
}
