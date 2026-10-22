// Демо-движок: полностью заменяет бэкенд в браузере (VITE_API_MODE=mock). Логика зеркалит backend/app/services.
import type { ApplicationDetail, ApplicationSummary, Me } from '../api/types'
import { bki, demoInns, egrul, innValid, pb, SCENARIOS } from './registry'
import { DISCLAIMER, DOC_KINDS, PRODUCTS, REJECT_REASONS } from './products'
import { availableCash, dscr, findOffer, rateFor, schedule, annuity, type OfferCalc } from './offers'
import { scoreApplication } from './scoring'

export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
const KEY = 'creditfy-mock-v3'
const STEP_DELAY = 1100

// ─── машина состояний ───
const TR: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'], SUBMITTED: ['COMPLETENESS_CHECK'], COMPLETENESS_CHECK: ['NEEDS_INFO', 'ENRICHMENT'],
  NEEDS_INFO: ['COMPLETENESS_CHECK', 'MANUAL_REVIEW', 'CANCELLED'], ENRICHMENT: ['SCORING'], SCORING: ['OFFER_READY', 'MANUAL_REVIEW', 'REJECTED'],
  MANUAL_REVIEW: ['OFFER_READY', 'REJECTED', 'NEEDS_INFO'], OFFER_READY: ['SIGNING', 'DECLINED_BY_CLIENT', 'EXPIRED', 'CANCELLED'],
  SIGNING: ['DISBURSED', 'CANCELLED'], REJECTED: [], DISBURSED: [], DECLINED_BY_CLIENT: [], EXPIRED: [], CANCELLED: [],
}
export const STEPS = ['Заявка', 'Проверка данных', 'Оценка риска', 'Решение', 'Подписание и выдача']
const META: Record<string, [string, number, string, string]> = {
  DRAFT: ['Черновик', 0, 'draft', 'Заполните заявку и отправьте её в банк.'],
  SUBMITTED: ['Заявка принята', 0, 'progress', 'Заявка получена, сейчас начнём проверку.'],
  COMPLETENESS_CHECK: ['Проверяем полноту данных', 1, 'progress', 'Сверяем данные и документы. Ничего делать не нужно.'],
  NEEDS_INFO: ['Нужны уточнения', 1, 'action', 'Банку не хватает данных — ответьте на запрос ниже, и мы продолжим.'],
  ENRICHMENT: ['Проверяем компанию в реестрах', 2, 'progress', 'Подтверждаем данные о компании в государственных реестрах и кредитной истории.'],
  SCORING: ['Оцениваем кредитный риск', 2, 'progress', 'Считаем оценку и подбираем условия.'],
  MANUAL_REVIEW: ['Заявку рассматривает кредитный специалист', 3, 'progress', 'Случай требует внимания специалиста. Обычно это занимает до одного рабочего дня.'],
  OFFER_READY: ['Банк одобрил — выберите решение', 3, 'action', 'Ознакомьтесь с условиями и примите или отклоните предложение.'],
  REJECTED: ['Банк не готов одобрить заявку', 3, 'final', 'Посмотрите причину ниже. Вы можете оформить новую заявку с другими параметрами.'],
  SIGNING: ['Подписание договора', 4, 'action', 'Проверьте договор и подпишите его электронной подписью.'],
  DISBURSED: ['Кредит выдан', 4, 'final', 'Деньги зачислены на расчётный счёт. График платежей — ниже.'],
  DECLINED_BY_CLIENT: ['Вы отказались от предложения', 3, 'final', 'Заявка закрыта по вашему решению.'],
  EXPIRED: ['Срок предложения истёк', 3, 'final', 'Оформите новую заявку, если потребность сохраняется.'],
  CANCELLED: ['Заявка отменена', 0, 'final', 'Заявка закрыта.'],
}
const FIELD_LABELS: Record<string, string> = {
  'financials.revenue_year': 'Выручка за последний год, ₽', 'financials.net_profit_year': 'Чистая прибыль за последний год, ₽',
  'financials.monthly_turnover': 'Среднемесячный оборот по счёту, ₽', 'financials.monthly_obligations': 'Ежемесячные платежи по действующим кредитам, ₽',
  'contact.name': 'Контактное лицо', 'contact.phone': 'Телефон для связи', purpose: 'Цель кредита',
}

interface DB { users: any[]; apps: any[]; notifications: any[]; seq: Record<string, number> }
let db: DB
const listeners = new Set<() => void>()
const nowIso = () => new Date().toISOString()
const nid = (k: string) => (db.seq[k] = (db.seq[k] ?? 0) + 1)
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* private mode */ } listeners.forEach((l) => l()) }
export const onChange = (f: () => void) => { listeners.add(f); return () => listeners.delete(f) }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── журнал ───
function log(a: any, kind: string, title: string, detail: string | null = null, actor = 'Система', client_visible = true, to_status: string | null = null) {
  a.events.push({ id: nid('evt'), ts: nowIso(), kind, title, detail, actor, client_visible, to_status })
}
function notify(userId: number, a: any, text: string) { db.notifications.unshift({ id: nid('ntf'), user_id: userId, application_id: a.id, text, read: false, created_at: nowIso() }) }
function go(a: any, to: string, title: string, detail: string | null = null, actor = 'Система', visible = true) {
  if (!TR[a.status].includes(to)) throw new ApiError(409, `Недопустимый переход статуса: ${a.status} → ${to}`)
  a.status = to; a.updated_at = nowIso(); log(a, 'status', title, detail, actor, visible, to)
}

