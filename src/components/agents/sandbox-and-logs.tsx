'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send,
  User,
  Trash2,
  Sparkles,
  CheckCheck,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp: string
}

const PRIMARY_LOGO = '/logo.png'
const FALLBACK_LOGO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBwlphn8_lGOmoT1WzuKQCi6OWITBE7ur_-mHUR3Pqg9-uTidribbppFAWbAAPtwQjSlMlFI3V7LZqDDb1Mj9eseOOsdDY_RUyKnYvlz-jrEN9LPQvFoBkPfLejgB1_WWl5HSD_HLe5f_OtZ3QXl7yQcBp5UKs8fvi_qk5u8Wv9xMFqbKgAKCi9Y5hWSJC2sTnF6cGCbtUf_3UoFEajD0QYeQq_kWuQtLEtzW5-K3nDGxHB-eX8tXVmfBLxCK2VkFdIqLo'

const STORAGE_KEY = 'jobabdesk_playground_history'

function JobabLogoAvatar({ size = 'md', className = '' }: { size?: 'sm' | 'md'; className?: string }) {
  const [src, setSrc] = useState(PRIMARY_LOGO)
  const isSm = size === 'sm'

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-xl bg-card border border-border shadow-2xs overflow-hidden',
        isSm ? 'h-8 w-8' : 'h-10 w-10',
        className
      )}
    >
      <img
        src={src}
        alt="JobabDesk"
        className="w-full h-full object-contain p-1"
        onError={() => {
          if (src === PRIMARY_LOGO) {
            setSrc(FALLBACK_LOGO)
          }
        }}
      />
    </div>
  )
}

function getInitialQueries(store: string, categoriesStr: string): string[] {
  const categories = categoriesStr
    ? categoriesStr.split(',').map((c) => c.trim()).filter(Boolean)
    : []

  if (categories.length >= 2) {
    return [
      `"${categories[0]} এর দাম কত?"`,
      `"${categories[1]} স্টকে আছে কি?"`,
      `"ডেলিভারি চার্জ কত এবং কত দিন লাগবে?"`,
      `"ক্যাশ অন ডেলিভারি (COD) অ্যাভেইলেবল?"`,
    ]
  } else if (categories.length === 1) {
    return [
      `"${categories[0]} এর প্রাইস ও ভ্যারিয়েন্ট কী কী?"`,
      `"ডেলিভারি চার্জ কত এবং সারা বাংলাদেশে ডেলিভারি দেন?"`,
      `"রিটার্ন বা এক্সচেঞ্জ পলিসি কী?"`,
      `"Do you accept bKash or COD?"`,
    ]
  }

  return [
    `"${store} এ কী কী প্রোডাক্ট পাওয়া যায়?"`,
    `"ডেলিভারি চার্জ কত এবং কত দিন সময় লাগে?"`,
    `"কোন কোন পেমেন্ট মেথড এক্সেপ্ট করেন?"`,
    `"রিটার্ন বা রিপ্লেসমেন্ট পলিসি কী?"`,
  ]
}

