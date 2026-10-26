// Контракт API (общий для демо-мока и реального бэкенда). См. docs/api.md
export type Role = 'client' | 'operator' | 'underwriter'
export interface Me { id: number; name: string; email: string; role: Role }
export interface DemoAccount { email: string; name: string; role: Role; hint: string }

export interface Product {
  code: string; name: string; tagline: string
  min_amount: number; max_amount: number; min_term: number; max_term: number
  base_rate: number; fee_pct: number; allows_collateral: boolean
  docs: { kind: string; label: string }[]
  conditional_rate?: number | null; discount_conditions?: string; source_url?: string; verified_on?: string; public_conditions?: boolean; term_explanation?: string
  goals?: string[]; disclaimer?: string
  eligibility?: { forms: string[]; min_business_age_months: number; collateral: 'optional' | 'required' | 'none'; collateral_required_from: number | null }
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
  what: string; needs_action: boolean; action_text: string; wizard_step: number
  created_at: string; updated_at: string; decision: string | null; offer: OfferBrief | null
  assigned_to: string | null; risk_grade: string | null; score: number | null; route: string | null
  open_requests: number
}
export interface Extraction {
  id: number; field: string; label: string; value: number | null; original_value: number | null
  source: string; source_label: string; confidence: number; status: 'ok' | 'edited' | 'conflict' | 'confirmed'; note: string | null
}
export interface DocumentItem {
  id: number; kind: string; label: string; filename: string; size: number
  status: 'uploaded' | 'verified' | 'rejected'; review_comment: string | null
  extraction: 'ok' | 'partial' | 'not_available' | 'not_required' | string; extraction_note?: string | null; extractions: Extraction[]
}
export interface ReviewField {
  field: string; label: string; value: number | null; source: string | null; source_label: string
  extraction_id: number | null; status: 'ok' | 'edited' | 'conflict' | 'confirmed' | 'missing'; note: string | null
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
  product?: Product
  steps: string[]
  company: CompanyInfo | null
  review: { fields: ReviewField[]; has_conflicts: boolean }
  purpose: string | null; has_collateral: boolean; collateral_note: string | null
  financials: Financials; contact: { name?: string; phone?: string; role?: string }
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

// ── квиз «опишите задачу» ──
export interface QuizOption { value: string | number; label: string; hint?: string }
export interface QuizQuestion {
  turn_id: number; field: string; kind: 'question' | 'clarify' | 'edit'; text: string; hint: string | null; options: QuizOption[]
  custom?: { placeholder: string } | null; type: 'enum' | 'number'; min?: number | null; max?: number | null
  source: 'bank' | 'ai'; simulated: boolean
}
export interface PortraitItem { field: string; label: string; value: string | number; value_label: string; source: string }
export interface Suggestion {
  code: string; name: string; tagline: string; score: number; amount: number; term_months: number; rate_from: number; monthly_payment: number | null
  reasons: string[]; caveats: string[]; docs: { kind: string; label: string }[]
}
export interface Recommendations {
  primary: Suggestion | null; alternatives: Suggestion[]; not_suitable: { code: string; name: string; why: string[] }[]; disclaimer: string; note: string
}
export interface IntakeSession {
  id: number; text: string; status: 'questions' | 'ready' | 'applied'; question: QuizQuestion | null
  known: Record<string, { value: string | number; label: string; source: string }>
  progress: { done: number; total: number }
  portrait: { items: PortraitItem[]; summary: string } | null; recommendations: Recommendations | null; application_id: number | null
  ai: { enabled: boolean; calls_used: number; max_calls: number; simulated?: boolean }
  history: { field: string; kind: string; question: string; source: string; answer: string | null }[]
}
