"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useAuth, type WorkspaceItem } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Crown,
  Loader2,
  Plus,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Store,
  User,
  UserCog,
} from "lucide-react";

const PALETTES = [
  "from-violet-600 to-indigo-600 text-white",
  "from-emerald-500 to-teal-700 text-white",
  "from-amber-500 to-orange-600 text-white",
  "from-rose-500 to-pink-600 text-white",
  "from-cyan-500 to-blue-600 text-white",
  "from-fuchsia-600 to-purple-600 text-white",
];

function getPalette(idOrName: string) {
  let hash = 0;
  for (let i = 0; i < idOrName.length; i++) {
    hash = (hash << 5) - hash + idOrName.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTES.length;
  return PALETTES[index];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface WorkspaceSwitcherProps {
  className?: string;
  onSelect?: () => void;
}

export function WorkspaceSwitcher({ className, onSelect }: WorkspaceSwitcherProps) {
  const {
    account,
    accountId,
    accountRole,
    workspaces,
    workspacesLoading,
    switchWorkspace,
    createWorkspace,
  } = useAuth();

  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreTagline, setNewStoreTagline] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();

  // Active store display name
  const activeName = account?.name || "My Store";
  const activePalette = getPalette(accountId || activeName);

  const handleSwitch = async (targetId: string) => {
    if (targetId === accountId || switchingId) return;
    setSwitchingId(targetId);
    try {
      await switchWorkspace(targetId);
      onSelect?.();
    } finally {
      setSwitchingId(null);
    }
  };

  const handleCreateStore = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newStoreName.trim();
    if (trimmed.length < 2) {
      setCreateError("Store name must be at least 2 characters");
      return;
    }
    setCreateError(null);

    startCreateTransition(async () => {
      try {
        await createWorkspace(trimmed, newStoreTagline.trim() || undefined);
        setCreateOpen(false);
        setNewStoreName("");
        setNewStoreTagline("");
        onSelect?.();
      } catch (err: any) {
        setCreateError(err.message || "Failed to create store");
      }
    });
  };

  return (
    <>
      <div className={cn("px-3 py-2", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="group flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-background/50 p-2 text-left transition-all duration-150 hover:border-primary/40 hover:bg-muted/50 hover:shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            }
          >
            {/* Store Avatar */}
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br font-semibold text-xs shadow-xs",
                activePalette
              )}
            >
              {getInitials(activeName)}
            </div>

            {/* Store Information */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  {activeName}
                </span>
                {accountRole === "owner" && (
                  <Crown className="size-3 shrink-0 text-amber-500" />
                )}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {workspaces.length > 1
                  ? `${workspaces.length} stores • Switch`
                  : "Active Store"}
              </p>
            </div>

            {/* Switch Chevron */}
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground/80 group-hover:text-foreground transition-colors" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className="w-64 p-1.5 shadow-xl ring-1 ring-border bg-popover text-popover-foreground rounded-xl"
          >
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workspaces & Stores
              </span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {workspaces.length} {workspaces.length === 1 ? "store" : "stores"}
              </span>
            </div>

            {/* Store List */}
            <div className="max-h-60 overflow-y-auto py-1">
              {workspaces.map((ws) => {
                const isActive = ws.id === accountId;
                const isTargetSwitching = switchingId === ws.id;
                const palette = getPalette(ws.id || ws.name);

                return (
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => handleSwitch(ws.id)}
                    disabled={isTargetSwitching || (isActive && !switchingId)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors text-popover-foreground",
                      isActive
                        ? "bg-primary/10 font-medium text-primary focus:bg-primary/15"
                        : "hover:bg-muted/70 focus:bg-muted/70"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-[10px] font-bold shadow-2xs",
                        palette
                      )}
                    >
                      {getInitials(ws.name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-foreground">
                          {ws.name}
                        </span>
                        {ws.role === "owner" ? (
                          <Crown className="size-2.5 text-amber-500 shrink-0" />
                        ) : null}
                      </div>
                      {ws.businessTagline ? (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {ws.businessTagline}
                        </p>
                      ) : (
                        <p className="truncate text-[10px] text-muted-foreground capitalize">
                          {ws.role}
                        </p>
                      )}
                    </div>

                    {isTargetSwitching ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                    ) : isActive ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}

              {workspacesLoading && workspaces.length === 0 && (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading stores...
                </div>
              )}
            </div>

            <DropdownMenuSeparator className="my-1.5 bg-border/60" />

            {/* Create New Store Action */}
            <DropdownMenuItem
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70 focus:bg-muted/70 cursor-pointer"
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40">
                <Plus className="size-3.5 text-foreground" />
              </div>
              <span className="flex-1">Create New Store</span>
              <Sparkles className="size-3 text-amber-500" />
            </DropdownMenuItem>

            {/* Store Settings Link */}
            <DropdownMenuItem
              render={
                <Link
                  href="/settings"
                  onClick={onSelect}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 focus:bg-muted/70 cursor-pointer"
                />
              }
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/40">
                <Settings className="size-3.5" />
              </div>
              <span>Store Settings</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Create New Store Workspace Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-popover p-6 shadow-2xl border border-border">
          <form onSubmit={handleCreateStore}>
            <DialogHeader className="gap-2.5">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                <Store className="size-5.5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  Create New Store Workspace
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Add another store, brand, or e-commerce shop to your account.
                  Orders, products, payment links, and chats will remain 100%
                  isolated to this workspace.
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {createError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {createError}
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="store-name"
                  className="text-xs font-semibold text-foreground flex items-center justify-between"
                >
                  <span>Store Name</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Required
                  </span>
                </label>
                <Input
                  id="store-name"
                  placeholder="e.g. Dhanmondi Gadgets, UK Brand Lover"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  disabled={isCreating}
                  required
                  autoFocus
                  className="h-9 text-sm rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="store-tagline"
                  className="text-xs font-semibold text-foreground flex items-center justify-between"
                >
                  <span>Business Tagline</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Optional
                  </span>
                </label>
                <Input
                  id="store-tagline"
                  placeholder="e.g. Authentic Imported Electronics & Accessories"
                  value={newStoreTagline}
                  onChange={(e) => setNewStoreTagline(e.target.value)}
                  disabled={isCreating}
                  className="h-9 text-sm rounded-lg"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isCreating || newStoreName.trim().length < 2}
                className="gap-1.5"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Creating Store...
                  </>
                ) : (
                  <>
                    <Plus className="size-3.5" />
                    Create & Switch
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
