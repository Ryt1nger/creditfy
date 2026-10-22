// Симуляторы ЕГРЮЛ/БКИ/«Прозрачный бизнес» (только для демо-режима без бэкенда). Логика зеркалит backend/app/integrations.
const W10 = [2, 4, 10, 3, 5, 9, 4, 6, 8]
const W11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
const W12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
const ctrl = (d: string, w: number[]) => (d.split('').reduce((s, c, i) => s + Number(c) * w[i], 0) % 11) % 10

export function innValid(inn: string) {
  if (!/^\d+$/.test(inn)) return false
  if (inn.length === 10) return ctrl(inn.slice(0, 9), W10) === Number(inn[9])
  if (inn.length === 12) return ctrl(inn.slice(0, 10), W11) === Number(inn[10]) && ctrl(inn.slice(0, 11), W12) === Number(inn[11])
  return false
}
export function makeInn(base: string) {
  if (base.length === 9) return base + ctrl(base, W10)
  const d11 = base + ctrl(base, W11)
  return d11 + ctrl(d11, W12)
}

interface Profile {
  inn: string; name: string; form: 'ООО' | 'ИП'; okved: string; age_months: number; status: string
  overdue: number; tax_debt: number; flags: string[]; bki_months: number; title: string
  loans?: { lender: string; balance: number; monthly_payment: number; overdue_days: number }[]
}
export const SCENARIOS: Record<string, Profile> = {
  strong: { inn: makeInn('780412345'), name: 'ООО «Север-Логистика»', form: 'ООО', okved: '49.41 Перевозки грузовым автотранспортом', age_months: 84, status: 'active', overdue: 0, tax_debt: 0, flags: [], bki_months: 72, title: 'Сильный клиент → автоодобрение', loans: [{ lender: 'Банк А', balance: 300000, monthly_payment: 35000, overdue_days: 0 }] },
  gray: { inn: makeInn('5001234567'), name: 'ИП Волков Андрей Николаевич', form: 'ИП', okved: '47.19 Розничная торговля в неспециализированных магазинах', age_months: 20, status: 'active', overdue: 12, tax_debt: 0, flags: [], bki_months: 18, title: 'Пограничный → ручной андеррайтинг', loans: [{ lender: 'МФК В', balance: 200000, monthly_payment: 18000, overdue_days: 12 }] },
  tight: { inn: makeInn('783312345'), name: 'ООО «Пекарня №1»', form: 'ООО', okved: '10.71 Производство хлеба и мучных кондитерских изделий', age_months: 58, status: 'active', overdue: 0, tax_debt: 0, flags: [], bki_months: 55, title: 'Не тянет сумму → встречное предложение', loans: [{ lender: 'Банк Б', balance: 250000, monthly_payment: 25000, overdue_days: 0 }] },
  bad: { inn: makeInn('772212345'), name: 'ООО «СтройМонтаж-Плюс»', form: 'ООО', okved: '43.29 Прочие строительно-монтажные работы', age_months: 40, status: 'active', overdue: 124, tax_debt: 910000, flags: ['mass_address'], bki_months: 36, title: 'Стоп-факторы → автоотказ', loans: [{ lender: 'Банк А', balance: 600000, monthly_payment: 40000, overdue_days: 124 }] },
  liquidating: { inn: makeInn('770512345'), name: 'ООО «Гранд-Опт»', form: 'ООО', okved: '46.90 Неспециализированная оптовая торговля', age_months: 60, status: 'liquidating', overdue: 0, tax_debt: 0, flags: [], bki_months: 50, title: 'Компания ликвидируется → отказ' },
  newco: { inn: makeInn('781512345'), name: 'ООО «Старт-Хаб»', form: 'ООО', okved: '62.01 Разработка программного обеспечения', age_months: 3, status: 'active', overdue: 0, tax_debt: 0, flags: [], bki_months: 0, title: 'Бизнесу меньше 6 месяцев → отказ' },
}
const BY_INN = Object.fromEntries(Object.values(SCENARIOS).map((p) => [p.inn, p]))

function hashSeed(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
function rng(seed: string) { let a = hashSeed(seed); return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)]