// ─── конвейер ───
function missing(a: any) {
  const items: any[] = []
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const [scope, name] = key.includes('.') ? key.split('.') : ['purpose', 'purpose']
    const v = scope === 'financials' ? a.financials[name] : scope === 'contact' ? a.contact[name] : a.purpose
    if (v == null || v === '') items.push({ type: 'field', key, label })
  }
  const have = new Set(a.documents.filter((d: any) => d.status !== 'rejected').map((d: any) => d.kind))
  for (const k of [...PRODUCTS[a.product_code].docs.map((d) => d.kind), ...(a.has_collateral ? ['collateral_doc'] : [])]) if (!have.has(k)) items.push({ type: 'document', key: k, label: DOC_KINDS[k] })
  return items
}
const bkiPay = (a: any) => (a.enr?.bki?.active_loans ?? []).reduce((s: number, l: any) => s + l.monthly_payment, 0)
const freeCash = (a: any) => availableCash(a.financials, bkiPay(a)).free

function issueOffer(a: any, c: OfferCalc, by: string, actor: string, note?: string) {
  a.offers.forEach((o: any) => { if (o.status === 'proposed') o.status = 'superseded' })
  const o = { id: nid('off'), kind: c.kind, amount: c.amount, term_months: c.term_months, rate: c.rate, monthly_payment: c.monthly_payment, total_payment: c.total_payment, fee: c.fee, explanation: note ?? c.explanation, status: 'proposed', valid_until: new Date(Date.now() + 14 * 864e5).toISOString() }
  a.offers.push(o); a.decision = c.kind === 'initial' ? 'approved' : 'counteroffer'; a.decision_by = by; a.decision_reason = o.explanation
  const title = c.kind === 'initial' ? 'Банк одобрил заявку' : 'Банк предлагает изменённые условия'
  go(a, 'OFFER_READY', title, o.explanation, actor); notify(a.owner_id, a, `Заявка ${a.number}: ${title.toLowerCase()}`)
}
function rejectApp(a: any, code: string, by: string, actor: string, comment?: string) {
  const reason = REJECT_REASONS[code] ?? code
  a.decision = 'rejected'; a.decision_by = by; a.decision_reason = reason + (comment ? `. ${comment}` : '')
  go(a, 'REJECTED', 'Банк не готов одобрить заявку', a.decision_reason, actor); notify(a.owner_id, a, `Заявка ${a.number}: отказ — ${reason.toLowerCase()}`)
}
function runScoring(a: any) {
  const s = scoreApplication(a.product_code, a.amount, a.has_collateral, a.financials, a.enr.egrul, a.enr.bki, a.enr.pb)
  const rate = rateFor(a.product_code, s.grade, a.has_collateral)
  const sr = { ...s, dscr: dscr(a.amount, a.term_months, rate, freeCash(a)) }
  a.scores.push(sr); a.score = s.score; a.risk_grade = s.grade
  log(a, 'scoring', `Скоринг: ${s.score} баллов, класс ${s.grade}`, `Маршрут: ${s.route}; DSCR по запросу: ${sr.dscr}`, 'Система', false)
  return sr
}
const suggest = (a: any, sr: any) => findOffer(a.product_code, a.amount, a.term_months, sr.grade ?? sr.grade, a.has_collateral, freeCash(a))

