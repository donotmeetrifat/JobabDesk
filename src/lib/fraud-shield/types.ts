import type { RiskLevel, RiskDetails, CustomerBlacklistEntry, SteadfastSettings } from '@/types/orders'

export type { RiskLevel, RiskDetails, CustomerBlacklistEntry }

export const HIGH_RISK_RATIO_THRESHOLD = 60 // < 60% delivery ratio is high risk
export const MEDIUM_RISK_RATIO_THRESHOLD = 80 // 60% - 79% is medium risk
export const HIGH_RISK_CANCELLATION_COUNT = 3 // 3+ cancelled parcels is high risk

export interface CustomerRiskAssessment {
  phone: string
  phone_normalized: string
  risk_level: RiskLevel
  delivery_ratio: number
  total_parcels: number
  delivered_parcels: number
  cancelled_parcels: number
  is_blacklisted: boolean
  blacklist_reason?: string | null
  source: 'steadfast' | 'internal' | 'combined' | 'new_customer'
  summary: string
  summaryBn: string
  recommendation: string
  recommendationBn: string
  reasons: string[]
  rawResponse?: unknown
}

export interface AssessCustomerRiskParams {
  phone: string
  accountId: string
  supabase: any
  steadfastSettings?: SteadfastSettings | null
  currentOrderId?: string | null
}