function profile(inn: string): Profile {
  if (BY_INN[inn]) return BY_INN[inn]
  const r = rng(inn)
  const ip = inn.length === 12
  const fio = `${pick(r, ['Иванов', 'Петров', 'Смирнов', 'Кузнецов', 'Попов'])} ${pick(r, ['Алексей', 'Дмитрий', 'Сергей', 'Ольга', 'Елена'])}`
  return {
    inn, form: ip ? 'ИП' : 'ООО', name: ip ? `ИП ${fio}` : `ООО «${pick(r, ['Вектор', 'Прогресс', 'Горизонт', 'Атлас', 'Меридиан'])}-${1 + Math.floor(r() * 99)}»`,
    okved: pick(r, ['47.11 Розничная торговля продуктами', '56.10 Рестораны и кафе', '43.21 Электромонтажные работы', '68.20 Аренда недвижимого имущества']),
    age_months: 8 + Math.floor(r() * 110), status: 'active', overdue: pick(r, [0, 0, 0, 0, 5, 14]), tax_debt: pick(r, [0, 0, 0, 0, 35000]),
    flags: [], bki_months: 6 + Math.floor(r() * 80), title: '',
  }
}

export function egrul(inn: string) {
  if (!innValid(inn)) return null
  const p = profile(inn), r = rng(inn + 'e')
  const reg = new Date(Date.now() - p.age_months * 30.4 * 864e5).toISOString().slice(0, 10)
  return {
    inn, ogrn: (p.form === 'ИП' ? '3' : '1') + String(Math.floor(r() * 1e12)).padStart(12, '0') + (p.form === 'ИП' ? '00' : ''),
    name: p.name, legal_form: p.form, status: p.status, okved: p.okved, reg_date: reg, age_months: p.age_months,
    address: pick(r, ['г. Москва, ул. Тверская, д. 12', 'г. Санкт-Петербург, Невский пр., д. 44', 'г. Казань, ул. Баумана, д. 7']),
    director: p.form === 'ИП' ? p.name.replace('ИП ', '') : pick(r, ['Иванов Пётр Сергеевич', 'Орлова Анна Викторовна', 'Белов Игорь Олегович']),
    source: 'ЕГРЮЛ/ЕГРИП (симулятор)',
  }
}
export function bki(inn: string) {
  const p = profile(inn), r = rng(inn + 'b')
  const loans: { lender: string; balance: number; monthly_payment: number; overdue_days: number }[] = p.loans ? [...p.loans] : []
  if (!p.loans && p.bki_months >= 6) {
    const n = pick(r, [0, 1, 1, 2])
    for (let i = 0; i < n; i++) loans.push({ lender: pick(r, ['Банк А', 'Банк Б', 'МФК В']), balance: (150 + Math.floor(r() * 750)) * 1000, monthly_payment: (12 + Math.floor(r() * 43)) * 1000, overdue_days: i === 0 ? p.overdue : 0 })
    if (!loans.length && p.overdue) loans.push({ lender: 'Банк А', balance: 400000, monthly_payment: 21000, overdue_days: p.overdue })
  }
  return {
    has_history: p.bki_months > 0, history_months: p.bki_months, active_loans: loans,
    max_overdue_days_24m: Math.max(p.overdue, ...loans.map((l) => l.overdue_days)),
    inquiries_6m: Math.floor(r() * 4), bureau_score: p.bki_months === 0 ? 0 : Math.max(300, Math.min(850, 760 - p.overdue * 2 - Math.floor(r() * 40))),
    source: 'БКИ (симулятор)',
  }
}
export function pb(inn: string) {
  const p = profile(inn), r = rng(inn + 'p')
  return {
    tax_debt: p.tax_debt, employees: p.form === 'ИП' ? Math.floor(r() * 4) : 4 + Math.floor(r() * 57), avg_salary: (38 + Math.floor(r() * 47)) * 1000,
    tax_regime: p.form === 'ИП' ? pick(r, ['УСН 6%', 'УСН 15%']) : pick(r, ['УСН 15%', 'ОСНО', 'УСН 6%']),
    risk_flags: p.flags, arbitration_defendant: p.overdue < 90 ? 0 : 2, source: 'ФНС «Прозрачный бизнес» (симулятор)',
  }
}
export const demoInns = () => Object.values(SCENARIOS).map((p) => ({ inn: p.inn, name: p.name, title: p.title }))