/** Один шаг конвейера. true — продолжать. */
function stepOnce(a: any): boolean {
  switch (a.status) {
    case 'SUBMITTED': go(a, 'COMPLETENESS_CHECK', 'Проверяем полноту данных'); return true
    case 'COMPLETENESS_CHECK': {
      const items = missing(a)
      if (items.length) {
        a.info_requests.push({ id: nid('req'), message: 'Для рассмотрения заявки не хватает данных. Пожалуйста, дополните их.', items, status: 'open', answer: null, created_by: 'Система', created_at: nowIso() })
        a.resume_to = 'COMPLETENESS_CHECK'
        go(a, 'NEEDS_INFO', 'Нужны уточнения', 'Не хватает: ' + items.map((i) => i.label).join('; ')); notify(a.owner_id, a, `Заявка ${a.number}: нужны уточнения`); return false
      }
      log(a, 'check', 'Данные и документы полные'); go(a, 'ENRICHMENT', 'Проверяем компанию в реестрах'); return true
    }
    case 'ENRICHMENT': {
      a.enr = { egrul: egrul(a.company.inn), bki: bki(a.company.inn), pb: pb(a.company.inn) }
      log(a, 'enrichment', 'Данные о компании подтверждены в реестрах', 'ЕГРЮЛ/ЕГРИП, бюро кредитных историй, «Прозрачный бизнес» (симуляторы)')
      go(a, 'SCORING', 'Оцениваем кредитный риск'); return true
    }
    case 'SCORING': {
      const sr = runScoring(a)
      if (sr.route === 'reject') { rejectApp(a, sr.stop_factors[0]?.code ?? 'high_risk', 'auto', 'Система'); return false }
      const sug = suggest(a, sr)
      if (sr.route === 'auto_approve') { if (sug) issueOffer(a, sug, 'auto', 'Система'); else rejectApp(a, 'insufficient_capacity', 'auto', 'Система'); return false }
      go(a, 'MANUAL_REVIEW', 'Заявку рассматривает кредитный специалист', 'Случай выходит за рамки автоматического решения.')
      notify(a.owner_id, a, `Заявка ${a.number}: передана кредитному специалисту`); return false
    }
    default: return false
  }
}
const running = new Set<number>()
async function launch(a: any, instant = false) {
  if (running.has(a.id)) return
  running.add(a.id); a.processing = true; save()
  try {
    while (true) {
      if (!instant) await sleep(STEP_DELAY)
      const more = stepOnce(a); save()
      if (!more) break
    }
  } finally { a.processing = false; running.delete(a.id); save() }
}
function resume(a: any) {
  const t = a.resume_to ?? 'COMPLETENESS_CHECK'; a.resume_to = null
  if (t === 'MANUAL_REVIEW') { go(a, 'MANUAL_REVIEW', 'Клиент ответил на запрос, заявка вернулась специалисту'); if (a.assigned_to_id) notify(a.assigned_to_id, a, `Заявка ${a.number}: клиент ответил на запрос`) }
  else { go(a, 'COMPLETENESS_CHECK', 'Получили уточнения, продолжаем проверку'); void launch(a) }
}
function expire(a: any) {
  if (a.status !== 'OFFER_READY') return
  const o = a.offers.find((x: any) => x.status === 'proposed')
  if (o && new Date(o.valid_until) < new Date()) go(a, 'EXPIRED', 'Срок предложения истёк')
}

// ─── сериализация ───
const isBank = (u: Me) => u.role !== 'client'
const currentOffer = (a: any) => [...a.offers].reverse().find((o) => o.status === 'proposed' || o.status === 'accepted') ?? null
function summary(a: any): ApplicationSummary {
  const [label, step, group, hint] = META[a.status]; const o = currentOffer(a); const sc = a.scores[a.scores.length - 1]
  return {
    id: a.id, number: a.number, company_name: a.company.name, product_code: a.product_code, product_name: PRODUCTS[a.product_code].name, amount: a.amount, term_months: a.term_months,
    status: a.status, status_label: label, step, group: group as any, hint, processing: a.processing, created_at: a.created_at, updated_at: a.updated_at, decision: a.decision,
    offer: o ? { amount: o.amount, term_months: o.term_months, rate: o.rate, monthly_payment: o.monthly_payment } : null,
    assigned_to: a.assigned_to_id ? db.users.find((u) => u.id === a.assigned_to_id)?.name ?? null : null,
    risk_grade: a.risk_grade, score: a.score, route: sc?.route ?? null, open_requests: a.info_requests.filter((r: any) => r.status === 'open').length,
  }
}
function explain(a: any) { const [, , , hint] = META[a.status]; return { text: hint, source: 'stub', is_stub: true } }
function detail(a: any, u: Me): ApplicationDetail {
  const bank = isBank(u)
  const have = new Set(a.documents.filter((d: any) => d.status !== 'rejected').map((d: any) => d.kind))
  const need = [...PRODUCTS[a.product_code].docs.map((d) => d.kind), ...(a.has_collateral ? ['collateral_doc'] : [])]
  const d: ApplicationDetail = {
    ...summary(a), steps: STEPS, company: a.company, purpose: a.purpose, has_collateral: a.has_collateral, collateral_note: a.collateral_note, financials: a.financials, contact: a.contact,
    documents: a.documents.map((x: any) => ({ id: x.id, kind: x.kind, label: DOC_KINDS[x.kind] ?? x.kind, filename: x.filename, size: x.size, status: x.status, review_comment: x.review_comment, extraction: 'not_available' })),
    required_documents: need.map((k) => ({ kind: k, label: DOC_KINDS[k], uploaded: have.has(k) })),
    info_requests: a.info_requests, offers: a.offers, events: a.events.filter((e: any) => bank || e.client_visible),
    loan: a.loan, decision_reason: a.decision_reason, ai_explanation: explain(a),
  }
  if (bank) {
    const sc = a.scores[a.scores.length - 1] ?? null
    const sug = sc && a.enr && ['MANUAL_REVIEW', 'NEEDS_INFO'].includes(a.status) ? findOffer(a.product_code, a.amount, a.term_months, sc.grade, a.has_collateral, freeCash(a)) : null
    d.bank = {
      enrichment: a.enr ?? { egrul: null, bki: null, pb: null }, score: sc,
      ai_summary: aiSummary(a, sc),
      suggested_offer: sug ? { amount: sug.amount, term_months: sug.term_months, rate: sug.rate, monthly_payment: sug.monthly_payment, kind: sug.kind, dscr: sug.dscr, explanation: sug.explanation } : null,
      reject_reasons: Object.entries(REJECT_REASONS).map(([code, label]) => ({ code, label })),
      can_decide: u.role === 'underwriter' && a.status === 'MANUAL_REVIEW', can_edit_docs: !['DISBURSED', 'REJECTED', 'CANCELLED'].includes(a.status),
    }
  }
  return d
}
function aiSummary(a: any, s: any) {
  const m = (n: number) => new Intl.NumberFormat('ru-RU').format(n).replace(/ /g, ' ')
  const p = [`${a.company.name} (ИНН ${a.company.inn}), бизнесу ${a.company.age_months ?? '?'} мес., статус в реестре: ${a.company.status}.`, `Запрос: ${m(a.amount)} ₽ на ${a.term_months} мес. по продукту «${PRODUCTS[a.product_code].name}».`]
  if (s) {
    p.push(`Скоринг: ${s.score} баллов, класс ${s.grade}, маршрут «${s.route}». DSCR при запрошенных условиях: ${s.dscr ?? 'н/д'}.`)
    if (s.stop_factors.length) p.push('Стоп-факторы: ' + s.stop_factors.map((x: any) => x.name).join('; ') + '.')
    const neg = s.factors.filter((f: any) => f.points < 0); if (neg.length) p.push('Что снижает оценку: ' + neg.slice(0, 3).map((f: any) => f.name).join('; ') + '.')
    if (s.flags.length) p.push('Проверьте: ' + s.flags.join('; ') + '.')
  }
  p.push('(Сводка собрана по шаблону — ИИ-модуль пока не подключён.)')
  return { text: p.join(' '), source: 'stub', is_stub: true }
}