function getContextualQueries(lastUserMsg: string, lastAiReply: string, store: string, categoriesStr: string): string[] {
  const text = (lastUserMsg + ' ' + lastAiReply).toLowerCase()
  const categories = categoriesStr
    ? categoriesStr.split(',').map((c) => c.trim()).filter(Boolean)
    : []
  const topCat = categories[0] || 'প্রোডাক্ট'

  // If user/AI discussed delivery / shipping
  if (
    text.includes('delivery') ||
    text.includes('ডেলিভারি') ||
    text.includes('charge') ||
    text.includes('shipping') ||
    text.includes('dhaka')
  ) {
    return [
      `"ঢাকার বাইরে কত দিনে ডেলিভারি পাবো?"`,
      `"ফ্রি ডেলিভারি পেতে কত টাকার অর্ডার করতে হবে?"`,
      `"ক্যাশ অন ডেলিভারিতে প্রোডাক্ট চেক করে নেওয়া যাবে?"`,
      `"অর্ডার কনফার্ম করার নিয়ম কী?"`,
    ]
  }

  // If user/AI discussed price / product / stock
  if (
    text.includes('dam') ||
    text.includes('দাম') ||
    text.includes('price') ||
    text.includes('koto') ||
    text.includes('stock') ||
    text.includes('কতো') ||
    text.includes('টাকা') ||
    text.includes('tk')
  ) {
    return [
      `"এই প্রোডাক্টের কোন ডিসকাউন্ট অফার চলছে?"`,
      `"আর কী কী কালার বা ভ্যারিয়েন্ট অ্যাভেইলেবল আছে?"`,
      `"অর্ডার করতে কী কী ইনফরমেশন লাগবে?"`,
      `"ঢাকার ভেতরে ডেলিভারি চার্জ কত?"`,
    ]
  }

  // If user/AI discussed return / refund / warranty
  if (
    text.includes('return') ||
    text.includes('রিটার্ন') ||
    text.includes('exchange') ||
    text.includes('পলিসি') ||
    text.includes('policy') ||
    text.includes('refund')
  ) {
    return [
      `"প্রোডাক্টে সমস্যা পেলে কত দিনের মধ্যে জানাতে হবে?"`,
      `"রিটার্ন করার সময় ডেলিভারি চার্জ কে দিবে?"`,
      `"টাকা রিফান্ড পেতে কত দিন সময় লাগে?"`,
      `"কাস্টমার সার্ভিসে সরাসরি যোগাযোগ করবো কীভাবে?"`,
    ]
  }

  // If user/AI discussed payment / bKash / Nagad / checkout
  if (
    text.includes('bkash') ||
    text.includes('nagad') ||
    text.includes('payment') ||
    text.includes('cod') ||
    text.includes('পেমেন্ট') ||
    text.includes('টাকা')
  ) {
    return [
      `"অগ্রিম কত টাকা দিতে হবে নাকি পুরোটা ক্যাশ অন ডেলিভারি?"`,
      `"পেমেন্ট করার পর ট্রানজেকশন আইডি কীভাবে দিবো?"`,
      `"ডেলিভারি চার্জ কি আগে দিতে হয়?"`,
      `"আমার অর্ডার ট্র্যাকিং নাম্বার কীভাবে পাবো?"`,
    ]
  }

  // If user/AI discussed order confirmation
  if (
    text.includes('order') ||
    text.includes('অর্ডার') ||
    text.includes('kinbo') ||
    text.includes('কিনতে') ||
    text.includes('confirm')
  ) {
    return [
      `"আমার নাম, ঠিকানা ও ফোন নাম্বার কীভাবে পাঠাবো?"`,
      `"অর্ডার কনফার্ম হতে কতক্ষণ সময় লাগবে?"`,
      `"ডেলিভারি ম্যান কি কল দিয়ে আসবে?"`,
      `"ক্যান্সেল করতে চাইলে কীভাবে করবো?"`,
    ]
  }

  if (categories.length > 1) {
    return [
      `"আপনাদের ${categories[1]} দেখতে পারি?"`,
      `"বর্তমান অফার বা প্রোমো কোড আছে কি?"`,
      `"ডেলিভারি কত দিনের মধ্যে পাওয়া যাবে?"`,
      `"অর্ডার করার প্রক্রিয়া বুঝিয়ে বলুন"`,
    ]
  }

  return [
    `"${topCat} এর স্পেসিফিকেশন জানতে চাই"`,
    `"ডেলিভারি চার্জ ও পেমেন্ট প্রসেস কী?"`,
    `"রিটার্ন বা ওয়ারেন্টি সুবিধা আছে কি?"`,
    `"অর্ডার কনফার্ম করতে কী করতে হবে?"`,
  ]
}

