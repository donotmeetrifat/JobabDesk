import type { SupabaseClient } from '@supabase/supabase-js'

export interface LogSecurityAuditEventParams {
  supabase: SupabaseClient
  accountId: string
  actorUserId: string
  action: string
  resourceType: string
  resourceId?: string | null
  details?: Record<string, any>
  ipAddress?: string | null
}

export interface SecurityAuditLogRow {
  id: string
  account_id: string
  actor_user_id: string
  action: string
  resource_type: string
  resource_id: string | null
  details: Record<string, any>
  ip_address: string | null
  created_at: string
}

/**
 * Record a security-critical action into security_audit_logs table.
 * Designed to be non-blocking and fail-safe.
 */
export async function logSecurityAudit(params: LogSecurityAuditEventParams): Promise<void> {
  const {
    supabase,
    accountId,
    actorUserId,
    action,
    resourceType,
    resourceId = null,
    details = {},
    ipAddress = null,
  } = params

  try {
    await supabase.from('security_audit_logs').insert({
      account_id: accountId,
      actor_user_id: actorUserId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      ip_address: ipAddress,
    })
  } catch (err) {
    console.warn('[logSecurityAudit] Failed to record audit log:', err)
  }
}
