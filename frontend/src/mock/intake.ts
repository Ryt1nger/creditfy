// Зеркало backend/app/intake (движок квиза) для демо без бэкенда. Вопросы — из того же банка (config/fields.json).
// «ИИ»-формулировки здесь — ИМИТАЦИЯ по шаблону (simulated: true): реальной модели в браузере нет.
import fieldsCfg from '../config/fields.json'
import type { IntakeSession, QuizOption, QuizQuestion, Recommendations, Suggestion } from '../api/types'
import { parseNeed } from '../lib/need'
import { DISCLAIMER, DOC_KINDS, PRODUCTS } from './products'
import { annuity } from './offers'

type F = (typeof fieldsCfg.fields)[number] & { clarify?: { text: string; hint: string }; ask_when?: any; min?: number; max?: number; question: any }
const REG = Object.fromEntries((fieldsCfg.fields as F[]).map((f) => [f.key, f])) as Record<string, F>
const ORDER = ['goal', 'amount', 'term', 'legal_form', 'business_age_months', 'collateral']
const MAX_AI = 3

export interface Turn { id: number; field: string; kind: 'question' | 'clarify' | 'edit'; question: string; hint: string | null; options: QuizOption[]; source: 'bank' | 'ai'; simulated: boolean; answer: { value: string | number; label: string } | null }
export interface Sess { id: number; owner_id: number; text: string; extracted: Record<string, { value: any; source: string }>; answers: Record<string, any>; status: 'questions' | 'ready' | 'applied'; ai_calls_used: number; application_id: number | null; turns: Turn[]; portrait: any; recommendations: any; seq: number }

export function optionLabel(field: string, value: any): string {
  if (field === 'amount') return rubS(value)
  if (field === 'term') return termS(value)
  const o = REG[field].question.options.find((x: QuizOption) => x.value === value)
  if (o) return o.label
  if (field === 'amount') return `${new Intl.NumberFormat('ru-RU').format(value).replace(/\s/g, ' ')} ₽`
  return field === 'term' || field === 'business_age_months' ? `${value} мес.` : String(value)
}
export function validValue(field: string, value: any) {
  const f = REG[field]; if (!f || value == null || value === '') return null
  if (f.type === 'enum') return f.question.options.some((o: QuizOption) => o.value === value) ? value : null
  const v = Math.trunc(Number(String(value).replace(/\s/g, '').replace(',', '.')))
  return Number.isFinite(v) && v >= f.min! && v <= f.max! ? v : null
}
export const known = (s: Sess): Record<string, any> => ({ ...Object.fromEntries(Object.entries(s.extracted).filter(([k]) => k in REG).map(([k, v]) => [k, v.value])), ...s.answers })
function cond(f: F, vals: Record<string, any>) {
  if (!f.ask_when) return true
  return f.ask_when.any.some((c: any) => { const v = vals[c.field]; return v != null && ((c.gte != null && v >= c.gte) || (c.in && c.in.includes(v))) })
}
const missing = (s: Sess) => { const v = known(s); return Object.values(REG).sort((a, b) => a.priority - b.priority).filter((f) => !(f.key in v) && cond(f, v)) }
export const openTurn = (s: Sess) => s.turns.find((t) => !t.answer) ?? null

/** Имитация ИИ-формулировки: вопрос в контексте задачи. Варианты ответа — всегда из банка. */
function simulate(s: Sess, f: F): { question: string; hint: string | null } | null {
  if (s.ai_calls_used >= MAX_AI || s.text.trim().length < 15) return null
  const v = known(s), goal = v.goal ? optionLabel('goal', v.goal).toLowerCase() : null
  const ctx = goal ? `Чтобы ${goal === 'пополнить оборот' ? 'подобрать оборотные деньги' : 'подобрать кредит под задачу'}` : 'Чтобы подобрать кредит'
  const map: Record<string, string> = { amount: `${ctx}, подскажите, какая сумма нужна?`, term: `${ctx}, на какой срок удобно взять деньги?`, legal_form: `${ctx}, уточните, на кого оформляем кредит?`, business_age_months: `${ctx}, сколько уже работает ваш бизнес?`, collateral: `${ctx}, есть ли что предложить в залог?` }
  if (!map[f.key]) return null
  s.ai_calls_used++
  return { question: map[f.key], hint: f.question.hint ?? null }
}
function newTurn(s: Sess): Turn | null {
  const v = known(s); const cands = s.extracted.goal_candidates?.value as string[] | undefined
  let f: F, kind: Turn['kind'] = 'question', options: QuizOption[], text: string, hint: string | null
  if (!('goal' in v) && cands && !s.turns.some((t) => t.kind === 'clarify')) {
    f = REG.goal; kind = 'clarify'; options = f.question.options.filter((o: QuizOption) => cands.includes(o.value as string)); text = f.clarify!.text; hint = f.clarify!.hint
  } else {
    const todo = missing(s); if (!todo.length) return null
    f = todo[0]; options = f.question.options; text = f.question.text; hint = f.question.hint ?? null
  }
  const sim = kind === 'question' ? simulate(s, f) : null
  const t: Turn = { id: ++s.seq, field: f.key, kind, question: sim?.question ?? text, hint: sim ? sim.hint : hint, options, source: sim ? 'ai' : 'bank', simulated: !!sim, answer: null }
  s.turns.push(t); return t
}
function advance(s: Sess) { if (!openTurn(s) && !newTurn(s)) { if (s.status === 'questions') s.status = 'ready'; s.portrait = portrait(s) } }

