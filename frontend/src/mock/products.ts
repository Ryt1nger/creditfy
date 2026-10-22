import type { Product } from '../api/types'
import catalog from '../config/products.json'
// Каталог — общий JSON с бэкендом (backend/app/config_data/products.json), равенство проверяет тест.
export const DISCLAIMER: string = catalog.disclaimer
export const DOC_KINDS: Record<string, string> = catalog.doc_kinds
export interface Eligibility { forms: string[]; min_business_age_months: number; collateral: 'optional' | 'required' | 'none'; collateral_required_from: number | null }
export type CatalogProduct = Product & { auto_limit: number; keywords: string[]; goals: string[]; eligibility: Eligibility }
export const PRODUCTS: Record<string, CatalogProduct> = Object.fromEntries(
  catalog.products.map((p) => [p.code, { ...p, docs: p.docs.map((k) => ({ kind: k, label: DOC_KINDS[k] })), eligibility: p.eligibility as Eligibility }]),
)
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