export function SandboxAndLogs() {
  const [storeName, setStoreName] = useState('Store')
  const [productCategories, setProductCategories] = useState('')
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [promptChips, setPromptChips] = useState<string[]>([])
  const chatStreamRef = useRef<HTMLDivElement>(null)
  const isHydratedRef = useRef(false)

  // 1. Fetch real business identity and settings
  useEffect(() => {
    fetch('/api/ai/settings')
      .then((res) => res.json())
      .then((data) => {
        const name = data.settings?.name?.trim() || data.name?.trim() || 'JobabDesk Store'
        const cats = data.settings?.product_categories_sold || data.product_categories_sold || ''
        setStoreName(name)
        setProductCategories(cats)
        setPromptChips(getInitialQueries(name, cats))
      })
      .catch(() => {
        setPromptChips(getInitialQueries('JobabDesk Store', ''))
      })
  }, [])

  // 2. Chat history persistence with localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, [])

  useEffect(() => {
    if (!isHydratedRef.current) {
      isHydratedRef.current = true
      return
    }
    try {
      if (messages.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Ignore localStorage write errors
    }
  }, [messages])

  // 3. Scroll to bottom smoothly on message updates
  useEffect(() => {
    if (chatStreamRef.current) {
      chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight
    }
  }, [messages, loading])

  // 4. Send Message Handler
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
      const res = await fetch('/api/ai/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, channel: 'sandbox' }),
      })

      const data = await res.json()
      const aiReplyText = data.ai_reply || 'Sorry, no response could be generated at this moment.'

      const aiMsg: ChatMessage = {
        id: 'ai-' + Date.now(),
        sender: 'ai',
        text: aiReplyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, aiMsg])

      // Dynamically update suggested queries based on the conversation
      const nextQueries = getContextualQueries(text, aiReplyText, storeName, productCategories)
      setPromptChips(nextQueries)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'ai',
          text: 'Error generating response. Please check your AI API key and connection.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  // 5. Clear Chat Handler
  function handleClearChat() {
    setMessages([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
    setPromptChips(getInitialQueries(storeName, productCategories))
  }

  return (
    <div className="w-full">
      {/* Full-width Responsive Interactive Playground Card */}
      <div className="w-full bg-card rounded-2xl border border-border shadow-xs overflow-hidden flex flex-col">
        {/* Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-border/80 bg-card">
          {/* Bot Identity Info with Official JobabDesk Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <JobabLogoAvatar size="md" className="border-border shadow-xs" />
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
                Testing: {storeName} • Real-time Business AI
              </p>
            </div>
          </div>

          {/* Header Action: Clear Chat Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="clearChatBtn"
              onClick={handleClearChat}
              title="Clear Chat History"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 text-xs font-medium transition-colors border border-border/60 hover:border-rose-500/20"
            >
              <Trash2 className="size-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </header>

        {/* Chat Message Stream */}
        <div
          ref={chatStreamRef}
          className="p-6 min-h-[460px] max-h-[640px] overflow-y-auto space-y-6 bg-muted/20"
          id="chatStream"
        >
          {/* Session Initialized Timestamp Divider */}
          <div className="flex items-center justify-center gap-3 my-2">
            <div className="h-[1px] w-12 bg-border" />
            <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Session Initialized • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div className="h-[1px] w-12 bg-border" />
          </div>

          {messages.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center px-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 p-2.5">
                <img src={PRIMARY_LOGO} alt="JobabDesk" className="w-full h-full object-contain" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {storeName} AI Playground Ready
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-md leading-relaxed">
                Chat starts empty so you can test from the beginning. Type any question below or pick a suggested query to test real-time AI responses.
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

              // AI reply message with official JobabDesk logo profile avatar
              return (
                <div key={msg.id} className="flex items-start gap-3 max-w-2xl">
                  <JobabLogoAvatar size="sm" className="mt-0.5" />
                  <div className="space-y-1.5 max-w-xl">
                    <div className="bg-card p-4 rounded-2xl rounded-tl-sm border border-border shadow-xs text-foreground text-sm leading-relaxed whitespace-pre-line">
                      {msg.text}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-1">
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {loading && (
            <div className="flex items-start gap-3 max-w-2xl">
              <JobabLogoAvatar size="sm" className="mt-0.5" />
              <div className="bg-card p-4 rounded-2xl rounded-tl-sm border border-border shadow-xs text-xs text-muted-foreground flex items-center gap-2">
                <RefreshCw className="size-3.5 animate-spin text-primary" />
                <span>JobabDesk AI is composing response...</span>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Suggested Queries Section */}
        {promptChips.length > 0 && (
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
                  onClick={() => handleSend(prompt.replace(/^"|"$/g, ''))}
                  className="prompt-chip inline-flex items-center px-3 py-1.5 rounded-full bg-muted/60 hover:bg-primary/10 hover:text-primary text-foreground text-xs font-medium border border-border/60 hover:border-primary/30 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

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
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-semibold shadow-xs transition-colors shrink-0"
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
