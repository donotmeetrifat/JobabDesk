import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { logSecurityAudit } from "@/lib/security/audit";
import type { AccountRole } from "@/lib/auth/roles";

/**
 * POST /api/workspaces/switch
 * Atomically switches the caller's active workspace / store context.
 * Updates `profiles.account_id` and `profiles.account_role`.
 * Audits all switch events for bank-grade security and IDOR protection.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit switching to 30 requests per minute
    const limit = checkRateLimit(`workspaces:switch:${user.id}`, RATE_LIMITS.adminAction);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    const body = await request.json().catch(() => null);
    const targetAccountId = typeof body?.accountId === "string" ? body.accountId.trim() : "";

    if (!targetAccountId) {
      return NextResponse.json(
        { error: "Target account ID is required" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mvkcheckaxfimlzjqvyz.supabase.co";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createClient: createSupabaseJsClient } = await import("@supabase/supabase-js");
    const admin = serviceKey
      ? createSupabaseJsClient(url, serviceKey.trim(), { auth: { persistSession: false } })
      : supabase;

    // Fetch caller's current active account for audit tracking
    const { data: currentProfile } = await admin
      .from("profiles")
      .select("account_id, account_role")
      .eq("user_id", user.id)
      .maybeSingle();

    const previousAccountId = currentProfile?.account_id ?? null;
    const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip");

    // 1. Try RPC `switch_active_workspace`
    if (typeof supabase.rpc === "function") {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "switch_active_workspace",
          { p_target_account_id: targetAccountId }
        );

        if (!rpcErr && rpcData?.account_id) {
          // Record security audit log
          await logSecurityAudit({
            supabase: admin,
            accountId: targetAccountId,
            actorUserId: user.id,
            action: "workspace_switched",
            resourceType: "workspace",
            resourceId: targetAccountId,
            details: {
              previousAccountId: previousAccountId ?? null,
              targetAccountId,
              storeName: rpcData.account_name ?? "Store",
              role: rpcData.account_role ?? "owner",
            },
            ipAddress: clientIp,
          });

          return NextResponse.json({
            success: true,
            account_id: rpcData.account_id,
            account_name: rpcData.account_name,
            account_role: rpcData.account_role,
            logo_url: rpcData.logo_url ?? null,
          });
        }
      } catch (err) {
        console.warn("[/api/workspaces/switch] RPC failed, using atomic fallback:", err);
      }
    }

    // 2. Direct / Service Role Fallback with strict Anti-IDOR Authorization
    const { data: accountRow } = await admin
      .from("accounts")
      .select("id, name, owner_user_id")
      .eq("id", targetAccountId)
      .maybeSingle();

    if (!accountRow) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    let targetRole: AccountRole | null = null;

    if (accountRow.owner_user_id === user.id) {
      targetRole = "owner";
    } else {
      // Check membership in account_members table
      const { data: memberRow } = await admin
        .from("account_members")
        .select("role")
        .eq("account_id", targetAccountId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberRow?.role) {
        targetRole = memberRow.role as AccountRole;
      }
    }

    // Anti-IDOR: Explicitly reject non-members with 403 Forbidden
    if (!targetRole) {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this workspace" },
        { status: 403 }
      );
    }

    // Atomically update user profile active workspace context
    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        account_id: targetAccountId,
        account_role: targetRole,
      })
      .eq("user_id", user.id);

    if (updateErr) {
      console.error("[/api/workspaces/switch] Profile update error:", updateErr);
      return NextResponse.json(
        { error: "Failed to update active workspace" },
        { status: 500 }
      );
    }

    // Record security audit log
    await logSecurityAudit({
      supabase: admin,
      accountId: targetAccountId,
      actorUserId: user.id,
      action: "workspace_switched",
      resourceType: "workspace",
      resourceId: targetAccountId,
      details: {
        previousAccountId: previousAccountId ?? null,
        targetAccountId,
        storeName: accountRow.name,
        role: targetRole,
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      account_id: targetAccountId,
      account_name: accountRow.name,
      account_role: targetRole,
      logo_url: (accountRow as any)?.logo_url ?? null,
    });
  } catch (err) {
    console.error("[/api/workspaces/switch] error:", err);
    return NextResponse.json(
      { error: "Internal server error switching workspace" },
      { status: 500 }
    );
  }
}
