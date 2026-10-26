import { describe, expect, it } from 'vitest'
import { answerSession, openTurn, recommendFor, sessionDict, startSession } from './intake'
import { conflictRatio, recheck, recognize, reviewFields, type Ex } from './docs'
import { SCENARIOS } from './registry'

describe('квиз в демо-режиме зеркалит бэкенд', () => {
  it('спрашивает только недостающее и подбирает оборотный кредит', () => {
    const s = startSession(1, 1, 'Нужно 1,5 млн на закупку товара к сезону, на 2 года')
    expect(openTurn(s)?.field).toBe('legal_form')
    answerSession(s, 'legal_form', 'ООО'); answerSession(s, 'business_age_months', 24)
    expect(s.status).toBe('ready')
    expect(s.portrait.summary).toContain('1,5 млн')
    const r = recommendFor(s)
    expect(r.primary?.code).toBe('working_capital'); expect(r.alternatives).toHaveLength(2); expect(r.disclaimer).toContain('Не оферта')
  })
  it('уточняет двусмысленную цель одним вопросом, варианты — из банка', () => {
    const q = sessionDict(startSession(2, 1, 'Закупить товар и купить холодильник, 900к на полгода')).question!
    expect(q.kind).toBe('clarify'); expect(q.options.map((o) => o.value)).toEqual(['working_capital', 'equipment'])
  })
  it('молодой бизнес без залога отсекает инвестиционный и овердрафт', () => {
    const s = startSession(3, 1, 'Хотим открыть вторую точку и сделать ремонт, 6 млн, без залога')
    answerSession(s, 'legal_form', 'ИП'); answerSession(s, 'business_age_months', 6); answerSession(s, 'term', 36)
    const bad = recommendFor(s).not_suitable.map((x) => x.code)
    expect(bad).toEqual(expect.arrayContaining(['investment', 'overdraft']))
  })
  it('ИИ-формулировки только имитация и не больше трёх', () => {
    const s = startSession(4, 1, 'Нужны деньги на развитие бизнеса, пока не знаю сколько')
    expect(s.ai_calls_used).toBeLessThanOrEqual(3); expect(sessionDict(s).ai.simulated).toBe(true)
  })
})

describe('документы в демо-режиме', () => {
  it('правило расхождения: оборот×12 против выручки > 35%', () => {
    expect(conflictRatio(400_000, 9_000_000)!).toBeGreaterThan(0.35); expect(conflictRatio(5_000_000, 60_000_000)).toBe(0)
  })
  it('комплект ИП Волкова даёт «Требует проверки», у сильного клиента — нет', () => {
    let id = 0; const nid = () => ++id
    for (const [key, conflict] of [['gray', true], ['strong', false]] as const) {
      const inn = SCENARIOS[key].inn, ex: Ex[] = [...recognize('tax_return', 'a.pdf', inn, 1e6, nid, 1).items, ...recognize('bank_statement', 'b.csv', inn, 1e6, nid, 1).items]
      const a = { documents: [{ status: 'uploaded', extractions: ex }], financials: {} as Record<string, number | null> }
      for (const x of ex) a.financials[x.field] = x.value
      recheck(a); expect(ex.some((x) => x.status === 'conflict')).toBe(conflict)
      expect(reviewFields(a).find((f) => f.field === 'revenue_year')!.source).toBe('mock')
    }
  })
  it('сканы (jpg) не распознаются — поля остаются пустыми', () => {
    expect(recognize('tax_return', 'scan.jpg', SCENARIOS.gray.inn, 1e6, () => 1, 1).status).toBe('not_available')
  })
})
