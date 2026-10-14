import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  logSecurityAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ success: true, remaining: 10, reset: 1000, limit: 10 })),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: { adminAction: { limit: 30, windowMs: 60000 } },
}));

vi.mock("@/lib/security/audit", () => ({
  logSecurityAudit: mocks.logSecurityAudit,
}));

import { POST } from "./route";

describe("/api/workspaces/switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthorized", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("No session") });

    const req = new Request("http://localhost/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "acc-123" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when accountId is missing", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const req = new Request("http://localhost/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Target account ID is required");
  });

  it("successfully switches workspace via RPC and records security audit log", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    // Mock profiles lookup for previous account
    mocks.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { account_id: "acc-previous", account_role: "owner" },
              }),
            })),
          })),
        };
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) };
    });

    mocks.rpc.mockResolvedValue({
      data: {
        account_id: "acc-target",
        account_name: "UK Brand Lover",
        account_role: "owner",
        logo_url: null,
      },
      error: null,
    });

    const req = new Request("http://localhost/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "192.168.1.100" },
      body: JSON.stringify({ accountId: "acc-target" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.account_id).toBe("acc-target");
    expect(json.account_name).toBe("UK Brand Lover");
    expect(json.account_role).toBe("owner");

    // Verify security audit log was invoked
    expect(mocks.logSecurityAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logSecurityAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "workspace_switched",
        accountId: "acc-target",
        actorUserId: "user-1",
        resourceType: "workspace",
        resourceId: "acc-target",
        details: expect.objectContaining({
          previousAccountId: "acc-previous",
          targetAccountId: "acc-target",
          storeName: "UK Brand Lover",
          role: "owner",
        }),
      })
    );
  });

  it("rejects unauthorized user with 403 Forbidden when user is not owner or member", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-intruder" } },
      error: null,
    });

    // Force fallback by having RPC fail
    mocks.rpc.mockRejectedValue(new Error("RPC failed"));

    mocks.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { account_id: "acc-old", account_role: "agent" },
              }),
            })),
          })),
        };
      }
      if (table === "accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "acc-secret", name: "Secret Store", owner_user_id: "other-user" },
              }),
            })),
          })),
        };
      }
      if (table === "account_members") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }), // not a member
              })),
            })),
          })),
        };
      }
      return { select: vi.fn() };
    });

    const req = new Request("http://localhost/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "acc-secret" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Forbidden");
    expect(mocks.logSecurityAudit).not.toHaveBeenCalled();
  });
});
