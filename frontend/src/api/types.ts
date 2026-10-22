// Контракт API (общий для демо-мока и реального бэкенда). См. docs/api.md
export type Role = 'client' | 'operator' | 'underwriter'
export interface Me { id: number; name: string; email: string; role: Role }
export interface DemoAccount { email: string; name: string; role: Role; hint: string }

export interface Product {
  code: string; name: string; tagline: string
  min_amount: number; max_amount: number; min_term: number; max_term: number
  base_rate: number; fee_pct: number; allows_collateral: boolean
  docs: { kind: string; label: string }[]
}
export interface CompanyInfo {
  inn: string; name: string; legal_form: string; ogrn?: string | null; okved?: string | null
  reg_date?: string | null; address?: string | null; director?: string | null; status: string; age_months?: number
}
export type StatusGroup = 'draft' | 'progress' | 'action' | 'final'
export type StatusCode =
  | 'DRAFT' | 'SUBMITTED' | 'COMPLETENESS_CHECK' | 'NEEDS_INFO' | 'ENRICHMENT' | 'SCORING' | 'MANUAL_REVIEW'
  | 'OFFER_READY' | 'REJECTED' | 'SIGNING' | 'DISBURSED' | 'DECLINED_BY_CLIENT' | 'EXPIRED' | 'CANCELLED'

export interface OfferBrief { amount: number; term_months: number; rate: number; monthly_payment: number }
export interface ApplicationSummary {
  id: number; number: string; company_name: string; product_code: string; product_name: string
  amount: number; term_months: number
  status: StatusCode; status_label: string; step: number; group: StatusGroup; hint: string; processing: boolean
  created_at: string; updated_at: string; decision: string | null; offer: OfferBrief | null
  assigned_to: string | null; risk_grade: string | null; score: number | null; route: string | null
  open_requests: number
}
export interface DocumentItem {
  id: number; kind: string; label: string; filename: string; size: number
  status: 'uploaded' | 'verified' | 'rejected'; review_comment: string | null; extraction: string
}
export interface InfoItem { type: 'field' | 'document' | 'text'; key?: string; label: string }
export interface InfoRequest {
  id: number; message: string; items: InfoItem[]; status: 'open' | 'answered'; answer: string | null
  created_by: string; created_at: string
}
export interface Offer {
  id: number; kind: 'initial' | 'counter'; amount: number; term_months: number; rate: number
  monthly_payment: number; total_payment: number; fee: number; explanation: string | null
  status: 'proposed' | 'accepted' | 'declined' | 'superseded'; valid_until: string
}
export interface TimelineEvent {
  id: number; ts: string; kind: string; title: string; detail: string | null; actor: string
  client_visible: boolean; to_status: string | null
}
export interface ScheduleRow { n: number; date: string; payment: number; principal: number; interest: number; balance: number }
export interface LoanInfo {
  contract_number: string; amount: number; rate: number; term_months: number
  signed_at: string; disbursed_at: string; schedule: ScheduleRow[]
}
export interface Financials {
  revenue_year?: number | null; net_profit_year?: number | null
  monthly_turnover?: number | null; monthly_obligations?: number | null
}
export interface ScoreFactor { code: string; name: string; value: string; points: number; comment: string }
export interface ScoreInfo {
  score: number; grade: string; pd: number; dscr: number | null; route: 'auto_approve' | 'manual' | 'reject'
  model_version: string; factors: ScoreFactor[]; stop_factors: { code: string; name: string }[]; flags: string[]
}
export interface BankExtras {
  enrichment: { egrul: any; bki: any; pb: any }
  score: ScoreInfo | null
  ai_summary: { text: string; source: string; is_stub: boolean }
  suggested_offer: (OfferBrief & { kind: string; dscr: number; explanation: string }) | null
  reject_reasons: { code: string; label: string }[]
  can_decide: boolean
  can_edit_docs: boolean
}
export interface ApplicationDetail extends ApplicationSummary {
  steps: string[]
  company: CompanyInfo
  purpose: string | null; has_collateral: boolean; collateral_note: string | null
  financials: Financials; contact: { name?: string; phone?: string }
  documents: DocumentItem[]
  required_documents: { kind: string; label: string; uploaded: boolean }[]
  info_requests: InfoRequest[]
  offers: Offer[]
  events: TimelineEvent[]
  loan: LoanInfo | null
  decision_reason: string | null
  ai_explanation: { text: string; source: string; is_stub: boolean }
  bank?: BankExtras
}
export interface Notification { id: number; application_id: number | null; text: string; read: boolean; created_at: string }
export interface Recommendation { source: string; is_stub: boolean; items: { code: string; score: number; reason: string }[] }
export interface CalcResult { rate_from: number; monthly_payment: number; total_payment: number; fee: number }
export interface Stats {
  total: number; auto_rate: number; funnel: { status: string; label: string; count: number }[]
  by_route: { route: string; label: string; count: number }[]; avg_amount: number
}
export interface AiStatus { provider: string; is_stub: boolean; requested: string; planned_model: string; features: { key: string; title: string; where: string }[] }
export interface DemoInn { inn: string; title: string; name: string }
