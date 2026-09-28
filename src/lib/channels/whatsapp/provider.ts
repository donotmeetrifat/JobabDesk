import { ChannelProvider, InboundMessage, OutboundMessage } from '../base'
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature'

// WhatsApp webhook payload types (from Meta)
interface WAMessage {
  id: string
  from: string
  timestamp: string
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'reaction' | 'unsupported'
  text?: { body: string }
  image?: { id: string; mime_type: string; caption?: string }
}

interface WAContact {
  profile: { name: string }
  wa_id: string
}

interface WAEntry {
  id: string // phone number ID
  changes: Array<{
    value: {
      messages?: WAMessage[]
      contacts?: WAContact[]
      metadata: { phone_number_id: string }
    }
  }>
}

interface WAWebhookPayload {
  object: string
  entry: WAEntry[]
}

export class WhatsAppProvider implements ChannelProvider {
  readonly channelType = 'whatsapp' as const

  getDisplayName(): string {
    return 'WhatsApp'
  }

  async verifyWebhook(req: Request): Promise<boolean> {
    try {
      const rawBody = await req.clone().text()
      const signature = req.headers.get('x-hub-signature-256')
      return verifyMetaWebhookSignature(rawBody, signature)
    } catch {
      return false
    }
  }

  async parseInbound(req: Request): Promise<InboundMessage[]> {
    const payload = (await req.json()) as WAWebhookPayload
    const messages: InboundMessage[] = []

    for (const entry of payload.entry ?? []) {
      const phoneNumberId = entry.id
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value.messages) continue

        for (const msg of value.messages) {
          // Skip non-message types we cannot handle
          if (!['text', 'image'].includes(msg.type)) continue

          const contact = value.contacts?.find((c) => c.wa_id === msg.from)

          const inbound: InboundMessage = {
            externalId: msg.id,
            channelType: 'whatsapp',
            externalAccountId: phoneNumberId,
            from: msg.from,
            fromName: contact?.profile?.name,
            timestamp: new Date(Number(msg.timestamp) * 1000),
            rawPayload: msg,
          }

          if (msg.type === 'text' && msg.text?.body) {
            inbound.text = msg.text.body
          }

          if (msg.type === 'image' && msg.image?.id) {
            // Store Media ID — will be resolved to URL by the message handler
            inbound.imageUrl = `whatsapp-media://${msg.image.id}`
          }

          messages.push(inbound)
        }
      }
    }

    return messages
  }

  async sendMessage(message: OutboundMessage): Promise<{ externalMessageId: string }> {
    // Delegate to existing WhatsApp send infrastructure
    // The actual send is handled by the existing API route for now
    // This will be wired up fully in Phase 12
    throw new Error(
      'WhatsAppProvider.sendMessage: Use existing /api/whatsapp/send route until Phase 12'
    )
  }
}
