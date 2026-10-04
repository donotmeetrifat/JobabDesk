"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Conversation, Deal, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  User,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Bot,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
  conversation?: Conversation | null;
  onContactUpdated?: (updatedContact: Contact) => void;
  onConversationUpdated?: (updates: Partial<Conversation>) => void;
}

export function ContactSidebar({
  contact,
  conversation,
  onContactUpdated,
  onConversationUpdated,
}: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const effectiveContact: Contact | null = contact || (conversation ? {
    id: conversation.contact_id || conversation.id,
    user_id: conversation.user_id || "",
    account_id: conversation.account_id || "",
    phone: "",
    name: "Messenger User",
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    company: "Facebook Messenger",
    ai_auto_reply_muted: conversation.ai_autoreply_disabled,
  } : null);

  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [togglingAiMute, setTogglingAiMute] = useState(false);
  const [aiMuted, setAiMuted] = useState(
    Boolean(contact?.ai_auto_reply_muted ?? conversation?.ai_autoreply_disabled ?? false)
  );

  useEffect(() => {
    setAiMuted(
      Boolean(contact?.ai_auto_reply_muted ?? conversation?.ai_autoreply_disabled ?? false)
    );
  }, [contact?.ai_auto_reply_muted, conversation?.ai_autoreply_disabled]);

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
        onContactUpdated?.(data.contact);
      }
      onConversationUpdated?.({ ai_autoreply_disabled: next });

      toast.success(
        next
          ? "AI auto-reply muted for this customer"
          : "AI auto-reply enabled for this customer"
      );
    } catch (err: any) {
      setAiMuted(!next);
      toast.error(err?.message || "Failed to update AI mute status");
    } finally {
      setTogglingAiMute(false);
    }
  }, [contact, conversation, aiMuted, onContactUpdated, onConversationUpdated]);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    const handle = effectiveContact?.phone || (effectiveContact ? contactHandle(effectiveContact) : '');
    if (!handle) return;
    await navigator.clipboard.writeText(handle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [effectiveContact]);

  const handleAddNote = useCallback(async () => {
    if (!effectiveContact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: effectiveContact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [effectiveContact, newNote, accountId]);

  if (!effectiveContact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const isMessenger =
    effectiveContact.company === "Facebook Messenger" ||
    (effectiveContact.phone && !effectiveContact.phone.startsWith("+") && !isNaN(Number(effectiveContact.phone)));
  const displayName =
    effectiveContact.name && effectiveContact.name !== "Unknown"
      ? effectiveContact.name
      : isMessenger
      ? `Messenger User (${effectiveContact.phone?.slice(-4) || ""})`
      : contactHandle(effectiveContact);
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground overflow-hidden shadow-inner">
              {effectiveContact.avatar_url ? (
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
              <p className="text-xs text-muted-foreground">{effectiveContact.company}</p>
            ) : null}
          </div>

          {/* Messenger Direct Links */}
          {isMessenger && (
            <div className="mt-3 space-y-1.5">
              <a
                href={
                  effectiveContact.phone
                    ? `https://www.messenger.com/t/${effectiveContact.phone}`
                    : "https://www.messenger.com"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors shadow-2xs"
              >
                <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                Open in Messenger Web
              </a>
              <a
                href={
                  effectiveContact.phone
                    ? `https://business.facebook.com/latest/inbox/all?selected_item_id=${effectiveContact.phone}`
                    : "https://business.facebook.com/latest/inbox"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                Open in Meta Business Inbox
              </a>
            </div>
          )}

          {/* Identifier / Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
              title={isMessenger ? "Copy Facebook User ID" : "Copy Phone Number"}
            >
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col text-left overflow-hidden flex-1">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground/80">
                  {isMessenger ? "Facebook User ID" : "Phone"}
                </span>
                <span className="truncate text-xs font-mono text-foreground">
                  {effectiveContact.phone || contactHandle(effectiveContact)}
                </span>
              </div>
              {copied ? (
                <Check className="h-3 w-3 text-primary shrink-0" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
            </button>

            {effectiveContact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{effectiveContact.email}</span>
              </div>
            )}
          </div>

          {/* AI Mute Toggle Card */}
          <div className="mt-4 p-3 rounded-xl bg-muted/40 border space-y-2">
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

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              {tSidebar("tags")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noTags")}</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              {tSidebar("deals")}
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noDeals")}</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
