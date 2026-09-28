import { ChannelProvider } from './base'
import { WhatsAppProvider } from './whatsapp/provider'
import { MessengerProvider } from './messenger/provider'

export * from './base'
export * from './whatsapp/provider'
export * from './messenger/provider'

const providers: Record<string, ChannelProvider> = {
  whatsapp: new WhatsAppProvider(),
  messenger: new MessengerProvider(),
}

export function getChannelProvider(channelType: 'whatsapp' | 'messenger'): ChannelProvider {
  const provider = providers[channelType]
  if (!provider) {
    throw new Error(`Unsupported channel type: ${channelType}`)
  }
  return provider
}
