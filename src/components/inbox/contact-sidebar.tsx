"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Conversation } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Bot,
  ExternalLink,
  MessageSquare,
  MapPin,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslations } from "next-intl";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { extractCustomerInfoFromMessage } from "@/lib/contacts/extract-info";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
  conversation?: Conversation | null;
  pageId?: string | null;
  onContactUpdated?: (updatedContact: Contact) => void;
  onConversationUpdated?: (updates: Partial<Conversation>) => void;
}

export function ContactSidebar({
  contact,
  conversation,
  pageId,
  onContactUpdated,
  onConversationUpdated,
}: ContactSidebarProps) {
  const tThread = useTranslations("Inbox.messageThread");

  const effectiveContact: Contact | null = useMemo(() => {
    if (contact) return contact;
    if (!conversation) return null;
    return {
      id: conversation.contact_id || conversation.id,
      user_id: conversation.user_id || "",
      account_id: conversation.account_id || "",
      phone: "",
      name: "Messenger User",
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      company: "Facebook Messenger",
      ai_auto_reply_muted: conversation.ai_autoreply_disabled,
    };
  }, [contact, conversation]);

  const { accountId } = useAuth();
  const [phoneCopied, setPhoneCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [togglingAiMute, setTogglingAiMute] = useState(false);
  const [aiMuted, setAiMuted] = useState(
    Boolean(contact?.ai_auto_reply_muted ?? conversation?.ai_autoreply_disabled ?? false)
  );

  // Store latest callbacks in refs so effects don't loop on parent re-renders
  const onContactUpdatedRef = useRef(onContactUpdated);
  useEffect(() => {
    onContactUpdatedRef.current = onContactUpdated;
  });

  const onConversationUpdatedRef = useRef(onConversationUpdated);
  useEffect(() => {
    onConversationUpdatedRef.current = onConversationUpdated;
  });

  // Track conversations that had auto-extraction run to guarantee strictly 1 run per conversation
  const scannedConvsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setAiMuted(
      Boolean(contact?.ai_auto_reply_muted ?? conversation?.ai_autoreply_disabled ?? false)
    );
  }, [contact?.ai_auto_reply_muted, conversation?.ai_autoreply_disabled]);

  // Realtime listener for Contact changes (phone, address, etc.)
  useEffect(() => {
    if (!effectiveContact?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`contact_sidebar_${effectiveContact.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "contacts",
          filter: `id=eq.${effectiveContact.id}`,
        },
        (payload) => {
          if (payload.new) {
            onContactUpdatedRef.current?.(payload.new as Contact);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveContact?.id]);

  // If address or phone is missing, check recent messages and auto-populate (run once per conversation)
  useEffect(() => {
    if (!effectiveContact?.id || !conversation?.id || !accountId) return;
    if (scannedConvsRef.current.has(conversation.id)) return;
    if (effectiveContact.address && effectiveContact.phone?.startsWith("+")) return;

    scannedConvsRef.current.add(conversation.id);

    const supabase = createClient();
    supabase
      .from("messages")
      .select("content_text")
      .eq("conversation_id", conversation.id)
      .eq("sender_type", "customer")
      .order("created_at", { ascending: false })
      .limit(6)
      .then(async ({ data: msgs }) => {
        if (!msgs || msgs.length === 0) return;
        for (const m of msgs) {
          if (m.content_text) {
            const info = extractCustomerInfoFromMessage(m.content_text);
            const needsAddress = !effectiveContact.address && Boolean(info.address);
            const needsPhone =
              (!effectiveContact.phone || !effectiveContact.phone.startsWith("+")) &&
              Boolean(info.phone);

            if (needsAddress || needsPhone) {
              try {
                const res = await fetch(`/api/contacts/${effectiveContact.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    address: info.address || undefined,
                    phone: info.phone || undefined,
                  }),
                });
                if (res.ok) {
                  const json = await res.json();
                  if (json.contact) {
                    onContactUpdatedRef.current?.(json.contact);
                  }
                }
              } catch {}
              break;
            }
          }
        }
      });
  }, [conversation?.id, effectiveContact?.id, effectiveContact?.address, effectiveContact?.phone, accountId]);

  const handleToggleAiMute = useCallback(async () => {
    const targetId = contact?.id || conversation?.contact_id || conversation?.id;
    if (!targetId) return;

    const next = !aiMuted;
    setAiMuted(next);
    setTogglingAiMute(true);

    try {
      const res = await fetch(`/api/contacts/${targetId}/ai-mute`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_auto_reply_muted: next,
          conversation_id: conversation?.id,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || "Failed to update AI mute status");
      }

      const data = await res.json();
      if (data?.contact) {
        onContactUpdatedRef.current?.(data.contact);
      }
      if (conversation?.id) {
        onConversationUpdatedRef.current?.({ ai_autoreply_disabled: next });
      }

      toast.success(next ? "AI auto-reply muted for this customer" : "AI auto-reply resumed");
    } catch (err: any) {
      setAiMuted(!next);
      toast.error(err?.message || "Failed to update AI status");
    } finally {
      setTogglingAiMute(false);
    }
  }, [aiMuted, contact?.id, conversation?.id, conversation?.contact_id]);

  const handleCopy = (text: string, type: "phone" | "address") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === "phone") {
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 2000);
      toast.success("Phone number copied to clipboard");
    } else {
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
      toast.success("Address copied to clipboard");
    }
  };

  if (!effectiveContact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const isMessenger = Boolean(
    effectiveContact.company === "Facebook Messenger" ||
    effectiveContact.channel === "messenger" ||
    effectiveContact.messenger_id ||
    (effectiveContact.phone && !effectiveContact.phone.startsWith("+") && !isNaN(Number(effectiveContact.phone)))
  );

  // Resolve real Facebook PSID (Page-Scoped ID) synchronously for deep-linking
  const targetFbId =
    effectiveContact.messenger_id ||
    effectiveContact.wa_user_id ||
    (effectiveContact.phone &&
      !effectiveContact.phone.startsWith("+") &&
      !isNaN(Number(effectiveContact.phone)) &&
      effectiveContact.phone.length >= 10
      ? effectiveContact.phone
      : null);

  // Specific thread URL for Meta Business Suite
  const metaInboxUrl = targetFbId
    ? `https://business.facebook.com/latest/inbox/messenger?selected_item_id=${targetFbId}${pageId ? `&mailbox_id=${pageId}` : ""}`
    : pageId
    ? `https://business.facebook.com/latest/inbox/messenger?mailbox_id=${pageId}`
    : "https://business.facebook.com/latest/inbox";

  // Specific thread URL for Messenger Web
  const messengerWebUrl = targetFbId
    ? `https://www.messenger.com/t/${targetFbId}`
    : "https://www.messenger.com";

  // Format phone display: hide raw Facebook PSID numbers from Phone field
  const isPhoneRawPsid =
    effectiveContact.phone &&
    !effectiveContact.phone.startsWith("+") &&
    effectiveContact.phone.length >= 14 &&
    /^\d+$/.test(effectiveContact.phone);

  const displayPhone = isPhoneRawPsid ? null : effectiveContact.phone || null;

  const displayName =
    effectiveContact.name && effectiveContact.name !== "Unknown"
      ? effectiveContact.name
      : isMessenger
      ? `Messenger User (${targetFbId ? targetFbId.slice(-4) : ""})`
      : contactHandle(effectiveContact);
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info Header */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground overflow-hidden shadow-inner">
              {effectiveContact.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={effectiveContact.avatar_url}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="h-16 w-16 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {isMessenger ? (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                Facebook Messenger
              </span>
            ) : effectiveContact.company ? (
              <p className="mt-1 text-xs text-muted-foreground">{effectiveContact.company}</p>
            ) : null}
          </div>

          {/* Messenger Direct Links */}
          {isMessenger && (
            <div className="mt-4 space-y-2">
              <a
                href={messengerWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors shadow-2xs"
              >
                <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                Open in Messenger Web
              </a>
              <a
                href={metaInboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                Open in Meta Business Inbox
              </a>
            </div>
          )}

          {/* Customer Details: Phone & Address */}
          <div className="mt-4 space-y-2.5">
            {/* Phone Number Box */}
            <div className="rounded-xl border border-border bg-muted/40 p-3 transition-colors hover:border-primary/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 text-primary" />
                  <span>Phone Number</span>
                </div>
                {displayPhone && (
                  <button
                    type="button"
                    onClick={() => handleCopy(displayPhone, "phone")}
                    title="Copy Phone Number"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {phoneCopied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
              <p
                className={cn(
                  "mt-1.5 text-xs",
                  displayPhone ? "font-mono font-medium text-foreground" : "italic text-muted-foreground"
                )}
              >
                {displayPhone || "Not provided yet"}
              </p>
            </div>

            {/* Delivery Address Box */}
            <div className="rounded-xl border border-border bg-muted/40 p-3 transition-colors hover:border-primary/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span>Delivery Address</span>
                </div>
                {effectiveContact.address && (
                  <button
                    type="button"
                    onClick={() => handleCopy(effectiveContact.address!, "address")}
                    title="Copy Delivery Address"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {addressCopied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
              <p
                className={cn(
                  "mt-1.5 text-xs leading-relaxed",
                  effectiveContact.address
                    ? "font-medium text-foreground"
                    : "italic text-muted-foreground"
                )}
              >
                {effectiveContact.address || "No address provided yet"}
              </p>
            </div>

            {/* Email (if available) */}
            {effectiveContact.email && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{effectiveContact.email}</span>
              </div>
            )}
          </div>

          {/* AI Mute Toggle Card */}
          <div className="mt-4 p-3 rounded-xl bg-muted/40 border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Mute AI for this Customer</span>
              <button
                type="button"
                disabled={togglingAiMute}
                onClick={handleToggleAiMute}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                  aiMuted ? "bg-amber-600" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    aiMuted ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {aiMuted && (
              <div className="text-[11px] p-2 rounded-lg bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-medium flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>AI Muted for this contact — manual chat mode</span>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
