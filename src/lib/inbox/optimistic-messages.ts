import type { Message } from '@/types';

/**
 * Reconciles incoming realtime messages with in-flight optimistic messages.
 *
 * Guarantees that:
 * 1. Duplicate messages (by id) are ignored.
 * 2. When an agent message arrives from the server, it replaces ONLY the matching
 *    in-flight optimistic message (matching content or media, or the earliest temp message).
 * 3. Multiple in-flight messages sent in rapid succession are NOT wiped out when
 *    the first message is confirmed.
 * 4. Inbound customer messages append cleanly without deleting pending agent drafts.
 */
export function reconcileOptimisticMessage(
  prev: Message[],
  newMsg: Message
): Message[] {
  // 1. Avoid duplicates
  if (prev.some((m) => m.id === newMsg.id)) return prev;

  // 2. If the incoming message is from an agent, match and replace the specific in-flight temp message
  if (newMsg.sender_type === 'agent') {
    // Try matching by exact content_text or media_url
    const matchIdx = prev.findIndex(
      (m) =>
        m.id.startsWith('temp-') &&
        ((newMsg.content_text && m.content_text === newMsg.content_text) ||
         (newMsg.media_url && m.media_url === newMsg.media_url))
    );

    if (matchIdx !== -1) {
      const updated = [...prev];
      updated[matchIdx] = newMsg;
      return updated;
    }

    // Fallback: match the earliest in-flight temp message
    const firstTempIdx = prev.findIndex((m) => m.id.startsWith('temp-'));
    if (firstTempIdx !== -1) {
      const updated = [...prev];
      updated[firstTempIdx] = newMsg;
      return updated;
    }
  }

  // 3. Inbound customer message or unassociated agent message: append directly without wiping in-flight temp messages
  return [...prev, newMsg];
}
