import { describe, expect, it } from 'vitest'
import { SCENARIOS, innValid } from '../mock/registry'
import { findOffer, annuity } from '../mock/offers'
import { months, rub } from './format'

describe('демо-движок', () => {
  it('ИНН сценариев совпадают с бэкендом и валидны', () => {
    expect(Object.values(SCENARIOS).map((s) => s.inn)).toEqual(['7804123453', '500123456750', '7833123458', '7722123452', '7705123452', '7815123455'])
    expect(Object.values(SCENARIOS).every((s) => innValid(s.inn))).toBe(true)
    expect(innValid('1234567890')).toBe(false)
  })
  it('платёж и поиск условий совпадают с бэкендом', () => {
    expect(Math.round(annuity(2_500_000, 24, 17.5))).toBe(124207)
    const o = findOffer('equipment', 4_000_000, 36, 'B', false, 147_000)
    expect(o?.kind).toBe('counter')
    expect(findOffer('equipment', 4_000_000, 36, 'B', false, 0)).toBeNull()
  })
  it('форматирование', () => { expect(rub(1234567)).toBe('1 234 567 ₽'); expect(months(24)).toBe('24 месяца'); expect(months(11)).toBe('11 месяцев') })
})
