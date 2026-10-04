"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  normalizeConversation,
} from "@/lib/inbox/conversations";
import type { Conversation, Message, Contact, ConversationStatus } from "@/types";
import { useRealtime } from "@/hooks/use-realtime";
import { ConversationList } from "@/components/inbox/conversation-list";
import { MessageThread } from "@/components/inbox/message-thread";
import { ContactSidebar } from "@/components/inbox/contact-sidebar";
import { extractCustomerInfoFromMessage, isFacebookPsid } from "@/lib/contacts/extract-info";
import Link from "next/link";
import { toast } from "sonner";
import { WifiOff, RefreshCw, KeyRound, ExternalLink, X, MessageCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Remembers the agent's show/hide choice for the desktop contact panel
// across reloads and sessions (device-scoped, like the theme prefs).
const CONTACT_PANEL_STORAGE_KEY = "jobabdesk:inbox:contact-panel-open";

// `useSearchParams` (the `?c=<id>` deep link below) requires a Suspense
// boundary or the production build bails to CSR and errors out. Thin
// wrapper supplies it; the inner component holds all the inbox state.
export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageInner />
    </Suspense>
  );
}

function InboxPageInner() {
  const t = useTranslations("Inbox.page");
  const router = useRouter();
  const searchParams = useSearchParams();
  /**
   * `?c=<id>` deep-link support. Used when landing here from the
   * dashboard's recent-conversations list so the right thread opens
   * automatically instead of showing the empty center panel.
   */
  const deepLinkConvId = searchParams.get("c");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null
  );
  const [messengerConnected, setMessengerConnected] = useState<boolean | null>(
    null
  );
  const [messengerPageName, setMessengerPageName] = useState<string>("");
  const [messengerPageId, setMessengerPageId] = useState<string>("");
  const [tokenMissing, setTokenMissing] = useState<boolean>(false);
  const [showTokenModal, setShowTokenModal] = useState<boolean>(false);
  const [inputToken, setInputToken] = useState<string>("");
  const [savingToken, setSavingToken] = useState<boolean>(false);
  const [tokenModalError, setTokenModalError] = useState<string>("");
  const [isSyncingMessenger, setIsSyncingMessenger] = useState(false);
  const [isCleaningInbox, setIsCleaningInbox] = useState(false);
  /**
   * Bumped whenever we want children (ConversationList, MessageThread)
   * to refetch from the DB — used as a safety net against missed
   * realtime events. Bumped on WS reconnect and on tab visibility →
   * visible. The initial mount fetches don't depend on this; they fire
   * once on conversationId-change as usual.
   */
  const [resyncToken, setResyncToken] = useState(0);

  /**
   * Whether the desktop contact sidebar (tags / deals / notes) is shown.
   * Defaults to `true` (the historical behaviour) and is restored from
   * localStorage after mount. We deliberately do NOT read localStorage in
   * the initializer: the server renders with `true`, so reading a stored
   * `false` synchronously would produce a hydration mismatch. The effect
   * below reconciles to the stored value right after mount instead.
   */
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONTACT_PANEL_STORAGE_KEY);
      if (stored !== null) setContactPanelOpen(stored === "true");
    } catch {
      // localStorage can throw in private-browsing / sandboxed contexts.
    }
  }, []);

  const handleToggleContactPanel = useCallback(() => {
    setContactPanelOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CONTACT_PANEL_STORAGE_KEY, String(next));
      } catch {
        // Persistence is best-effort; ignore storage failures.
      }
      return next;
    });
  }, []);

  // Fire the deep-link auto-select exactly once per URL — subsequent
  // list refreshes (realtime, manual refetch) must not snap the user
  // back to the deep-linked conversation if they've already clicked
  // elsewhere.
  const autoSelectedForDeepLinkRef = useRef<string | null>(null);

  // Tracks conversations whose hydrate fetch is currently in flight. The
  // conv-INSERT and the first-message-INSERT events both call into
  // hydrateConversation; the dedupe here keeps it at one refetch per
  // new conversation even when both events arrive within milliseconds.
  const hydratingConvIdsRef = useRef<Set<string>>(new Set());

  /**
   * Synchronous mirror of the conversation ids currently in `conversations`
   * state. Event handlers need to know "do we already have this conv?"
   * without waiting for a setState updater to run — updaters fire during
   * reconciliation, *after* the synchronous handler code returns, so a
   * `let foundInList = false; setState(p => { foundInList = ...; return ... })`
   * flag reads as `false` in the same tick (this exact bug shipped in #105
   * and caused #106: every incoming message and every status flip fired a
   * redundant DB hydrate, swamping the supabase client and starving the
   * realtime channel). The ref is kept in sync via the effect below.
   */
  const knownConvIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    for (const c of conversations) next.add(c.id);
    knownConvIdsRef.current = next;
  }, [conversations]);

  // Pull the conversation row with its `contact` joined and merge it
  // into state. Needed because Supabase Realtime payloads only carry the
  // row's own columns — a brand-new conversation arrives without a
  // contact, which surfaced as "Unknown" names, empty avatars, and
  // (when the conv-INSERT event was delayed past the message-INSERT)
  // conversations stuck on "No messages yet" until the user reloaded.
  // Also self-heals if a realtime event was missed: callers can invoke
  // this whenever they reference a conversation id they don't recognise.
  const hydrateConversation = useCallback(async (convId: string) => {
    if (hydratingConvIdsRef.current.has(convId)) return;
    hydratingConvIdsRef.current.add(convId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .eq("id", convId)
        .maybeSingle();
      let fetched: Conversation | null = null;
      if (!error && data) {
        fetched = normalizeConversation(data);
      } else {
        try {
          const res = await fetch("/api/inbox/conversations");
          if (res.ok) {
            const json = await res.json();
            fetched = json.conversations?.find((c: Conversation) => c.id === convId) || null;
          }
        } catch {}
      }
      if (!fetched) return;
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === fetched.id);
        if (existing) {
          // Already in state — keep its fields (a realtime UPDATE may
          // have landed while the fetch was in flight and patched
          // last_message_text / unread_count to fresher values than
          // the row we just read). Only backfill `contact`, which the
          // realtime payloads never carry.
          return prev.map((c) =>
            c.id === fetched.id
              ? { ...c, contact: c.contact ?? fetched.contact }
              : c,
          );
        }
        return [fetched, ...prev];
      });
      if (deepLinkConvId && fetched.id === deepLinkConvId) {
        setActiveConversation(fetched);
        setActiveContact(fetched.contact ?? null);
      }
    } finally {
      hydratingConvIdsRef.current.delete(convId);
    }
  }, [deepLinkConvId]);

  // Check WhatsApp & Facebook Messenger connection status on mount
  useEffect(() => {
    // 1. Instant check from localStorage for instant, zero-flicker UI
    if (typeof window !== "undefined") {
      try {
        const storedFb = localStorage.getItem("jobabdesk_fb_session");
        if (storedFb) {
          const parsed = JSON.parse(storedFb);
          if (parsed?.status === "connected" || parsed?.pageId) {
            setMessengerConnected(true);
            if (parsed.pageName || parsed.pageId) {
              setMessengerPageName(parsed.pageName || parsed.pageId);
            }
            if (parsed.pageId) {
              setMessengerPageId(parsed.pageId);
            }
            if (parsed.accessToken) {
              setInputToken(parsed.accessToken);
            } else {
              setTokenMissing(true);
            }
          }
        }
      } catch {}
    }

    const checkConnection = async () => {
      // 2. Fetch server-verified Facebook Messenger status from API route
      let isFb = false;
      let cachedToken = "";
      try {
        const stored = typeof window !== "undefined" ? localStorage.getItem("jobabdesk_fb_session") : null;
        if (stored) {
          cachedToken = JSON.parse(stored)?.accessToken || "";
        }
      } catch {}

      try {
        const fbRes = await fetch("/api/channels/messenger/connect");
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          isFb = fbData?.status === "connected" || Boolean(fbData?.pageId);
          if (isFb) {
            setMessengerConnected(true);
            if (fbData.pageId) setMessengerPageId(fbData.pageId);
            if (fbData.pageName || fbData.pageId) {
              setMessengerPageName(fbData.pageName || fbData.pageId);
            }
            if (fbData.hasToken === false && !cachedToken) {
              setTokenMissing(true);
            } else if (fbData.hasToken) {
              setTokenMissing(false);
            }
          }
        }
      } catch (fbErr) {
        console.warn("[Messenger status check error]:", fbErr);
      }

      // 3. Fallback: Check /api/ai/settings for facebook_page_id
      if (!isFb) {
        try {
          const aiRes = await fetch("/api/ai/settings");
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const settings = aiData.settings || aiData;
            if (settings?.facebook_page_id || settings?.messenger_status === "connected") {
              isFb = true;
              setMessengerConnected(true);
              if (settings.facebook_page_id) setMessengerPageId(settings.facebook_page_id);
              setMessengerPageName(settings.facebook_page_name || settings.facebook_page_id || "");
              if (settings.facebook_page_access_token) {
                cachedToken = settings.facebook_page_access_token;
                setTokenMissing(false);
              } else if (!cachedToken) {
                setTokenMissing(true);
              }
            }
          }
        } catch {}
      }

      // 4. If Facebook is connected, trigger background sync
      if (isFb) {
        fetch("/api/channels/messenger/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageId: messengerPageId || undefined,
            accessToken: cachedToken || undefined,
          }),
        })
          .then((res) => res.json())
          .then((syncRes) => {
            if (syncRes.success && (syncRes.conversationsCount > 0 || syncRes.messagesCount > 0)) {
              setResyncToken((prev) => prev + 1);
            }
          })
          .catch(() => {});
      }

      // 5. WhatsApp status check
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("account_id")
            .eq("user_id", user.id)
            .maybeSingle();
          const accountId = profile?.account_id || user.id;

          const { data: waData } = await supabase
            .from("whatsapp_config")
            .select("status")
            .eq("account_id", accountId)
            .maybeSingle();

          setWhatsappConnected(waData?.status === "connected");
        }
      } catch {
        setWhatsappConnected(false);
      }
    };

    checkConnection();
  }, [messengerPageId]);

  // Automatic background Messenger sync every 15s so users never need to click sync manually
  useEffect(() => {
    if (!messengerConnected) return;

    const interval = setInterval(() => {
      let pageIdToSend = messengerPageId;
      let tokenToSend = "";

      if (typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem("jobabdesk_fb_session");
          if (cached) {
            const parsed = JSON.parse(cached);
            tokenToSend = parsed.accessToken || "";
            if (!pageIdToSend) pageIdToSend = parsed.pageId || "";
          }
        } catch {}
      }

      fetch("/api/channels/messenger/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: pageIdToSend || undefined,
          accessToken: tokenToSend || undefined,
        }),
      })
        .then((res) => res.json())
        .then((syncRes) => {
          if (syncRes.success && (syncRes.conversationsCount > 0 || syncRes.messagesCount > 0)) {
            setResyncToken((prev) => prev + 1);
          }
        })
        .catch(() => {});
    }, 15000);

    return () => clearInterval(interval);
  }, [messengerConnected, messengerPageId]);

  const handleSyncMessenger = useCallback(
    async (customToken?: string) => {
      let tokenToSend = (typeof customToken === "string" ? customToken : "").trim();
      let pageIdToSend = messengerPageId;

      if (!tokenToSend && typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem("jobabdesk_fb_session");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.accessToken) tokenToSend = parsed.accessToken.trim();
            if (!pageIdToSend && parsed.pageId) pageIdToSend = parsed.pageId;
          }
        } catch {}
      }

      // If token is missing and not provided, prompt user with modal
      if (!tokenToSend && tokenMissing) {
        setShowTokenModal(true);
        return;
      }

      setIsSyncingMessenger(true);
      setSavingToken(true);

      try {
        const res = await fetch("/api/channels/messenger/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageId: pageIdToSend || undefined,
            accessToken: tokenToSend || undefined,
          }),
        });
        const data = await res.json();

        if (data.success) {
          setTokenModalError("");
          if (tokenToSend && typeof window !== "undefined") {
            try {
              const stored = localStorage.getItem("jobabdesk_fb_session");
              const existing = stored ? JSON.parse(stored) : {};
              localStorage.setItem(
                "jobabdesk_fb_session",
                JSON.stringify({
                  ...existing,
                  status: "connected",
                  pageId: pageIdToSend || existing.pageId,
                  pageName: messengerPageName || existing.pageName,
                  accessToken: tokenToSend,
                })
              );
            } catch {}
          }
          setTokenMissing(false);
          setShowTokenModal(false);
          if (data.pageName) {
            setMessengerPageName(data.pageName);
          }
          if (data.debug?.pageId) {
            setMessengerPageId(data.debug.pageId);
          }

          if (data.conversationsCount > 0) {
            toast.success(
              `Messenger synced! ${data.conversationsCount} conversation(s), ${data.messagesCount} message(s).`
            );
          } else {
            const rawCount = data.debug?.rawMetaCount ?? 0;
            if (rawCount > 0) {
              toast.warning(
                `Found ${rawCount} conversation(s) on Meta, but failed to save: ${data.debug?.errors?.join("; ") || "Check database logs"}`
              );
            } else {
              toast.info(
                `Synced with Facebook (${data.pageName || "Page"}). Meta returned 0 Messenger conversations.`
              );
            }
          }
          setResyncToken((prev) => prev + 1);
        } else {
          setTokenModalError(data.error || "Failed to sync Messenger conversations");
          if (
            data.tokenMissing ||
            data.error?.toLowerCase().includes("token") ||
            data.error?.toLowerCase().includes("missing")
          ) {
            setTokenMissing(true);
            setShowTokenModal(true);
          }
          toast.error(data.error || "Failed to sync Messenger conversations");
        }
      } catch (err: any) {
        setTokenModalError(err.message || "Network error syncing Messenger");
        toast.error(err.message || "Network error syncing Messenger");
      } finally {
        setIsSyncingMessenger(false);
        setSavingToken(false);
      }
    },
    [messengerPageId, messengerPageName, tokenMissing]
  );

  const handleCleanInbox = useCallback(async () => {
    if (
      !window.confirm(
        "Are you sure you want to clean foreign/stale conversations from your inbox? This will remove UK Brand Lover / old messages and reload fresh Digiplus chats."
      )
    ) {
      return;
    }
    setIsCleaningInbox(true);
    try {
      const res = await fetch("/api/channels/messenger/purge", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Inbox cleared successfully!");
        setConversations([]);
        setActiveConversation(null);
        setActiveContact(null);
        setMessages([]);
        setResyncToken((prev) => prev + 1);
        await handleSyncMessenger();
      } else {
        toast.error(data.error || "Failed to clear inbox");
      }
    } catch {
      toast.error("Network error while clearing inbox");
    } finally {
      setIsCleaningInbox(false);
    }
  }, [handleSyncMessenger]);

  // Automatically synchronizes extracted customer contact details (phone, address)
  // across activeContact state, conversation list preview, and Postgres database
  const syncExtractedContactInfo = useCallback(
    (contactId: string, info: { phone?: string | null; address?: string | null }) => {
      if (!contactId || (!info.phone && !info.address)) return;

      // Optimistically update activeContact if it matches
      setActiveContact((prev) => {
        if (!prev || prev.id !== contactId) return prev;
        const next = { ...prev };
        let changed = false;
        if (info.phone && (!prev.phone || isFacebookPsid(prev.phone))) {
          next.phone = info.phone;
          changed = true;
        }
        if (info.address && !prev.address) {
          next.address = info.address;
          changed = true;
        }
        return changed ? next : prev;
      });

      // Optimistically update conversation list contact
      setConversations((prev) =>
        prev.map((c) => {
          if (c.contact_id !== contactId && c.contact?.id !== contactId) return c;
          const currentContact = c.contact;
          if (!currentContact) return c;
          return {
            ...c,
            contact: {
              ...currentContact,
              phone:
                info.phone && (!currentContact.phone || isFacebookPsid(currentContact.phone))
                  ? info.phone
                  : currentContact.phone,
              address: info.address && !currentContact.address ? info.address : currentContact.address,
            },
          };
        })
      );

      // Persist to database in background
      fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: info.phone || undefined,
          address: info.address || undefined,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.contact) {
            setActiveContact((prev) => {
              if (!prev || prev.id !== json.contact.id) return prev;
              const current = prev;
              const keepPhone =
                current.phone &&
                !isFacebookPsid(current.phone) &&
                (!json.contact.phone || isFacebookPsid(json.contact.phone));
              const keepAddress = current.address && !json.contact.address;

              return {
                ...current,
                ...json.contact,
                phone: keepPhone ? current.phone : (json.contact.phone || current.phone || ''),
                address: keepAddress ? current.address : (json.contact.address || current.address),
              };
            });
            setConversations((prev) =>
              prev.map((c) => {
                if (c.contact_id !== json.contact.id && c.contact?.id !== json.contact.id) return c;
                const prevPhone = c.contact?.phone || '';
                const keepPhone =
                  prevPhone &&
                  !isFacebookPsid(prevPhone) &&
                  (!json.contact.phone || isFacebookPsid(json.contact.phone));
                const keepAddress = c.contact?.address && !json.contact.address;

                return {
                  ...c,
                  contact: {
                    ...(c.contact || {}),
                    ...json.contact,
                    phone: keepPhone ? prevPhone : (json.contact.phone || prevPhone || ''),
                    address: keepAddress ? c.contact?.address : (json.contact.address || c.contact?.address),
                  },
                };
              })
            );
          }
        })
        .catch(() => {});
    },
    []
  );

  // Handle realtime message events
  const handleMessageEvent = useCallback(
    (event: { eventType: string; new: Message; old: Partial<Message> }) => {
      const newMsg = event.new;

      if (event.eventType === "INSERT") {
        // Add to messages if it belongs to active conversation
        if (
          activeConversation &&
          newMsg.conversation_id === activeConversation.id
        ) {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace optimistic message if it exists
            const withoutOptimistic = prev.filter(
              (m) => !m.id.startsWith("temp-")
            );
            return [...withoutOptimistic, newMsg];
          });

          // If incoming message from customer contains phone/address, update contact immediately
          if (newMsg.sender_type === "customer" && newMsg.content_text) {
            const targetContactId = activeContact?.id || activeConversation.contact_id;
            if (targetContactId) {
              const info = extractCustomerInfoFromMessage(newMsg.content_text);
              if (info.phone || info.address) {
                syncExtractedContactInfo(targetContactId, info);
              }
            }
          }
        }

        // Update conversation list preview. We need to know *synchronously*
        // whether the conv is already in state to decide between patching
        // the preview and triggering a hydrate — see the comment on
        // knownConvIdsRef for why a closure flag inside the updater would
        // always read false here.
        if (knownConvIdsRef.current.has(newMsg.conversation_id)) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === newMsg.conversation_id
                ? {
                    ...c,
                    last_message_text: newMsg.content_text ?? "",
                    last_message_at: newMsg.created_at,
                    unread_count:
                      activeConversation?.id === newMsg.conversation_id
                        ? 0
                        : c.unread_count + 1,
                  }
                : c,
            ),
          );
        } else {
          // First time we're seeing this conv: the conv-INSERT event
          // hasn't landed yet, or was missed. Hydrate from the DB so
          // the row surfaces with its `contact` joined; the conv-UPDATE
          // event the webhook emits right after the message INSERT will
          // converge state when it arrives.
          hydrateConversation(newMsg.conversation_id);
        }
      }

      if (event.eventType === "UPDATE") {
        // Update message status
        setMessages((prev) =>
          prev.map((m) => (m.id === newMsg.id ? { ...m, ...newMsg } : m))
        );
      }
    },
    [activeConversation, hydrateConversation]
  );

  // Handle realtime conversation events
  const handleConversationEvent = useCallback(
    (event: {
      eventType: string;
      new: Conversation;
      old: Partial<Conversation>;
    }) => {
      const conv = event.new;

      if (event.eventType === "INSERT") {
        // Prepend immediately for snappy UX so the new conv shows in the
        // list right away, then hydrate to fill in the `contact` join
        // (realtime payloads never include joins). Skip both if we
        // already have the row — that shouldn't happen normally, but
        // out-of-order delivery would have us prepending a duplicate.
        if (!knownConvIdsRef.current.has(conv.id)) {
          setConversations((prev) => {
            if (prev.some((c) => c.id === conv.id)) return prev;
            return [conv, ...prev];
          });
          hydrateConversation(conv.id);
        }
      }

      if (event.eventType === "UPDATE") {
        if (knownConvIdsRef.current.has(conv.id)) {
          // If this UPDATE is for the conv the user is currently viewing,
          // suppress the incoming unread_count — the user is reading it
          // RIGHT NOW, so any positive value would just flicker the badge
          // back on for the ~100ms it takes for the reset effect's server
          // UPDATE to round-trip. Non-active convs take the value as-is.
          const isActive = activeConversation?.id === conv.id;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conv.id
                ? {
                    ...c,
                    ...conv,
                    unread_count: isActive ? 0 : conv.unread_count,
                  }
                : c,
            ),
          );
        } else {
          // UPDATE arrived before the INSERT (or after a missed INSERT)
          // — fetch the row so it surfaces with its contact joined. The
          // patch contained in `conv` will already be reflected in what
          // the hydrate fetch returns.
          hydrateConversation(conv.id);
        }

        // Update active conversation if it changed
        if (activeConversation && conv.id === activeConversation.id) {
          setActiveConversation((prev) =>
            prev ? { ...prev, ...conv } : prev
          );
        }
      }
    },
    [activeConversation, hydrateConversation]
  );

  // Subscribe to realtime. The `isConnected` flag below feeds the
  // reconnect resync: realtime is best-effort and events sent while the
  // WS was disconnected (laptop sleep, network blip, background-tab
  // throttle) are simply lost. We need a way to catch up.
  const { isConnected } = useRealtime({
    channelName: "inbox-realtime",
    onMessageEvent: handleMessageEvent,
    onConversationEvent: handleConversationEvent,
    enabled: true,
  });

  /**
   * Bump `resyncToken` whenever the realtime channel transitions from
   * disconnected → connected *after* the initial connect. The initial
   * connect is covered by the children's on-mount fetches; only later
   * reconnects need a manual refetch to fill the gap.
   *
   * Tracked via a `was-connected` ref rather than a count so that React
   * strict-mode's dev-only effect double-fire doesn't read as a
   * reconnect.
   */
  const wasConnectedRef = useRef(false);
  const initialConnectDoneRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      // false → true transition
      if (initialConnectDoneRef.current) {
        setResyncToken((n) => n + 1);
      } else {
        initialConnectDoneRef.current = true;
      }
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  /**
   * Refetch when the tab regains focus. Background tabs may have their
   * WS throttled by the browser even without a full disconnect, so a
   * visibilitychange → visible is a reliable signal that we may have
   * missed events. Cheap to fire; the children dedupe on their own.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setResyncToken((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /**
   * Manual refresh trigger for the thread-header refresh button.
   * Bumps the same resyncToken the reconnect / visibility paths use,
   * so it goes through the existing dedupe & refetch plumbing — no
   * separate code path to keep in sync.
   */
  const handleManualRefresh = useCallback(() => {
    setResyncToken((n) => n + 1);
  }, []);

  const handleConversationsLoaded = useCallback(
    (loaded: Conversation[]) => {
      setConversations(loaded);
      // Resolve a pending deep-link here rather than in an effect — this
      // is an event handler, so the setState calls below are allowed by
      // react-hooks/set-state-in-effect. Runs once per ?c=<id> URL value
      // via the ref, so realtime refreshes of the list can't snap the
      // user back to the deep-linked thread after they've navigated.
      if (
        deepLinkConvId &&
        autoSelectedForDeepLinkRef.current !== deepLinkConvId &&
        loaded.length > 0
      ) {
        autoSelectedForDeepLinkRef.current = deepLinkConvId;
        // If the deep-linked conversation is already the active one
        // (e.g. because the user clicked it in the list and we
        // router.replace()'d the URL, which made the ConversationList
        // refetch and land us back here), do NOT re-apply it. Doing so
        // would setMessages([]) on a thread whose messages have
        // already been loaded by MessageThread — and because
        // conversationId didn't change, MessageThread wouldn't
        // refetch. The thread would read "No messages yet" until a
        // full page reload rehydrated state from scratch.
        if (activeConversation?.id === deepLinkConvId) return;
        const match = loaded.find((c) => c.id === deepLinkConvId);
        if (match) {
          setActiveConversation(match);
          setActiveContact(match.contact ?? null);
          setMessages([]);
          // Mirror the optimistic unread reset that handleSelectConversation
          // does — the user just deep-linked into this conv, treat that the
          // same as a click. Leaves activeConversation.unread_count alone so
          // the MessageThread reset effect still fires the server UPDATE.
          if (match.unread_count > 0) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === match.id ? { ...c, unread_count: 0 } : c,
              ),
            );
          }
        } else {
          // If the deep-linked conversation is not on the first page, fetch it directly
          hydrateConversation(deepLinkConvId);
        }
      } else if (
        !deepLinkConvId &&
        !activeConversation &&
        loaded.length > 0 &&
        typeof window !== "undefined" &&
        window.innerWidth >= 1024 &&
        !autoSelectedForDeepLinkRef.current
      ) {
        const first = loaded[0];
        setActiveConversation(first);
        setActiveContact(first.contact ?? null);
        autoSelectedForDeepLinkRef.current = first.id;
        router.replace(`/inbox?c=${first.id}`, { scroll: false });
      }
    },
    [deepLinkConvId, activeConversation?.id, router]
  );

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      // Re-clicking the already-active conversation would clear the
      // messages array, but the fetch effect in MessageThread only re-runs
      // when conversationId changes — so messages would stay empty until
      // the user navigated away and back. Bail out early instead.
      if (activeConversation?.id === conv.id) return;
      setActiveConversation(conv);
      setActiveContact(conv.contact ?? null);
      setMessages([]);
      // Optimistically clear the unread badge for this conv. The
      // server-side reset is fired by the unread-reset effect inside
      // MessageThread (which reads activeConversation.unread_count, not
      // the list copy — so we deliberately leave that intact below to
      // keep the effect firing), and the realtime UPDATE that comes
      // back will sync to 0 again as a no-op. Zeroing the list copy
      // here means the user sees the badge disappear the instant they
      // click instead of waiting for the round-trip — and it persists
      // even if the realtime UPDATE is dropped.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conv.id && c.unread_count > 0
            ? { ...c, unread_count: 0 }
            : c,
        ),
      );
      // Record the selection on the deep-link ref BEFORE we change the
      // URL. The router.replace below flips `deepLinkConvId`, which can
      // in turn cause ConversationList to refetch and eventually call
      // handleConversationsLoaded again. Without this line, the ref
      // still points at the previous value, the auto-select block
      // sees `ref !== deepLinkConvId`, fires a second time, and
      // clobbers the messages MessageThread just fetched.
      autoSelectedForDeepLinkRef.current = conv.id;
      // Reflect the selection in the URL so a refresh lands the user
      // back in the same thread, and so copy-paste links work. Use
      // replace() to avoid polluting browser history with every click.
      router.replace(`/inbox?c=${conv.id}`, { scroll: false });
    },
    [activeConversation?.id, router]
  );

  // Mobile "back" — deselect the conversation so the list pane comes
  // back. Also clears the ?c= param so a refresh lands on the list
  // instead of re-opening the thread the user just backed out of.
  const handleCloseConversation = useCallback(() => {
    setActiveConversation(null);
    setActiveContact(null);
    setMessages([]);
    // Clearing the ref lets the deep-link auto-selector fire again if
    // the user later visits /inbox?c=<same-id> — desirable UX.
    autoSelectedForDeepLinkRef.current = null;
    router.replace("/inbox", { scroll: false });
  }, [router]);

  // If activeConversation has a contact_id but activeContact is missing,
  // load the contact directly from contacts table and update state.
  useEffect(() => {
    if (activeConversation?.contact_id && !activeContact) {
      const supabase = createClient();
      supabase
        .from("contacts")
        .select("*, contact_tags(tags(*))")
        .eq("id", activeConversation.contact_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const normalized = {
              ...data,
              tags: (data.contact_tags ?? [])
                .map((ct: any) => ct.tags)
                .filter((t: any) => t != null),
            };
            setActiveContact(normalized);
            setConversations((prev) =>
              prev.map((c) =>
                c.id === activeConversation.id ? { ...c, contact: normalized } : c
              )
            );
          }
        });
    }
  }, [activeConversation?.id, activeConversation?.contact_id, activeContact]);


  const handleMessagesLoaded = useCallback(
    (loaded: Message[]) => {
      setMessages(loaded);

      // Auto-extract customer info from loaded messages if activeContact needs phone or address
      const targetContactId = activeContact?.id || activeConversation?.contact_id;
      if (
        targetContactId &&
        (!activeContact?.address || !activeContact?.phone || isFacebookPsid(activeContact?.phone))
      ) {
        let foundPhone: string | undefined;
        let foundAddress: string | undefined;

        // Scan from newest to oldest
        for (let i = loaded.length - 1; i >= 0; i--) {
          const m = loaded[i];
          if (m.sender_type === "customer" && m.content_text) {
            const info = extractCustomerInfoFromMessage(m.content_text);
            if (!foundPhone && info.phone) foundPhone = info.phone;
            if (!foundAddress && info.address) foundAddress = info.address;
            if (foundPhone && foundAddress) break;
          }
        }

        if (foundPhone || foundAddress) {
          syncExtractedContactInfo(targetContactId, {
            phone: foundPhone,
            address: foundAddress,
          });
        }
      }
    },
    [activeContact, activeConversation?.contact_id, syncExtractedContactInfo]
  );

  const handleNewMessage = useCallback(
    (msg: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      if (msg.sender_type === "customer" && msg.content_text) {
        const contactId = activeContact?.id || activeConversation?.contact_id;
        if (contactId) {
          const info = extractCustomerInfoFromMessage(msg.content_text);
          if (info.phone || info.address) {
            syncExtractedContactInfo(contactId, info);
          }
        }
      }
    },
    [activeContact?.id, activeConversation?.contact_id, syncExtractedContactInfo]
  );

  const handleUpdateMessage = useCallback(
    (id: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    },
    []
  );

  const handleStatusChange = useCallback(
    (conversationId: string, status: ConversationStatus) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status } : c))
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [activeConversation]
  );

  const handleAssignChange = useCallback(
    (conversationId: string, assignedAgentId: string | null) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, assigned_agent_id: assignedAgentId ?? undefined }
            : c
        )
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) =>
          prev
            ? { ...prev, assigned_agent_id: assignedAgentId ?? undefined }
            : prev
        );
      }
    },
    [activeConversation]
  );

  const handleContactUpdated = useCallback(
    (updated: Contact) => {
      setActiveContact((prev) => {
        if (!prev || prev.id !== updated.id) return updated;
        const current = prev;
        const keepPhone =
          current.phone &&
          !isFacebookPsid(current.phone) &&
          (!updated.phone || isFacebookPsid(updated.phone));
        const keepAddress = current.address && !updated.address;

        return {
          ...current,
          ...updated,
          phone: keepPhone ? current.phone : (updated.phone || current.phone || ''),
          address: keepAddress ? current.address : (updated.address || current.address),
        };
      });
      setConversations((prev) =>
        prev.map((c) => {
          if (c.contact_id !== updated.id && (!activeConversation || c.id !== activeConversation.id)) {
            return c;
          }
          const prevPhone = c.contact?.phone || '';
          const keepPhone =
            prevPhone &&
            !isFacebookPsid(prevPhone) &&
            (!updated.phone || isFacebookPsid(updated.phone));
          const keepAddress = c.contact?.address && !updated.address;

          return {
            ...c,
            contact: {
              ...(c.contact || {}),
              ...updated,
              phone: keepPhone ? prevPhone : (updated.phone || prevPhone || ''),
              address: keepAddress ? c.contact?.address : (updated.address || c.contact?.address),
            },
          };
        })
      );
    },
    [activeConversation]
  );

  const handleConversationUpdatedFromSidebar = useCallback(
    (updates: Partial<Conversation>) => {
      if (activeConversation) {
        setActiveConversation((prev) => (prev ? { ...prev, ...updates } : prev));
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversation.id ? { ...c, ...updates } : c))
        );
      }
    },
    [activeConversation]
  );

  // On mobile (<lg) we show a SINGLE pane — either the list or the
  // thread — rather than cramming both side-by-side. Selecting a
  // conversation slides the thread in; the thread's back button pops
  // it back to the list. On lg+ both panes render side-by-side as
  // before, unchanged.
  const hasActiveConv = !!activeConversation;

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden sm:-m-6">
      {/* Channels Connection Bar: Messenger & WhatsApp side by side */}
      <div className="flex flex-wrap shrink-0 items-center justify-between border-b border-border bg-card/80 backdrop-blur-xs px-4 py-2 gap-3 text-xs">
        {/* Messenger Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-lg border border-blue-500/25 bg-blue-500/10 px-2.5 py-1">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                messengerConnected ? "bg-blue-500 animate-pulse" : "bg-muted-foreground"
              )}
            />
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              Messenger:
            </span>
            <span className="font-medium text-foreground">
              {messengerConnected ? (messengerPageName || "Connected") : "Not Connected"}
            </span>
            {tokenMissing && (
              <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-amber-500">
                Token Required
              </span>
            )}
          </div>
          <button
            onClick={() => setShowTokenModal(true)}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors shadow-2xs"
            title="Set or update Facebook Page Access Token"
          >
            <KeyRound className="h-3 w-3 text-blue-500" />
            Set Token
          </button>
          <button
            onClick={() => handleSyncMessenger()}
            disabled={isSyncingMessenger || isCleaningInbox}
            className="flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", isSyncingMessenger && "animate-spin")} />
            {isSyncingMessenger ? "Syncing..." : "Sync"}
          </button>
          <button
            onClick={handleCleanInbox}
            disabled={isSyncingMessenger || isCleaningInbox}
            className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-2 py-1 text-[11px] font-semibold text-red-500 transition-colors disabled:opacity-50 shadow-2xs"
            title="Clean foreign chats (like UK Brand Lover) from Digiplus inbox"
          >
            <Trash2 className={cn("h-3 w-3", isCleaningInbox && "animate-spin")} />
            {isCleaningInbox ? "Cleaning..." : "Clean Foreign Chats"}
          </button>
        </div>

        {/* WhatsApp Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                whatsappConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-400"
              )}
            />
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              WhatsApp:
            </span>
            <span className="font-medium text-foreground">
              {whatsappConnected ? "Connected" : "Not Connected"}
            </span>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 transition-colors shadow-2xs"
          >
            <MessageCircle className="h-3 w-3" />
            {whatsappConnected ? "WhatsApp Settings" : "Connect WhatsApp"}
          </Link>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Conversation list.
            Hidden on mobile when a conversation is selected so the
            thread can occupy the full width. Always visible on lg+. */}
        <div
          className={cn(
            "flex h-full flex-1 lg:flex-none",
            hasActiveConv ? "hidden lg:flex" : "flex",
          )}
        >
          <ConversationList
            activeConversationId={activeConversation?.id ?? null}
            onSelect={handleSelectConversation}
            conversations={conversations}
            onConversationsLoaded={handleConversationsLoaded}
            resyncToken={resyncToken}
            onSyncMessenger={() => handleSyncMessenger()}
            isSyncingMessenger={isSyncingMessenger}
            messengerConnected={Boolean(messengerConnected)}
            tokenMissing={tokenMissing}
            onOpenTokenModal={() => setShowTokenModal(true)}
          />
        </div>

        {/* Center panel: Message thread.
            Hidden on mobile when no conversation is selected so the
            list can occupy the full width. Always visible on lg+
            (shows its own empty-state if no thread is picked yet).

            `min-w-0` is load-bearing: without it, a single wide piece
            of content inside the thread (long quote preview, very
            long URL in a message body) forces the flex child past
            its share and pushes the contact-sidebar panel off-screen
            on the right. Issue #165. */}
        <div
          className={cn(
            "flex h-full min-w-0 flex-1 lg:flex",
            hasActiveConv ? "flex" : "hidden lg:flex",
          )}
        >
          <MessageThread
            conversation={activeConversation}
            contact={activeContact}
            messages={messages}
            onMessagesLoaded={handleMessagesLoaded}
            onNewMessage={handleNewMessage}
            onUpdateMessage={handleUpdateMessage}
            onStatusChange={handleStatusChange}
            onAssignChange={handleAssignChange}
            onBack={handleCloseConversation}
            resyncToken={resyncToken}
            onRefresh={handleManualRefresh}
            contactPanelOpen={contactPanelOpen}
            onToggleContactPanel={handleToggleContactPanel}
          />
        </div>

        {/* Right panel: Contact sidebar — desktop only, and only when the
            agent hasn't collapsed it via the thread-header toggle (#258).
            On mobile it's always hidden (the `lg:block` below), so the
            toggle — which is itself desktop-only — never affects it. */}
        {contactPanelOpen && (
          <div className="hidden lg:block">
            <ContactSidebar
              contact={activeContact}
              conversation={activeConversation}
              messages={messages}
              pageId={messengerPageId}
              onContactUpdated={handleContactUpdated}
              onConversationUpdated={handleConversationUpdatedFromSidebar}
            />
          </div>
        )}
      </div>

      {/* Facebook Page Token Input Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Connect Page Access Token
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {messengerPageName || "Facebook Page"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTokenModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              To fetch and sync customer conversations for <span className="font-semibold text-foreground">{messengerPageName || "Digiplus"}</span>, enter your Facebook Page Access Token below.
            </p>

            {tokenModalError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[11px] text-destructive whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
                {tokenModalError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-foreground">
                Page Access Token (EAAG...)
              </label>
              <textarea
                rows={3}
                value={inputToken}
                onChange={(e) => {
                  setInputToken(e.target.value);
                  if (tokenModalError) setTokenModalError("");
                }}
                placeholder="Paste Page Access Token (EAAG...) here..."
                className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="rounded-xl border bg-muted/40 p-3 text-[11px] space-y-2 text-muted-foreground">
              <span className="font-semibold text-foreground flex items-center gap-1">
                <ExternalLink className="h-3 w-3 text-blue-500" />
                Where to get this token?
              </span>
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-900 dark:text-emerald-200 space-y-1">
                <span className="font-bold flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  ⚡ Method 2 (Recommended — Never Expires):
                </span>
                <p>1. Open <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-emerald-700 dark:text-emerald-300">Meta Business Settings → System Users</a>.</p>
                <p>2. Select your System User → click <strong>Assign Assets</strong> → select <strong>Pages</strong> → select <strong>{messengerPageName || "Digiplus"}</strong> → turn ON <strong>Manage Page (Full Control)</strong> → Save Changes.</p>
                <p>3. Click <strong>Generate New Token</strong> (Expiration: <strong>Never</strong>) with permissions: <code className="rounded bg-background/50 px-1 font-mono text-[10px]">pages_messaging</code>, <code className="rounded bg-background/50 px-1 font-mono text-[10px]">pages_manage_metadata</code>, <code className="rounded bg-background/50 px-1 font-mono text-[10px]">pages_show_list</code>, <code className="rounded bg-background/50 px-1 font-mono text-[10px]">pages_read_engagement</code>.</p>
                <p>4. Paste the token below and click <strong>Save &amp; Sync</strong>.</p>
              </div>
              <div className="rounded-lg bg-muted/70 border p-2 text-[10px] space-y-1">
                <span className="font-bold text-foreground">Method 1 (Testing — 1-Hour Expiration):</span>
                <p>Open <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline font-medium">Meta Graph API Explorer</a> → under <em>User or Page</em> select <strong>Page: {messengerPageName || "Digiplus"}</strong> → click <strong>Generate Access Token</strong>.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTokenModal(false)}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!inputToken.trim() || savingToken}
                onClick={() => handleSyncMessenger(inputToken)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
              >
                {savingToken ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Saving &amp; Syncing...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-3.5 w-3.5" />
                    Save &amp; Sync Chats
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