export function startSession(id: number, owner_id: number, text: string): Sess {
  const s: Sess = { id, owner_id, text: text.trim(), extracted: {}, answers: {}, status: 'questions', ai_calls_used: 0, application_id: null, turns: [], portrait: null, recommendations: null, seq: 0 }
  for (const [k, val] of Object.entries(parseNeed(s.text))) {
    if (k === 'goal_candidates') s.extracted[k] = { value: val, source: 'text' }
    else { const vv = validValue(k, val); if (vv != null) s.extracted[k] = { value: vv, source: 'text' } }
  }
  advance(s); return s
}
export function answerSession(s: Sess, field: string, value: any) {
  const v = validValue(field, value); if (v == null) throw new Error('Выберите вариант из списка или введите значение в допустимом диапазоне')
  let t = openTurn(s)
  if (!t || t.field !== field) { const f = REG[field]; t = { id: ++s.seq, field, kind: 'edit', question: f.question.text, hint: null, options: f.question.options, source: 'bank', simulated: false, answer: null }; s.turns.push(t) }
  t.answer = { value: v, label: optionLabel(field, v) }; s.answers[field] = v
  if (s.status === 'ready') s.recommendations = null
  if (s.status !== 'applied') s.status = 'questions'
  advance(s)
}

// ── портрет и подбор ──
const rubS = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',')} млн ₽` : n >= 1e3 ? `${Math.round(n / 1e3)} тыс. ₽` : `${n} ₽`)
const termS = (m: number) => (m % 12 === 0 ? `${m / 12} ${m / 12 === 1 ? 'год' : m / 12 <= 4 ? 'года' : 'лет'}` : `${m} мес.`)
const ageS = (m: number) => (m < 6 ? 'меньше 6 месяцев' : m < 12 ? '6–12 месяцев' : m < 36 ? '1–3 года' : 'больше 3 лет')
export function portrait(s: Sess) {
  const v = known(s)
  const items = ORDER.filter((k) => k in v).map((k) => ({ field: k, label: REG[k].label, value: v[k], value_label: optionLabel(k, v[k]), source: k in s.answers ? 'answer' : s.extracted[k]?.source ?? 'text' }))
  const parts: string[] = []
  if (v.legal_form) parts.push(v.legal_form + (v.business_age_months != null ? `, бизнесу ${ageS(v.business_age_months)}` : ''))
  let need = 'Нужно'; if (v.amount) need += ` ${rubS(v.amount)}`; if (v.term) need += ` на ${termS(v.term)}`; if (v.goal) need += ` — ${optionLabel('goal', v.goal).toLowerCase()}`
  parts.push(need); if (v.collateral === 'yes') parts.push('есть залог'); else if (v.collateral === 'no') parts.push('без залога')
  return { items, summary: parts.map((p) => p[0].toUpperCase() + p.slice(1)).join('. ') + '.', values: v }
}
function evaluate(p: (typeof PRODUCTS)[string], v: Record<string, any>, text: string): Suggestion & { blockers: string[] } {
  const el = p.eligibility, { amount, term, goal, legal_form: form, business_age_months: age, collateral: coll } = v
  const blockers: string[] = [], reasons: string[] = [], caveats: string[] = []; let score = 0
  if (form && !el.forms.includes(form)) blockers.push(`Продукт доступен только для: ${el.forms.join(', ')}`)
  if (age != null && age < el.min_business_age_months) blockers.push(`Нужно, чтобы бизнесу было от ${el.min_business_age_months} мес.`)
  const rf = el.collateral_required_from
  if (rf && amount && amount >= rf) { if (coll === 'no') blockers.push(`Для суммы от ${rubS(rf)} нужен залог`); else if (coll !== 'yes') caveats.push(`Для суммы от ${rubS(rf)} понадобится залог`) }
  if (goal) {
    const gl = optionLabel('goal', goal).toLowerCase()
    if (p.goals[0] === goal) { score += 3; reasons.push(`Создан для задачи «${gl}»`) } else if (p.goals.includes(goal)) { score += 1.5; reasons.push(`Тоже решает задачу «${gl}»`) } else score -= 1
  }
  score += Math.min(p.keywords.filter((k) => text.toLowerCase().includes(k)).length, 3) * 0.2
  let sa = amount ?? p.min_amount
  if (amount) {
    if (amount > p.max_amount) { sa = p.max_amount; score -= 1; caveats.push(`Максимум по продукту ${rubS(p.max_amount)} — остальное можно закрыть другим продуктом`) }
    else if (amount < p.min_amount) { sa = p.min_amount; score -= 0.5; caveats.push(`Минимальная сумма ${rubS(p.min_amount)}`) }
    else { score += 1; reasons.push(`Сумма ${rubS(amount)} в пределах продукта (${rubS(p.min_amount)}–${rubS(p.max_amount)})`) }
  }
  const st = Math.min(Math.max(term ?? p.max_term, p.min_term), p.max_term)
  if (term) { if (term >= p.min_term && term <= p.max_term) { score += 0.5; reasons.push(`Срок ${termS(term)} подходит`) } else caveats.push(`Срок по продукту ${p.min_term === p.max_term ? termS(p.min_term) : `${termS(p.min_term)}–${termS(p.max_term)}`}, предложим ${termS(st)}`) }
  if (form && age != null && !blockers.length) reasons.push(`Доступен для ${form}, бизнесу от ${el.min_business_age_months} мес.`)
  if (el.collateral === 'none') reasons.push('Без залога и поручительств'); else if (coll === 'yes' && p.allows_collateral) reasons.push('Залог снизит ставку на 1 п.п.')
  const rate = Math.round((p.base_rate - (coll === 'yes' && p.allows_collateral ? 1 : 0)) * 100) / 100
  return { code: p.code, name: p.name, tagline: p.tagline, score: Math.round(score * 100) / 100, amount: sa, term_months: st, rate_from: rate, monthly_payment: Math.round(annuity(sa, st, rate)), reasons: reasons.slice(0, 4), caveats, blockers, docs: p.docs.map((d) => ({ kind: d.kind, label: DOC_KINDS[d.kind] })) }
}
export function recommendFor(s: Sess): Recommendations {
  const v = known(s), ev = Object.values(PRODUCTS).map((p) => evaluate(p, v, s.text))
  const ok = ev.filter((e) => !e.blockers.length).sort((a, b) => b.score - a.score)
  const strip = ({ blockers, ...e }: Suggestion & { blockers: string[] }) => e as Suggestion
  return { primary: ok[0] ? strip(ok[0]) : null, alternatives: ok.slice(1, 3).map(strip), not_suitable: ev.filter((e) => e.blockers.length).map((e) => ({ code: e.code, name: e.name, why: e.blockers })), disclaimer: DISCLAIMER, note: 'Подбор — подсказка, а не решение банка. Решение принимается после проверки заявки.' }
}

export function sessionDict(s: Sess): IntakeSession {
  const t = openTurn(s); const answered = s.turns.filter((x) => x.answer && x.kind !== 'edit').length
  const left = s.status !== 'questions' ? 0 : missing(s).length || (t ? 1 : 0)
  const question: QuizQuestion | null = t ? { turn_id: t.id, field: t.field, kind: t.kind, text: t.question, hint: t.hint, options: t.options, custom: (REG[t.field].question.custom as any) ?? null, type: REG[t.field].type as any, min: REG[t.field].min ?? null, max: REG[t.field].max ?? null, source: t.source, simulated: t.simulated } : null
  const kn = known(s)
  return {
    id: s.id, text: s.text, status: s.status, question,
    known: Object.fromEntries(Object.entries(kn).map(([k, value]) => [k, { value, label: optionLabel(k, value), source: k in s.answers ? 'answer' : s.extracted[k]?.source ?? 'text' }])),
    progress: { done: answered, total: answered + Math.max(left, t ? 1 : 0) }, portrait: s.portrait, recommendations: s.recommendations, application_id: s.application_id,
    ai: { enabled: false, calls_used: s.ai_calls_used, max_calls: MAX_AI, simulated: true },
    history: s.turns.filter((x) => x.answer).map((x) => ({ field: x.field, kind: x.kind, question: x.question, source: x.source, answer: x.answer!.label })),
  }
}
