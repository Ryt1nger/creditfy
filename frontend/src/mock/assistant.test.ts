import { describe, expect, it } from 'vitest'
import cases from '../config/assistant_cases.json'
import { ask } from './assistant'

describe('помощник: демо-ответы совпадают с бэкендом (общие кейсы)', () => {
  for (const c of cases.cases) it(c.text, () => expect(ask(c.text).intent).toBe(c.intent))
  it('ответ про кредиты содержит все четыре продукта и пометку «демо»', () => {
    const a = ask('какие у вас кредиты').answer
    expect(a).toContain('Овердрафт'); expect(a).toContain('Бизнес-кредит с залогом'); expect(a).toContain('не гарантирует')
  })
})
