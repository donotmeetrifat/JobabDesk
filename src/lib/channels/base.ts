export interface InboundMessage {
  externalId: string        // message ID from the channel
  channelType: 'whatsapp' | 'messenger'
  externalAccountId: string // WhatsApp phone number ID or FB Page ID  
  from: string              // customer's phone or PSID
  fromName?: string
  text?: string
  imageUrl?: string         // if customer sent an image
  imageData?: string        // base64 image for AI vision
  linkUrl?: string          // if customer sent a URL/link
  timestamp: Date
  rawPayload: unknown       // original provider payload (for audit)
}

export interface OutboundMessage {
  to: string                // customer's phone or PSID
  text: string
  channelType: 'whatsapp' | 'messenger'
  externalAccountId: string
}

export interface ChannelProvider {
  channelType: 'whatsapp' | 'messenger'
  verifyWebhook(req: Request): Promise<boolean>
  parseInbound(req: Request): Promise<InboundMessage[]>
  sendMessage(message: OutboundMessage): Promise<{ externalMessageId: string }>
  getDisplayName(): string
}