// ─── создание заявки ───
function newApp(owner: Me, b: any) {
  const e = egrul(b.company_inn); if (!e) throw new ApiError(422, 'Некорректный ИНН')
  const prod = PRODUCTS[b.product_code]; if (!prod) throw new ApiError(422, 'Неизвестный продукт')
  const id = nid('app')
  const a = {
    id, number: `АБ-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`, owner_id: owner.id, company: { inn: e.inn, name: e.name, legal_form: e.legal_form, ogrn: e.ogrn, okved: e.okved, reg_date: e.reg_date, address: e.address, director: e.director, status: e.status, age_months: e.age_months },
    product_code: b.product_code, amount: b.amount, term_months: b.term_months, purpose: b.purpose ?? '', has_collateral: !!b.has_collateral, collateral_note: b.collateral_note ?? null,
    financials: b.financials ?? {}, contact: b.contact ?? {}, status: 'DRAFT', resume_to: null, processing: false, assigned_to_id: null as number | null, risk_grade: null as string | null, score: null as number | null, decision: null as string | null, decision_reason: null as string | null, decision_by: null as string | null, submitted_at: null as string | null,
    created_at: nowIso(), updated_at: nowIso(), documents: [] as any[], info_requests: [] as any[], events: [] as any[], enr: null as any, scores: [] as any[], offers: [] as any[], loan: null as any,
  }
  log(a, 'created', 'Черновик заявки создан', null, owner.name); db.apps.push(a); return a
}

// ─── сидирование демо-данных ───
const FIN: Record<string, any> = {
  strong: { revenue_year: 60_000_000, net_profit_year: 9_000_000, monthly_turnover: 5_000_000, monthly_obligations: 150_000 },
  tight: { revenue_year: 18_000_000, net_profit_year: 1_800_000, monthly_turnover: 1_500_000, monthly_obligations: 25_000 },
  gray: { revenue_year: 9_000_000, net_profit_year: 1_000_000, monthly_turnover: 750_000, monthly_obligations: 18_000 },
  bad: { revenue_year: 25_000_000, net_profit_year: 900_000, monthly_turnover: 2_000_000, monthly_obligations: 40_000 },
}
function seed() {
  db = { users: [], apps: [], notifications: [], seq: {} }
  const U = (name: string, email: string, role: any) => { const u = { id: nid('usr'), name, email, role }; db.users.push(u); return u }
  const c1 = U('Иван Соколов', 'ivan@demo.ru', 'client'), c2 = U('Андрей Волков', 'volkov@demo.ru', 'client'), c3 = U('Мария Пекарева', 'maria@demo.ru', 'client')
  const op = U('Елена Крылова', 'operator@demo.ru', 'operator'), uw = U('Дмитрий Орлов', 'risk@demo.ru', 'underwriter')
  const mkApp = (owner: any, sc: string, code: string, amount: number, term: number, opts: { docs?: string[]; collateral?: boolean } = {}) => {
    const p = SCENARIOS[sc]
    const a = newApp(owner, { company_inn: p.inn, product_code: code, amount, term_months: term, purpose: 'Демонстрационная заявка', has_collateral: !!opts.collateral, financials: FIN[sc], contact: { name: owner.name, phone: '+7 900 000-00-00' } })
    const kinds = opts.docs ?? [...PRODUCTS[code].docs.map((d) => d.kind), ...(opts.collateral ? ['collateral_doc'] : [])]
    kinds.forEach((k) => a.documents.push({ id: nid('doc'), kind: k, filename: `${k}.pdf`, size: 180_000 + Math.floor(Math.random() * 300_000), status: 'uploaded', review_comment: null }))
    go(a, 'SUBMITTED', 'Заявка отправлена в банк', null, owner.name); a.submitted_at = nowIso()
    while (stepOnce(a));
    return a
  }
  const accept = (a: any, sign = true) => {
    const o = a.offers.find((x: any) => x.status === 'proposed'); o.status = 'accepted'; go(a, 'SIGNING', 'Клиент принял предложение', null, a.company.name)
    if (sign) signLoan(a)
  }
  const a1 = mkApp(c1, 'strong', 'equipment', 1_800_000, 36); accept(a1)
  mkApp(c1, 'strong', 'investment', 4_000_000, 48, { docs: ['bank_statement', 'tax_return'] })
  mkApp(c1, 'strong', 'working_capital', 2_500_000, 24)
  const g = mkApp(c2, 'gray', 'working_capital', 1_200_000, 18); g.assigned_to_id = uw.id
  mkApp(c2, 'gray', 'overdraft', 600_000, 12)
  mkApp(c2, 'bad', 'working_capital', 3_000_000, 24)
  mkApp(c3, 'tight', 'equipment', 4_000_000, 36)
  // состарим журнал для красоты
  db.apps.forEach((a, i) => { const shift = (db.apps.length - i) * 3.1 * 3600e3; a.created_at = new Date(Date.now() - shift - 4 * 3600e3).toISOString(); a.updated_at = new Date(Date.now() - shift).toISOString(); a.events.forEach((e: any, j: number) => (e.ts = new Date(Date.now() - shift - 4 * 3600e3 + j * 90e3).toISOString())) })
  save()
}
function signLoan(a: any) {
  const o = a.offers.find((x: any) => x.status === 'accepted')
  a.loan = { contract_number: `АБ-КД-${new Date().getFullYear()}-${String(a.id).padStart(5, '0')}`, amount: o.amount, rate: o.rate, term_months: o.term_months, signed_at: nowIso(), disbursed_at: nowIso(), schedule: schedule(o.amount, o.term_months, o.rate, new Date()) }
  log(a, 'sign', 'Договор подписан электронной подписью (демо)', null, a.company.name)
  go(a, 'DISBURSED', 'Кредит выдан', `Сумма ${o.amount} ₽ зачислена на расчётный счёт (симуляция)`); notify(a.owner_id, a, `Заявка ${a.number}: кредит выдан`)
}

