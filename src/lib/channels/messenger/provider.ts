import { ChannelProvider, InboundMessage, OutboundMessage } from '../base'

export class MessengerProvider implements ChannelProvider {
  readonly channelType = 'messenger' as const

  getDisplayName(): string {
    return 'Facebook Messenger'
  }

  async verifyWebhook(req: Request): Promise<boolean> {
    // Stub implementation for Messenger webhook verification
    return true
  }

  async parseInbound(req: Request): Promise<InboundMessage[]> {
    // Stub implementation for Messenger inbound message parsing
    return []
  }

  async sendMessage(message: OutboundMessage): Promise<{ externalMessageId: string }> {
    // Stub implementation for sending Messenger messages
    throw new Error('MessengerProvider.sendMessage: Not implemented yet')
  }
}
