import { describe, expect, it } from 'vitest'
import cases from '../config/parse_cases.json'
import { parseNeed } from './need'

describe('разбор запроса совпадает с бэкендом (общие кейсы)', () => {
  for (const c of cases.cases) it(c.text.slice(0, 40), () => expect(parseNeed(c.text)).toEqual(c.expect))
})