export function initEngine() {
  try { const raw = localStorage.getItem(KEY); if (raw) db = JSON.parse(raw) } catch { /* ignore */ }
  if (!db) seed()
  db.apps.forEach((a) => { if (a.processing || ['SUBMITTED', 'COMPLETENESS_CHECK', 'ENRICHMENT', 'SCORING'].includes(a.status)) { a.processing = false; void launch(a) } })
}
export function resetDemo() { try { localStorage.removeItem(KEY) } catch { /* ignore */ } location.reload() }

// ─── маршрутизатор ───
type Ctx = { me: Me | null; body: any; query: URLSearchParams; m: RegExpMatchArray }
const routes: [string, RegExp, (c: Ctx) => any][] = []
const R = (method: string, path: string, fn: (c: Ctx) => any) => routes.push([method, new RegExp('^' + path.replace(/:(\w+)/g, '([^/]+)') + '$'), fn])
const need = (c: Ctx) => { if (!c.me) throw new ApiError(401, 'Требуется вход'); return c.me }
const bankOnly = (c: Ctx) => { const u = need(c); if (!isBank(u)) throw new ApiError(403, 'Доступно только сотрудникам банка'); return u }
const uwOnly = (c: Ctx) => { const u = need(c); if (u.role !== 'underwriter') throw new ApiError(403, 'Решение принимает андеррайтер'); return u }
function getApp(c: Ctx, id: string, bank = false) {
  const u = bank ? bankOnly(c) : need(c); const a = db.apps.find((x) => x.id === Number(id)); if (!a) throw new ApiError(404, 'Заявка не найдена')
  if (!isBank(u) && a.owner_id !== u.id) throw new ApiError(404, 'Заявка не найдена'); expire(a); return { a, u }
}
const busy = (a: any) => { if (a.processing) throw new ApiError(409, 'Заявка обрабатывается, подождите несколько секунд') }

