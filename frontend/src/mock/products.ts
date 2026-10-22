import type { Product } from '../api/types'
export const DOC_KINDS: Record<string, string> = {
  bank_statement: 'Выписка по расчётному счёту за 12 месяцев',
  tax_return: 'Налоговая декларация или отчётность за последний год',
  business_plan: 'Бизнес-план проекта',
  invoice: 'Счёт или договор на покупку',
  collateral_doc: 'Документы на предмет залога',
}
type P = Product & { auto_limit: number; keywords: string[] }
const mk = (o: Omit<P, 'docs'> & { docKinds: string[] }): P => ({ ...o, docs: o.docKinds.map((k) => ({ kind: k, label: DOC_KINDS[k] })) })
export const PRODUCTS: Record<string, P> = {
  working_capital: mk({ code: 'working_capital', name: 'Кредит на оборотные средства', tagline: 'Закупка товара, зарплаты, текущие расходы', min_amount: 300000, max_amount: 10000000, min_term: 6, max_term: 36, base_rate: 17.5, fee_pct: 0.5, auto_limit: 3000000, allows_collateral: true, docKinds: ['bank_statement', 'tax_return'], keywords: ['оборот', 'закупк', 'товар', 'зарплат', 'сырь', 'пополн', 'касс', 'сезон', 'аренд', 'реклам'] }),
  investment: mk({ code: 'investment', name: 'Инвестиционный кредит', tagline: 'Развитие: новая точка, ремонт, расширение производства', min_amount: 1000000, max_amount: 30000000, min_term: 12, max_term: 84, base_rate: 16.9, fee_pct: 0.5, auto_limit: 5000000, allows_collateral: true, docKinds: ['bank_statement', 'tax_return', 'business_plan'], keywords: ['открыть', 'открыт', 'расшир', 'ремонт', 'строител', 'новый', 'филиал', 'точк', 'помещени', 'развит', 'запуск'] }),
  equipment: mk({ code: 'equipment', name: 'Кредит на оборудование и транспорт', tagline: 'Покупка станков, техники, автомобилей', min_amount: 500000, max_amount: 15000000, min_term: 12, max_term: 60, base_rate: 16.0, fee_pct: 0.5, auto_limit: 4000000, allows_collateral: true, docKinds: ['bank_statement', 'tax_return', 'invoice'], keywords: ['оборудован', 'станок', 'техник', 'автомоб', 'грузовик', 'транспорт', 'печь', 'холодил', 'трактор', 'купить'] }),
  overdraft: mk({ code: 'overdraft', name: 'Овердрафт', tagline: 'Быстро закрыть кассовый разрыв', min_amount: 100000, max_amount: 5000000, min_term: 12, max_term: 12, base_rate: 19.5, fee_pct: 0, auto_limit: 1500000, allows_collateral: false, docKinds: ['bank_statement', 'tax_return'], keywords: ['разрыв', 'срочно', 'быстро', 'краткосроч', 'оплат', 'поставщик', 'задержк', 'овердрафт'] }),
}
export const GRADE_PREMIUM: Record<string, number> = { A: 0, B: 1.5, C: 3, D: 5 }
export const REJECT_REASONS: Record<string, string> = {
  insufficient_capacity: 'Недостаточная платёжеспособность для запрошенных условий',
  credit_history: 'Негативная кредитная история',
  tax_debt: 'Задолженность по налогам и сборам',
  company_status: 'Статус компании не позволяет выдать финансирование',
  company_age: 'Срок ведения бизнеса меньше минимально допустимого',
  high_risk: 'Высокий уровень кредитного риска',
  policy: 'Не соответствует кредитной политике',
}
