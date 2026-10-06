'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Bot,
  Send,
  User,
  Trash2,
  Sparkles,
  CheckCheck,
  Phone,
  MessageSquare,
  MessageCircle,
  ArrowLeftRight,
  RefreshCw,
} from 'lucide-react'

interface ChatMessage {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp: string
  detectedLanguage?: string
  intentDetected?: string
  providerUsed?: string
  modelUsed?: string
  avatarType?: 'ai_badge' | 'logo'
}

const PRIMARY_LOGO = '/logo.png'
const FALLBACK_LOGO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBwlphn8_lGOmoT1WzuKQCi6OWITBE7ur_-mHUR3Pqg9-uTidribbppFAWbAAPtwQjSlMlFI3V7LZqDDb1Mj9eseOOsdDY_RUyKnYvlz-jrEN9LPQvFoBkPfLejgB1_WWl5HSD_HLe5f_OtZ3QXl7yQcBp5UKs8fvi_qk5u8Wv9xMFqbKgAKCi9Y5hWSJC2sTnF6cGCbtUf_3UoFEajD0QYeQq_kWuQtLEtzW5-K3nDGxHB-eX8tXVmfBLxCK2VkFdIqLo'

function BotAvatar({ avatarType }: { avatarType?: 'ai_badge' | 'logo' }) {
  const [src, setSrc] = useState(PRIMARY_LOGO)
  const [failed, setFailed] = useState(false)

  if (avatarType === 'ai_badge' || failed) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100/80 dark:bg-blue-950/50 text-primary font-semibold text-xs mt-0.5 border border-primary/20 shadow-2xs">
        AI
      </div>
    )
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100/70 dark:bg-blue-950/40 text-primary p-0.5 mt-0.5 border border-primary/20 shadow-2xs overflow-hidden">
      <img
        src={src}
        alt="JobabDesk"
        className="w-full h-full object-contain rounded-lg"
        onError={() => {
          if (src === PRIMARY_LOGO) {
            setSrc(FALLBACK_LOGO)
          } else {
            setFailed(true)
          }
        }}
      />
    </div>
  )
}

