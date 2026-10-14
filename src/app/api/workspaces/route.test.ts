import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
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

import { GET, POST } from "./route";

describe("/api/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when user is not authenticated", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("No session") });

      const res = await GET();
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns workspaces from RPC get_user_workspaces when available", async () => {
      mocks.getUser.mockResolvedValue({
        data: { user: { id: "user-1", email: "owner@example.com" } },
        error: null,
      });

      mocks.rpc.mockResolvedValue({
        data: [
          {
            account_id: "acc-1",
            account_name: "Dhaka Fashion",
            business_tagline: "Clothing & Apparel",
            logo_url: null,
            role: "owner",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            account_id: "acc-2",
            account_name: "UK Brand Lover",
            business_tagline: "Imported perfumes",
            logo_url: null,
            role: "owner",
            is_active: false,
            created_at: "2026-02-01T00:00:00Z",
          },
        ],
        error: null,
      });

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.workspaces).toHaveLength(2);
      expect(json.activeAccountId).toBe("acc-1");
      expect(json.workspaces[0].name).toBe("Dhaka Fashion");
      expect(json.workspaces[1].name).toBe("UK Brand Lover");
    });
  });

  describe("POST", () => {
    it("returns 401 when user is not authenticated", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("No session") });

      const req = new Request("http://localhost/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Store" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("rejects store name with fewer than 2 characters", async () => {
      mocks.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      const req = new Request("http://localhost/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("at least 2 characters");
    });

    it("rejects store creation when user role is agent with 403 Forbidden", async () => {
      mocks.getUser.mockResolvedValue({
        data: { user: { id: "user-agent" } },
        error: null,
      });

      mocks.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { account_id: "acc-1", account_role: "agent" },
                }),
              })),
            })),
          };
        }
        return { select: vi.fn() };
      });

      const req = new Request("http://localhost/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Rogue Store" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Only store owners and admins can create new workspaces");
    });

    it("successfully creates a workspace via RPC for owner", async () => {
      mocks.getUser.mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      });

      mocks.from.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { account_id: "acc-1", account_role: "owner" },
                }),
              })),
            })),
          };
        }
        return { select: vi.fn() };
      });

      mocks.rpc.mockResolvedValue({
        data: {
          account_id: "acc-new",
          account_name: "Dhanmondi Gadgets",
          account_role: "owner",
        },
        error: null,
      });

      const req = new Request("http://localhost/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Dhanmondi Gadgets",
          businessTagline: "Premium tech accessories",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.workspace.id).toBe("acc-new");
      expect(json.workspace.name).toBe("Dhanmondi Gadgets");
      expect(json.workspace.role).toBe("owner");
      expect(json.workspace.isActive).toBe(true);
    });
  });
});
