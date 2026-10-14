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
 * Returns all stores / workspaces the authenticated user owns or is a member of,
 * along with the currently active workspace ID.
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

    // First attempt: Call the migration RPC `get_user_workspaces`
    if (typeof supabase.rpc === "function") {
      try {
        const { data: rpcWorkspaces, error: rpcErr } = await supabase.rpc(
          "get_user_workspaces"
        );

        if (!rpcErr && Array.isArray(rpcWorkspaces) && rpcWorkspaces.length > 0) {
          const workspaces: WorkspaceItem[] = rpcWorkspaces.map((row: any) => ({
            id: row.account_id,
            name: row.account_name,
            businessTagline: row.business_tagline ?? null,
            logoUrl: row.logo_url ?? null,
            role: row.role as AccountRole,
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
          }));

          const activeAccount = workspaces.find((w) => w.isActive);
          return NextResponse.json({
            workspaces,
            activeAccountId: activeAccount?.id ?? null,
          });
        }
      } catch (err) {
        console.warn("[/api/workspaces] RPC get_user_workspaces failed, falling back:", err);
      }
    }

    // Direct / Service Role Fallback for resilient multi-workspace lookup
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

    // 1. Fetch accounts owned by user
    const { data: ownedAccounts } = await dbClient
      .from("accounts")
      .select("id, name, business_tagline, logo_url, created_at")
      .eq("owner_user_id", user.id);

    // 2. Fetch accounts where user is a member
    const { data: memberRows } = await dbClient
      .from("account_members")
      .select("account_id, role, created_at, accounts(id, name, business_tagline, logo_url, created_at)")
      .eq("user_id", user.id);

    const workspacesMap = new Map<string, WorkspaceItem>();

    // Add owned accounts
    if (ownedAccounts) {
      for (const acc of ownedAccounts) {
        workspacesMap.set(acc.id, {
          id: acc.id,
          name: acc.name,
          businessTagline: acc.business_tagline ?? null,
          logoUrl: acc.logo_url ?? null,
          role: "owner",
          isActive: acc.id === activeAccountId,
          createdAt: acc.created_at,
        });
      }
    }

    // Add member accounts
    if (memberRows) {
      for (const row of memberRows) {
        const acc = row.accounts as any;
        if (acc?.id) {
          const existing = workspacesMap.get(acc.id);
          // If already in map as owner, keep owner role; otherwise set member role
          if (!existing) {
            workspacesMap.set(acc.id, {
              id: acc.id,
              name: acc.name,
              businessTagline: acc.business_tagline ?? null,
              logoUrl: acc.logo_url ?? null,
              role: (row.role as AccountRole) || "agent",
              isActive: acc.id === activeAccountId,
              createdAt: acc.created_at || row.created_at,
            });
          }
        }
      }
    }

    // If still empty (e.g. legacy solo account without owner_user_id populated), check current profile's account
    if (workspacesMap.size === 0 && activeAccountId) {
      const { data: singleAcc } = await dbClient
        .from("accounts")
        .select("id, name, business_tagline, logo_url, created_at")
        .eq("id", activeAccountId)
        .maybeSingle();

      if (singleAcc) {
        workspacesMap.set(singleAcc.id, {
          id: singleAcc.id,
          name: singleAcc.name,
          businessTagline: singleAcc.business_tagline ?? null,
          logoUrl: singleAcc.logo_url ?? null,
          role: (profile?.account_role as AccountRole) || "owner",
          isActive: true,
          createdAt: singleAcc.created_at,
        });
      }
    }

    const workspaces = Array.from(workspacesMap.values()).sort((a, b) => {
      // Current active workspace first, then chronological
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
 * Creates a brand new workspace / store under the authenticated owner's account
 * and automatically switches active context to it.
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

    // Rate limit store creation to 10 per hour per user
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

    if (storeName.length > 80) {
      return NextResponse.json(
        { error: "Store name must be 80 characters or fewer" },
        { status: 400 }
      );
    }

    // 1. Attempt using RPC `create_new_workspace`
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
        console.warn("[/api/workspaces] RPC create_new_workspace failed, using atomic fallback:", err);
      }
    }

    // Fallback: Atomic execution via Supabase client / service role
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mvkcheckaxfimlzjqvyz.supabase.co";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createClient: createSupabaseJsClient } = await import("@supabase/supabase-js");
    const admin = serviceKey
      ? createSupabaseJsClient(url, serviceKey.trim(), { auth: { persistSession: false } })
      : supabase;

    // Insert new account
    const { data: newAccount, error: accErr } = await admin
      .from("accounts")
      .insert({
        name: storeName,
        business_tagline: tagline,
        owner_user_id: user.id,
      })
      .select("id, name, business_tagline, created_at")
      .single();

    if (accErr || !newAccount) {
      console.error("[/api/workspaces] Account insert error:", accErr);
      return NextResponse.json(
        { error: accErr?.message || "Failed to create store workspace" },
        { status: 500 }
      );
    }

    // Insert owner membership in account_members (if table exists)
    try {
      await admin.from("account_members").upsert(
        {
          account_id: newAccount.id,
          user_id: user.id,
          role: "owner",
        },
        { onConflict: "account_id,user_id" }
      );
    } catch (e) {
      console.warn("[/api/workspaces] account_members upsert warning:", e);
    }

    // Atomically update user's profile to switch into the new workspace
    const { error: profErr } = await admin
      .from("profiles")
      .update({
        account_id: newAccount.id,
        account_role: "owner",
      })
      .eq("user_id", user.id);

    if (profErr) {
      console.error("[/api/workspaces] Profile active workspace update error:", profErr);
    }

    return NextResponse.json({
      success: true,
      workspace: {
        id: newAccount.id,
        name: newAccount.name,
        businessTagline: newAccount.business_tagline ?? null,
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