R('POST', '/auth/login', ({ body }) => {
  const u = db.users.find((x) => x.email === String(body.email).trim().toLowerCase())
  if (!u || body.password !== 'demo123') throw new ApiError(401, 'Неверный логин или пароль')
  return { token: 'mock.' + u.id, user: u }
})
R('GET', '/auth/demo-accounts', () => db.users.map((u) => ({ email: u.email, name: u.name, role: u.role, hint: { 'ivan@demo.ru': 'ООО «Север-Логистика» — сильный клиент', 'volkov@demo.ru': 'ИП Волков — пограничный случай', 'maria@demo.ru': 'ООО «Пекарня №1» — встречное предложение', 'operator@demo.ru': 'Оператор: проверка полноты и документов', 'risk@demo.ru': 'Андеррайтер: принимает решения' }[u.email as string] ?? '' })))
R('GET', '/me', (c) => need(c))
R('GET', '/products', (c) => { need(c); return Object.values(PRODUCTS).map(({ auto_limit, keywords, ...p }) => ({ ...p, disclaimer: DISCLAIMER })) })
R('GET', '/demo/inns', (c) => { need(c); return demoInns() })
R('GET', '/companies/lookup/:inn', (c) => { need(c); if (!innValid(c.m[1])) throw new ApiError(422, 'Некорректный ИНН: проверьте цифры (10 для организаций, 12 для ИП)'); const e = egrul(c.m[1]); return e })
R('POST', '/products/recommend', (c) => {
  need(c); const t = String(c.body.text ?? '').toLowerCase(); const amt = c.body.amount as number | undefined
  const items = Object.values(PRODUCTS).map((p) => { const hits = p.keywords.filter((k) => t.includes(k)); let s = hits.length; if (amt) s += amt >= p.min_amount && amt <= p.max_amount ? 0.5 : -1; return { code: p.code, score: s, reason: hits.length ? `В описании есть признаки: ${hits.slice(0, 3).join(', ')}` : 'Подходит как универсальный вариант' } }).sort((a, b) => b.score - a.score)
  return { source: 'stub', is_stub: true, items }
})
R('POST', '/calculator', (c) => { need(c); const { product_code, amount, term_months, has_collateral } = c.body; const p = PRODUCTS[product_code]; const r = rateFor(product_code, 'B', !!has_collateral) - 1.5; const pay = annuity(amount, term_months, r); return { rate_from: r, monthly_payment: Math.round(pay), total_payment: Math.round(pay * term_months), fee: Math.round((amount * p.fee_pct) / 100) } })
R('GET', '/ai/status', () => ({ provider: 'stub', is_stub: true, requested: 'stub', planned_model: 'DeepSeek (open weights, локальный запуск)', features: [
  { key: 'recommend', title: 'Подбор продукта по описанию задачи', where: 'клиент · шаг 1 заявки' }, { key: 'summary', title: 'Сводка по заявке для кредитного специалиста', where: 'банк · карточка заявки' },
  { key: 'explain', title: 'Понятное объяснение статуса и решения', where: 'клиент · карточка заявки' }, { key: 'extract', title: 'Распознавание загруженных документов', where: 'клиент и банк · документы' }] }))

