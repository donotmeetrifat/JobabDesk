import { describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import { reconcileOptimisticMessage } from './optimistic-messages';

function makeMsg(partial: Partial<Message>): Message {
  return {
    id: 'msg-' + Math.random(),
    conversation_id: 'conv-1',
    sender_type: 'agent',
    content_type: 'text',
    content_text: 'hello',
    status: 'sent',
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe('Inbox Optimistic UI Message Reconciliation', () => {
  it('ignores duplicate message IDs', () => {
    const m1 = makeMsg({ id: 'msg-1', content_text: 'Hello' });
    const prev = [m1];
    const next = reconcileOptimisticMessage(prev, m1);
    expect(next).toBe(prev);
    expect(next.length).toBe(1);
  });

  it('replaces matching optimistic temp message by exact text', () => {
    const temp1 = makeMsg({
      id: 'temp-1',
      content_text: 'First in-flight message',
      status: 'sending',
    });
    const confirmed1 = makeMsg({
      id: 'real-db-id-1',
      content_text: 'First in-flight message',
      status: 'sent',
    });

    const prev = [temp1];
    const next = reconcileOptimisticMessage(prev, confirmed1);

    expect(next.length).toBe(1);
    expect(next[0].id).toBe('real-db-id-1');
    expect(next[0].status).toBe('sent');
  });

  it('preserves multiple in-flight optimistic messages when the first one resolves', () => {
    const temp1 = makeMsg({
      id: 'temp-100',
      content_text: 'Message one',
      status: 'sending',
    });
    const temp2 = makeMsg({
      id: 'temp-200',
      content_text: 'Message two',
      status: 'sending',
    });
    const temp3 = makeMsg({
      id: 'temp-300',
      content_text: 'Message three',
      status: 'sending',
    });

    const prev = [temp1, temp2, temp3];

    // Realtime broadcast arrives for Message 1
    const confirmed1 = makeMsg({
      id: 'db-msg-1',
      content_text: 'Message one',
      status: 'sent',
    });

    const next1 = reconcileOptimisticMessage(prev, confirmed1);

    // Temp 1 replaced, Temp 2 and Temp 3 MUST still be present!
    expect(next1.length).toBe(3);
    expect(next1[0].id).toBe('db-msg-1');
    expect(next1[1].id).toBe('temp-200');
    expect(next1[2].id).toBe('temp-300');

    // Realtime broadcast arrives for Message 2
    const confirmed2 = makeMsg({
      id: 'db-msg-2',
      content_text: 'Message two',
      status: 'sent',
    });
    const next2 = reconcileOptimisticMessage(next1, confirmed2);

    expect(next2.length).toBe(3);
    expect(next2[0].id).toBe('db-msg-1');
    expect(next2[1].id).toBe('db-msg-2');
    expect(next2[2].id).toBe('temp-300');
  });

  it('appends inbound customer messages without wiping in-flight agent messages', () => {
    const inFlight = makeMsg({
      id: 'temp-agent-1',
      sender_type: 'agent',
      content_text: 'Are you available today?',
      status: 'sending',
    });

    const customerMsg = makeMsg({
      id: 'cust-msg-99',
      sender_type: 'customer',
      content_text: 'Yes I am!',
      status: 'delivered',
    });

    const prev = [inFlight];
    const next = reconcileOptimisticMessage(prev, customerMsg);

    expect(next.length).toBe(2);
    expect(next[0].id).toBe('temp-agent-1');
    expect(next[1].id).toBe('cust-msg-99');
  });

  it('matches media optimistic message by media_url', () => {
    const tempMedia = makeMsg({
      id: 'temp-media-1',
      content_type: 'image',
      content_text: 'Receipt',
      media_url: 'https://example.com/receipt.jpg',
      status: 'sending',
    });

    const confirmedMedia = makeMsg({
      id: 'db-media-1',
      content_type: 'image',
      content_text: 'Receipt',
      media_url: 'https://example.com/receipt.jpg',
      status: 'sent',
    });

    const prev = [tempMedia];
    const next = reconcileOptimisticMessage(prev, confirmedMedia);

    expect(next.length).toBe(1);
    expect(next[0].id).toBe('db-media-1');
  });
});