export function SandboxAndLogs() {
  const [storeName, setStoreName] = useState('Aura Home Living')
  const [selectedChannel, setSelectedChannel] = useState<'webchat' | 'whatsapp' | 'messenger'>('webchat')
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const chatStreamRef = useRef<HTMLDivElement>(null)

  // Initial showcase messages matching the exact stitch redesign and screenshot
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'showcase-welcome',
      sender: 'ai',
      text: 'Hello! Welcome to Aura Home Living. I can help you with our handcrafted home decor, artisanal ceramics, delivery rates, or return policies in English, বাংলা (Bengali), or Banglish!',
      timestamp: '02:45 PM',
      detectedLanguage: 'English / বাংলা',
      avatarType: 'ai_badge',
    },
    {
      id: 'showcase-user-1',
      sender: 'user',
      text: 'bhai delivery charge koto ar return policy ki?',
      timestamp: '02:46 PM',
    },
    {
      id: 'showcase-ai-1',
      sender: 'ai',
      text: 'আমাদের ডেলিভারি চার্জ Dhaka সিটির ভেতরে ৳৮০ এবং সারা বাংলাদেশে ৳১৫০। ৳৩,০০০ টাকার বেশি অর্ডারে Delivery একদম ফ্রি! 🚚\n\nএছাড়াও যেকোনো পণ্যে ৭ দিনের সহজ রিটার্ন ও এক্সচেঞ্জ সুবিধা রয়েছে (unopened & original tag সহ)। আপনি কি কোনো স্পেসিফিক সিরামিক বা লাইটিং প্রোডাক্ট দেখতে চান?',
      timestamp: 'Just now',
      detectedLanguage: 'Banglish ⇄ Bengali',
      avatarType: 'logo',
    },
  ])

  // Fetch real business identity from AI settings if configured
  useEffect(() => {
    fetch('/api/ai/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.settings?.name?.trim()) {
          const currentStore = data.settings.name.trim()
          setStoreName(currentStore)
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === 'showcase-welcome'
                ? {
                    ...msg,
                    text: `Hello! Welcome to ${currentStore}. I can help you with our handcrafted home decor, artisanal ceramics, delivery rates, or return policies in English, বাংলা (Bengali), or Banglish!`,
                  }
                : msg
            )
          )
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (chatStreamRef.current) {
      chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend(textToSend?: string) {
    const text = (textToSend || inputMessage).trim()
    if (!text || loading) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text,
      timestamp: now,
    }

    setMessages((prev) => [...prev, userMsg])
    setInputMessage('')
    setLoading(true)

    try {
      const channelParam = selectedChannel === 'webchat' ? 'sandbox' : selectedChannel
      const res = await fetch('/api/ai/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, channel: channelParam }),
      })

      const data = await res.json()

      const aiMsg: ChatMessage = {
        id: 'ai-' + Date.now(),
        sender: 'ai',
        text: data.ai_reply || 'Sorry, no response could be generated at this moment.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        detectedLanguage: data.detected_language
          ? data.detected_language === 'bn'
            ? 'Bengali (বাংলা)'
            : data.detected_language === 'banglish'
            ? 'Banglish ⇄ Bengali'
            : 'English'
          : 'Auto-detected Multilingual',
        intentDetected: data.intent_detected,
        providerUsed: data.provider_used,
        modelUsed: data.model_used,
        avatarType: 'logo',
      }

      setMessages((prev) => [...prev, aiMsg])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'ai',
          text: 'Error generating response. Please check your AI API key and connection.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          detectedLanguage: 'Error',
          avatarType: 'logo',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleClearChat() {
    setMessages([])
  }

  const promptChips = [
    'Ceramic vase set er price koto?',
    'ডেলিভারি চার্জ কত?',
    'Do you accept bKash or COD?',
    'Bamboo lamp stock e ache?',
  ]

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Clean, Centered Playground Card */}
      <div className="w-full bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
        {/* Playground Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-border/80 bg-card">
          {/* Bot Identity Info */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-primary border border-blue-500/20">
              <Bot className="size-5" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-card" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">JobabDesk AI Simulator</h2>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Online
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Testing: {storeName} • Multi-Language Auto-Switch
              </p>
            </div>
          </div>

          {/* Channel Switcher & Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center p-1 rounded-lg bg-muted text-xs font-medium border border-border/60">
              <button
                type="button"
                onClick={() => setSelectedChannel('webchat')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  selectedChannel === 'webchat'
                    ? 'bg-card text-primary shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MessageSquare className="size-3.5" />
                <span>Webchat</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedChannel('whatsapp')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  selectedChannel === 'whatsapp'
                    ? 'bg-card text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Phone className="size-3.5" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedChannel('messenger')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  selectedChannel === 'messenger'
                    ? 'bg-card text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MessageCircle className="size-3.5" />
                <span>Messenger</span>
              </button>
            </div>

            <button
              type="button"
              id="clearChatBtn"
              onClick={handleClearChat}
              title="Clear Chat History"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 text-xs font-medium transition-colors border border-transparent hover:border-rose-500/20"
            >
              <Trash2 className="size-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </header>

        {/* Chat Message Stream */}
        <div
          ref={chatStreamRef}
          className="p-6 h-[460px] overflow-y-auto space-y-6 bg-muted/20"
          id="chatStream"
        >
          {/* Timestamp Center Divider */}
          <div className="flex items-center justify-center gap-3 my-2">
            <div className="h-[1px] w-12 bg-border" />
            <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Session Initialized • 02:45 PM
            </span>
            <div className="h-[1px] w-12 bg-border" />
          </div>

          {messages.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <Sparkles className="size-8 text-primary opacity-40 mb-2" />
              <p className="text-sm font-semibold text-foreground">Playground Reset</p>
              <p className="text-xs mt-1">
                Type any message below or select a suggested query to test your AI bot live.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.sender === 'user') {
                return (
                  <div key={msg.id} className="flex items-start justify-end gap-3 max-w-2xl ml-auto">
                    <div className="space-y-1.5 flex flex-col items-end">
                      <div className="bg-primary text-primary-foreground p-3.5 px-4 rounded-2xl rounded-tr-sm shadow-xs text-sm leading-relaxed max-w-md">
                        {msg.text}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pr-1">
                        <span>{msg.timestamp}</span>
                        <CheckCheck className="size-3.5 text-primary" />
                      </div>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs mt-0.5 border border-border">
                      <User className="size-4" />
                    </div>
                  </div>
                )
              }

              // AI message
              return (
                <div key={msg.id} className="flex items-start gap-3 max-w-2xl">
                  <BotAvatar avatarType={msg.avatarType || 'logo'} />
                  <div className="space-y-1.5 max-w-xl">
                    <div className="bg-card p-4 rounded-2xl rounded-tl-sm border border-border shadow-xs text-foreground text-sm leading-relaxed whitespace-pre-line">
                      {msg.text}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-1">
                      {msg.detectedLanguage && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-primary font-medium text-[11px] border border-blue-500/20">
                          <ArrowLeftRight className="size-3" />
                          {msg.detectedLanguage}
                        </span>
                      )}
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {loading && (
            <div className="flex items-start gap-3 max-w-2xl">
              <BotAvatar avatarType="logo" />
              <div className="bg-card p-4 rounded-2xl rounded-tl-sm border border-border shadow-xs text-xs text-muted-foreground flex items-center gap-2">
                <RefreshCw className="size-3.5 animate-spin text-primary" />
                <span>JobabDesk AI is composing response...</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Query Suggestions */}
        <div className="px-6 py-3 bg-card border-t border-border/80">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground font-medium">
            <Sparkles className="size-3.5 text-primary" />
            <span>Suggested queries:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {promptChips.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSend(prompt)}
                className="prompt-chip inline-flex items-center px-3 py-1.5 rounded-full bg-muted/60 hover:bg-primary/10 hover:text-primary text-foreground text-xs font-medium border border-border/60 hover:border-primary/30 transition-colors"
              >
                &ldquo;{prompt}&rdquo;
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar Footer */}
        <footer className="p-4 sm:p-5 bg-card border-t border-border">
          <form
            id="simulatorForm"
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2 bg-muted/40 rounded-xl p-1.5 border border-border focus-within:border-primary focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <input
                id="customerInput"
                type="text"
                autoComplete="off"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a customer message in English, Bengali, or Banglish..."
                className="flex-1 bg-transparent border-0 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-0 px-3 py-2"
              />
              <button
                type="submit"
                disabled={loading || !inputMessage.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-semibold shadow-sm transition-colors shrink-0"
              >
                <span>Send</span>
                <Send className="size-3.5" />
              </button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Press Enter to send • Testing live responses against {storeName} business knowledge
            </p>
          </form>
        </footer>
      </div>
    </div>
  )
}
