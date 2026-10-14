import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import type { AccountRole } from "@/lib/auth/roles";

export interface WorkspaceItem {
  id: string;
  name: string;
  businessTagline: string | null;
  logoUrl: string | null;
  role: AccountRole;
  isActive: boolean;
  createdAt: string;
}

/**
 * GET /api/workspaces
 * Returns all stores / workspaces the authenticated user owns or is a member of.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. First attempt: Call migration RPC `get_user_workspaces`
    if (typeof supabase.rpc === "function") {
      try {
        const { data: rpcWorkspaces, error: rpcErr } = await supabase.rpc(
          "get_user_workspaces"
        );

        if (!rpcErr && Array.isArray(rpcWorkspaces) && rpcWorkspaces.length > 0) {
          const workspaces: WorkspaceItem[] = rpcWorkspaces.map((row: any) => ({
            id: row.account_id,
            name: row.account_name,
            businessTagline: row.business_tagline || null,
            logoUrl: row.logo_url || null,
            role: (row.role as AccountRole) || "owner",
            isActive: Boolean(row.is_active),
            createdAt: row.created_at || new Date().toISOString(),
          }));

          const activeAccount = workspaces.find((w) => w.isActive);
          return NextResponse.json({
            workspaces,
            activeAccountId: activeAccount?.id ?? null,
          });
        }
      } catch (err) {
        console.warn("[/api/workspaces] RPC get_user_workspaces failed, using fallback:", err);
      }
    }

    // 2. Resilient Direct / Service Role Fallback
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mvkcheckaxfimlzjqvyz.supabase.co";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createClient: createSupabaseJsClient } = await import("@supabase/supabase-js");
    const dbClient = serviceKey
      ? createSupabaseJsClient(url, serviceKey.trim(), { auth: { persistSession: false } })
      : supabase;

    // Fetch user's active profile
    const { data: profile } = await dbClient
      .from("profiles")
      .select("account_id, account_role")
      .eq("user_id", user.id)
      .maybeSingle();

    const activeAccountId = profile?.account_id ?? null;
    const workspacesMap = new Map<string, WorkspaceItem>();

    // A. Fetch accounts owned by user (safe query with fallback)
    const { data: ownedAccounts } = await dbClient
      .from("accounts")
      .select("id, name, created_at")
      .eq("owner_user_id", user.id);

    if (ownedAccounts && Array.isArray(ownedAccounts)) {
      for (const acc of ownedAccounts) {
        workspacesMap.set(acc.id, {
          id: acc.id,
          name: acc.name,
          businessTagline: null,
          logoUrl: null,
          role: "owner",
          isActive: acc.id === activeAccountId,
          createdAt: acc.created_at || new Date().toISOString(),
        });
      }
    }

    // B. Fetch accounts where user is an account_member
    try {
      const { data: memberRows } = await dbClient
        .from("account_members")
        .select("account_id, role, created_at, accounts(id, name, created_at)")
        .eq("user_id", user.id);

      if (memberRows && Array.isArray(memberRows)) {
        for (const row of memberRows) {
          const acc = row.accounts as any;
          if (acc?.id && !workspacesMap.has(acc.id)) {
            workspacesMap.set(acc.id, {
              id: acc.id,
              name: acc.name,
              businessTagline: null,
              logoUrl: null,
              role: (row.role as AccountRole) || "agent",
              isActive: acc.id === activeAccountId,
              createdAt: acc.created_at || row.created_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch (e) {
      // Ignore if account_members table does not exist yet
    }

    // C. Guarantee the user's currently active store from profiles is included
    if (activeAccountId && !workspacesMap.has(activeAccountId)) {
      const { data: singleAcc } = await dbClient
        .from("accounts")
        .select("id, name, created_at")
        .eq("id", activeAccountId)
        .maybeSingle();

      if (singleAcc) {
        workspacesMap.set(singleAcc.id, {
          id: singleAcc.id,
          name: singleAcc.name,
          businessTagline: null,
          logoUrl: null,
          role: (profile?.account_role as AccountRole) || "owner",
          isActive: true,
          createdAt: singleAcc.created_at || new Date().toISOString(),
        });
      }
    }

    const workspaces = Array.from(workspacesMap.values()).sort((a, b) => {
      if (a.isActive) return -1;
      if (b.isActive) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return NextResponse.json({
      workspaces,
      activeAccountId,
    });
  } catch (err) {
    console.error("[/api/workspaces] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch workspaces" }, { status: 500 });
  }
}

/**
 * POST /api/workspaces
 * Creates a brand new store workspace and switches to it.
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

    const limit = checkRateLimit(`workspaces:create:${user.id}`, RATE_LIMITS.adminAction);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    const body = await request.json().catch(() => null);
    const storeName = typeof body?.name === "string" ? body.name.trim() : "";
    const tagline = typeof body?.businessTagline === "string" ? body.businessTagline.trim() : null;

    if (!storeName || storeName.length < 2) {
      return NextResponse.json(
        { error: "Store name must be at least 2 characters long" },
        { status: 400 }
      );
    }

    // Role-gate check: Only owners and admins can create new store workspaces
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_role, account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const callerRole = profile?.account_role as AccountRole | undefined;

    if (callerRole && callerRole !== "owner" && callerRole !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only store owners and admins can create new workspaces" },
        { status: 403 }
      );
    }

    // 1. Attempt using RPC
    if (typeof supabase.rpc === "function") {
      try {
        const { data: rpcResult, error: rpcErr } = await supabase.rpc(
          "create_new_workspace",
          {
            p_store_name: storeName,
            p_business_tagline: tagline,
          }
        );

        if (!rpcErr && rpcResult?.account_id) {
          return NextResponse.json({
            success: true,
            workspace: {
              id: rpcResult.account_id,
              name: rpcResult.account_name ?? storeName,
              businessTagline: tagline,
              role: "owner" as AccountRole,
              isActive: true,
            },
          });
        }
      } catch (err) {
        console.warn("[/api/workspaces] RPC create_new_workspace failed, using fallback:", err);
      }
    }

    // 2. Direct Fallback
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mvkcheckaxfimlzjqvyz.supabase.co";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createClient: createSupabaseJsClient } = await import("@supabase/supabase-js");
    const admin = serviceKey
      ? createSupabaseJsClient(url, serviceKey.trim(), { auth: { persistSession: false } })
      : supabase;

    const { data: newAccount, error: accErr } = await admin
      .from("accounts")
      .insert({
        name: storeName,
        business_tagline: tagline,
        owner_user_id: user.id,
      })
      .select("id, name, created_at")
      .single();

    if (accErr || !newAccount) {
      console.error("[/api/workspaces] Account insert error:", accErr);
      return NextResponse.json(
        { error: accErr?.message || "Failed to create store workspace" },
        { status: 500 }
      );
    }

    // Insert membership
    try {
      await admin.from("account_members").upsert(
        {
          account_id: newAccount.id,
          user_id: user.id,
          role: "owner",
        },
        { onConflict: "account_id,user_id" }
      );
    } catch {}

    // Switch caller's profile
    await admin
      .from("profiles")
      .update({
        account_id: newAccount.id,
        account_role: "owner",
      })
      .eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      workspace: {
        id: newAccount.id,
        name: newAccount.name,
        businessTagline: tagline,
        role: "owner" as AccountRole,
        isActive: true,
        createdAt: newAccount.created_at,
      },
    });
  } catch (err) {
    console.error("[/api/workspaces] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error creating workspace" },
      { status: 500 }
    );
  }
}