R('GET', '/applications', (c) => { const u = need(c); db.apps.forEach(expire); return db.apps.filter((a) => a.owner_id === u.id).sort((x, y) => y.id - x.id).map(summary) })
R('POST', '/applications', (c) => { const u = need(c); if (u.role !== 'client') throw new ApiError(403, 'Заявку подаёт клиент'); const a = newApp(u, c.body); save(); return detail(a, u) })
R('GET', '/applications/:id', (c) => { const { a, u } = getApp(c, c.m[1]); return detail(a, u) })
R('PATCH', '/applications/:id', (c) => {
  const { a, u } = getApp(c, c.m[1]); if (!['DRAFT', 'NEEDS_INFO'].includes(a.status)) throw new ApiError(409, 'Заявку уже нельзя менять')
  const b = c.body; for (const k of ['amount', 'term_months', 'purpose', 'has_collateral', 'collateral_note', 'product_code']) if (k in b) a[k] = b[k]
  if (b.financials) a.financials = { ...a.financials, ...b.financials }; if (b.contact) a.contact = { ...a.contact, ...b.contact }
  if (b.company_inn && b.company_inn !== a.company.inn) { const e = egrul(b.company_inn); if (!e) throw new ApiError(422, 'Некорректный ИНН'); a.company = { inn: e.inn, name: e.name, legal_form: e.legal_form, ogrn: e.ogrn, okved: e.okved, reg_date: e.reg_date, address: e.address, director: e.director, status: e.status, age_months: e.age_months } }
  a.updated_at = nowIso(); save(); return detail(a, u)
})
R('POST', '/applications/:id/documents', (c) => {
  const { a, u } = getApp(c, c.m[1]); if (!['DRAFT', 'NEEDS_INFO'].includes(a.status)) throw new ApiError(409, 'Документы нельзя добавить на этом этапе')
  const { kind, filename, size } = c.body; if (!DOC_KINDS[kind]) throw new ApiError(422, 'Неизвестный тип документа'); if (size > 5 * 1024 * 1024) throw new ApiError(413, 'Файл больше 5 МБ')
  a.documents = a.documents.filter((d: any) => !(d.kind === kind && d.status === 'rejected')); a.documents.push({ id: nid('doc'), kind, filename, size, status: 'uploaded', review_comment: null })
  log(a, 'document', `Загружен документ: ${DOC_KINDS[kind]}`, filename, u.name); save(); return detail(a, u)
})
R('DELETE', '/applications/:id/documents/:doc', (c) => { const { a, u } = getApp(c, c.m[1]); if (!['DRAFT', 'NEEDS_INFO'].includes(a.status)) throw new ApiError(409, 'Нельзя удалить документ на этом этапе'); a.documents = a.documents.filter((d: any) => d.id !== Number(c.m[2])); save(); return detail(a, u) })
R('POST', '/applications/:id/submit', (c) => {
  const { a, u } = getApp(c, c.m[1]); if (a.status !== 'DRAFT') throw new ApiError(409, 'Заявка уже отправлена')
  go(a, 'SUBMITTED', 'Заявка отправлена в банк', null, u.name); a.submitted_at = nowIso(); void launch(a); return detail(a, u)
})
R('POST', '/applications/:id/info-requests/:rid/answer', (c) => {
  const { a, u } = getApp(c, c.m[1]); const r = a.info_requests.find((x: any) => x.id === Number(c.m[2])); if (!r || r.status !== 'open' || a.status !== 'NEEDS_INFO') throw new ApiError(409, 'Запрос уже закрыт')
  for (const [k, v] of Object.entries<any>(c.body.fields ?? {})) { if (!(k in FIELD_LABELS)) throw new ApiError(422, `Поле ${k} нельзя изменить`); const [s, n] = k.includes('.') ? k.split('.') : ['purpose', 'purpose']; if (s === 'financials') a.financials[n] = v === '' ? null : Number(v); else if (s === 'contact') a.contact[n] = v; else a.purpose = v }
  const have = new Set(a.documents.filter((d: any) => d.status !== 'rejected').map((d: any) => d.kind))
  const left = r.items.filter((i: any) => (i.type === 'document' && !have.has(i.key)) || (i.type === 'field' && (() => { const [s, n] = i.key.includes('.') ? i.key.split('.') : ['purpose', 'purpose']; const v = s === 'financials' ? a.financials[n] : s === 'contact' ? a.contact[n] : a.purpose; return v == null || v === '' })()) || (i.type === 'text' && !String(c.body.answer ?? '').trim()))
  if (left.length) throw new ApiError(422, 'Не всё заполнено: ' + left.map((i: any) => i.label).join('; '))
  r.status = 'answered'; r.answer = c.body.answer ?? null; r.answered_at = nowIso(); log(a, 'answer', 'Клиент ответил на запрос банка', c.body.answer ?? null, u.name)
  resume(a); save(); return detail(a, u)
})
R('POST', '/applications/:id/offer/accept', (c) => {
  const { a, u } = getApp(c, c.m[1]); if (a.status !== 'OFFER_READY') throw new ApiError(409, 'Предложение недоступно'); const o = a.offers.find((x: any) => x.status === 'proposed'); o.status = 'accepted'
  go(a, 'SIGNING', 'Вы приняли предложение банка', null, u.name); save(); return detail(a, u)
})
R('POST', '/applications/:id/offer/decline', (c) => { const { a, u } = getApp(c, c.m[1]); if (a.status !== 'OFFER_READY') throw new ApiError(409, 'Предложение недоступно'); a.offers.find((x: any) => x.status === 'proposed').status = 'declined'; go(a, 'DECLINED_BY_CLIENT', 'Вы отказались от предложения', c.body?.reason ?? null, u.name); save(); return detail(a, u) })
R('POST', '/applications/:id/sign', (c) => { const { a, u } = getApp(c, c.m[1]); if (a.status !== 'SIGNING') throw new ApiError(409, 'Подписание недоступно'); if (!c.body?.consent) throw new ApiError(422, 'Подтвердите согласие с условиями'); signLoan(a); save(); return detail(a, u) })
R('POST', '/applications/:id/cancel', (c) => { const { a, u } = getApp(c, c.m[1]); if (a.processing) busy(a); go(a, 'CANCELLED', 'Заявка отменена клиентом', null, u.name); save(); return detail(a, u) })
R('GET', '/notifications', (c) => { const u = need(c); return db.notifications.filter((n) => n.user_id === u.id).slice(0, 30) })
R('POST', '/notifications/read-all', (c) => { const u = need(c); db.notifications.forEach((n) => { if (n.user_id === u.id) n.read = true }); save(); return { ok: true } })

