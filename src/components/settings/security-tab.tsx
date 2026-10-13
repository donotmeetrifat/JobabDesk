'use client'

import { useState, useEffect } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  UsersRound,
  Lock,
  Eye,
  EyeOff,
  History,
  CheckCircle2,
  RefreshCw,
  Server,
  UserCheck,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { MembersTab } from '@/components/settings/members-tab'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import type { SecurityAuditLogRow } from '@/lib/security/audit'

const RBAC_TIERS = [
  {
    role: 'owner',
    title: 'Owner',
    color: 'border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-300',
    description: 'Unrestricted control: delete workspace, transfer ownership, view unmasked API tokens, full member authority.',
    canMaskTokens: false,
  },
  {
    role: 'admin',
    title: 'Admin',
    color: 'border-primary/40 bg-primary/10 text-primary',
    description: 'Operational configuration: courier credentials, payment setups, AI templates, view audit logs & invite teammates.',
    canMaskTokens: true,
  },
  {
    role: 'agent',
    title: 'Agent',
    color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    description: 'Daily operational workflow: customer chat, order creation, courier shipping. Sensitive credentials are masked.',
    canMaskTokens: true,
  },
  {
    role: 'viewer',
    title: 'Viewer',
    color: 'border-muted-foreground/30 bg-muted/60 text-muted-foreground',
    description: 'Read-only access: view orders, conversations, contacts, and performance metrics without mutation rights.',
    canMaskTokens: true,
  },
] as const

export function SecurityTab() {
  const { accountRole: role, user } = useAuth()
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLogRow[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const isPrivileged = role === 'owner' || role === 'admin'

  const fetchAuditLogs = async () => {
    if (!isPrivileged) return
    try {
      setLoadingLogs(true)
      const res = await fetch('/api/account/audit-logs?limit=25')
      if (res.ok) {
        const data = await res.json()
        setAuditLogs(data.logs || [])
      }
    } catch (e) {
      console.warn('[SecurityTab] Failed to fetch audit logs:', e)
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    fetchAuditLogs()
  }, [role])

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              Enterprise Security & RBAC Hub
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                Tenant Isolation Active
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Strict multi-tenant boundary checks, 4-tier Role Based Access Control (RBAC), and automated secret masking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="font-mono text-xs capitalize px-2.5 py-1">
            Your Role: {role || 'viewer'}
          </Badge>
        </div>
      </div>

      {/* 2. Security Posture Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Anti-IDOR Tenant Isolation */}
        <Card className="shadow-2xs">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider">
              <Server className="size-4" /> Tenant Isolation
            </div>
            <CardTitle className="text-sm font-bold mt-1">Anti-IDOR Protection</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-1.5 text-foreground font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              Indexed Account-ID Filtering
            </p>
            <p>All database queries & API endpoints enforce account boundary constraints preventing cross-tenant data leakage.</p>
          </CardContent>
        </Card>

        {/* Secret Masking */}
        <Card className="shadow-2xs">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider">
              <KeyRound className="size-4" /> Secret Masking
            </div>
            <CardTitle className="text-sm font-bold mt-1">Token Shielding</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-1.5 text-foreground font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              Non-Owner Token Masking
            </p>
            <p>Couriers, Meta API secrets, and webhook tokens are masked with <code className="bg-muted px-1 rounded">••••••••</code> unless viewed by the account owner.</p>
          </CardContent>
        </Card>

        {/* 4-Tier RBAC */}
        <Card className="shadow-2xs">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider">
              <UserCheck className="size-4" /> RBAC Policy
            </div>
            <CardTitle className="text-sm font-bold mt-1">Principle of Least Privilege</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-1.5 text-foreground font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              4 Distinct Role Levels
            </p>
            <p>Fine-grained permissions partition operational duties (Agents) from credentials, billing, and member governance (Admins & Owners).</p>
          </CardContent>
        </Card>
      </div>

      {/* 3. RBAC Policy Matrix Table */}
      <Card className="shadow-2xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Lock className="size-4 text-primary" /> Role-Based Access Control (RBAC) Matrix
          </CardTitle>
          <CardDescription className="text-xs">
            How permissions and visibility are enforced across team members in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {RBAC_TIERS.map((tier) => (
              <div
                key={tier.role}
                className={`rounded-xl border p-3.5 space-y-2 transition-all ${
                  role === tier.role ? 'ring-2 ring-primary/40 bg-card shadow-sm' : 'bg-muted/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${tier.color}`}>
                    {tier.title}
                  </span>
                  {role === tier.role && (
                    <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">You</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {tier.description}
                </p>
                <div className="pt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                  {tier.canMaskTokens ? (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <EyeOff className="size-3" /> Credentials Masked
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Eye className="size-3" /> Raw Secrets Visible
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 4. Team Members & Access Management */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <UsersRound className="size-4 text-primary" /> Team Members & Roster
            </h3>
            <p className="text-xs text-muted-foreground">
              Invite team members, assign operational roles, or revoke pending invitations.
            </p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-2xs">
          <MembersTab />
        </div>
      </div>

      {/* 5. Security Audit Log Viewer (Privileged Only) */}
      {isPrivileged && (
        <Card className="shadow-2xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <History className="size-4 text-primary" /> Security Audit Log
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time ledger of administrative actions, credential updates, and member invitations.
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={fetchAuditLogs}
              disabled={loadingLogs}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              <RefreshCw className={`size-3 ${loadingLogs ? 'animate-spin text-primary' : ''}`} />
              <span>Refresh</span>
            </button>
          </CardHeader>
          <CardContent>
            {loadingLogs && auditLogs.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                Loading security audit logs...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-6 rounded-lg border border-dashed border-border/80 text-xs text-muted-foreground">
                No recent security audit events recorded yet.
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted/50 border-b text-[11px] font-bold text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Resource</th>
                      <th className="px-3 py-2">Details</th>
                      <th className="px-3 py-2 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5 font-medium text-foreground">
                          <span className="font-mono text-primary font-semibold">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 capitalize text-muted-foreground">
                          {log.resource_type}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground truncate max-w-[200px]" title={JSON.stringify(log.details)}>
                          {Object.keys(log.details || {}).length > 0
                            ? JSON.stringify(log.details)
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('en-GB', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