// банк
const BANK_GROUPS: Record<string, string[]> = { manual: ['MANUAL_REVIEW'], waiting: ['NEEDS_INFO'], auto: ['SUBMITTED', 'COMPLETENESS_CHECK', 'ENRICHMENT', 'SCORING'], offers: ['OFFER_READY', 'SIGNING'], done: ['DISBURSED', 'REJECTED', 'DECLINED_BY_CLIENT', 'EXPIRED', 'CANCELLED'] }
R('GET', '/bank/applications', (c) => {
  bankOnly(c); db.apps.forEach(expire); const g = c.query.get('group'), q = (c.query.get('q') ?? '').toLowerCase()
  return db.apps.filter((a) => a.status !== 'DRAFT' && (!g || g === 'all' || BANK_GROUPS[g]?.includes(a.status)) && (!q || (a.company.name + a.company.inn + a.number).toLowerCase().includes(q))).sort((x, y) => new Date(y.updated_at).getTime() - new Date(x.updated_at).getTime()).map(summary)
})
R('GET', '/bank/applications/:id', (c) => { const { a, u } = getApp(c, c.m[1], true); return detail(a, u) })
R('POST', '/bank/applications/:id/take', (c) => { const { a, u } = getApp(c, c.m[1], true); a.assigned_to_id = u.id; log(a, 'assign', `Заявку взял в работу: ${u.name}`, null, u.name, false); save(); return detail(a, u) })
R('POST', '/bank/applications/:id/documents/:doc/review', (c) => {
  const { a, u } = getApp(c, c.m[1], true); const d = a.documents.find((x: any) => x.id === Number(c.m[2])); if (!d) throw new ApiError(404, 'Документ не найден')
  d.status = c.body.status; d.review_comment = c.body.comment ?? null; log(a, 'doc_review', `Документ «${DOC_KINDS[d.kind]}»: ${d.status === 'verified' ? 'принят' : 'отклонён'}`, d.review_comment, u.name, d.status === 'rejected'); save(); return detail(a, u)
})
R('POST', '/bank/applications/:id/request-info', (c) => {
  const { a, u } = getApp(c, c.m[1], true); if (a.status !== 'MANUAL_REVIEW') throw new ApiError(409, 'Запрос можно отправить только по заявке на рассмотрении')
  const items = (c.body.items ?? []).length ? c.body.items : [{ type: 'text', label: 'Пояснение' }]
  a.info_requests.push({ id: nid('req'), message: c.body.message, items, status: 'open', answer: null, created_by: u.name, created_at: nowIso() }); a.resume_to = 'MANUAL_REVIEW'
  go(a, 'NEEDS_INFO', 'Банк запросил уточнения', c.body.message, u.name); notify(a.owner_id, a, `Заявка ${a.number}: нужны уточнения`); save(); return detail(a, u)
})
R('POST', '/bank/applications/:id/rescore', (c) => { const { a, u } = getApp(c, c.m[1], true); if (a.status !== 'MANUAL_REVIEW') throw new ApiError(409, 'Пересчёт доступен на рассмотрении'); runScoring(a); log(a, 'rescore', 'Скоринг пересчитан', null, u.name, false); save(); return detail(a, u) })
R('POST', '/bank/applications/:id/decision', (c) => {
  const { a, u } = getApp(c, c.m[1], true); uwOnly(c); if (a.status !== 'MANUAL_REVIEW') throw new ApiError(409, 'Решение уже принято или заявка не на рассмотрении')
  const sc = a.scores[a.scores.length - 1], b = c.body, by = `user:${u.id}`
  if (b.type === 'reject') { if (!REJECT_REASONS[b.reason_code]) throw new ApiError(422, 'Укажите причину отказа'); rejectApp(a, b.reason_code, by, u.name, b.comment) }
  else if (b.type === 'approve' || b.type === 'counter') {
    const amount = b.type === 'approve' ? a.amount : b.amount, term = b.type === 'approve' ? a.term_months : b.term_months
    const p = PRODUCTS[a.product_code]; if (amount < p.min_amount || amount > p.max_amount || term < p.min_term || term > p.max_term) throw new ApiError(422, 'Параметры вне лимитов продукта')
    const rate = b.rate ?? rateFor(a.product_code, sc.grade, a.has_collateral); const pay = annuity(amount, term, rate)
    issueOffer(a, { kind: b.type === 'approve' ? 'initial' : 'counter', amount, term_months: term, rate, monthly_payment: Math.round(pay), total_payment: Math.round(pay * term), fee: Math.round((amount * p.fee_pct) / 100), dscr: dscr(amount, term, rate, freeCash(a)), explanation: b.comment || (b.type === 'approve' ? 'Одобрено кредитным специалистом на запрошенных условиях.' : 'Кредитный специалист скорректировал условия.') }, by, u.name, b.comment || undefined)
  } else throw new ApiError(422, 'Неизвестный тип решения')
  save(); return detail(a, u)
})
R('GET', '/bank/stats', (c) => {
  bankOnly(c); const apps = db.apps.filter((a) => a.status !== 'DRAFT'); const count = (f: (a: any) => boolean) => apps.filter(f).length
  const auto = count((a) => a.decision_by === 'auto'), decided = count((a) => a.decision)
  return {
    total: apps.length, auto_rate: decided ? Math.round((auto / decided) * 100) : 0, avg_amount: apps.length ? Math.round(apps.reduce((s, a) => s + a.amount, 0) / apps.length) : 0,
    funnel: [['Подано', (a: any) => true], ['Прошли проверку данных', (a: any) => !['SUBMITTED', 'COMPLETENESS_CHECK', 'NEEDS_INFO'].includes(a.status) || a.scores.length > 0], ['Оценены скорингом', (a: any) => a.scores.length > 0], ['Получили решение', (a: any) => !!a.decision], ['Одобрены', (a: any) => ['approved', 'counteroffer'].includes(a.decision)], ['Кредит выдан', (a: any) => a.status === 'DISBURSED']].map(([label, f]: any) => ({ status: label, label, count: count(f) })),
    by_route: [['auto_approve', 'Автоматически', 'approved'], ['manual', 'Ручной андеррайтинг', ''], ['reject', 'Автоотказ', '']].map(([route, label]) => ({ route, label, count: count((a: any) => a.scores.length && a.scores[a.scores.length - 1].route === route) })),
  }
})

export async function mockRequest(method: string, path: string, body: any, token: string | null) {
  await sleep(120 + Math.random() * 120)
  const [p, qs] = path.split('?'); const me = token?.startsWith('mock.') ? db.users.find((u) => u.id === Number(token.slice(5))) ?? null : null
  for (const [m, re, fn] of routes) { const mt = p.match(re); if (m === method && mt) { try { return structuredClone(await fn({ me, body, query: new URLSearchParams(qs ?? ''), m: mt })) } catch (e) { if (e instanceof ApiError) throw e; console.error(e); throw new ApiError(500, 'Внутренняя ошибка демо-движка') } } }
  throw new ApiError(404, 'Не найдено: ' + path)
}
