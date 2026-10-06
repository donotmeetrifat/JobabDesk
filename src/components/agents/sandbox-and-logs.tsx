'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send,
  Sparkles,
  Bot,
  User,
  Trash2,
  Globe,
  Tag,
  Zap,
  MessageSquare,
  MessageCircle,
  Clock,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ChatMessage {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp: string
  detectedLanguage?: string
  intentDetected?: string
  providerUsed?: string
  modelUsed?: string
}

export function SandboxAndLogs() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: 'Hello! I am your Multi-Language AI Assistant. Ask me anything in English, Bengali (বাংলা), or Banglish!',
      timestamp: 'Just now',
      detectedLanguage: 'en',
      intentDetected: 'general_faq',
      providerUsed: 'gemini',
      modelUsed: 'gemini-3.8-flash',
    },
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [selectedChannel, setSelectedChannel] = useState<'sandbox' | 'whatsapp' | 'messenger'>('sandbox')
  const [loading, setLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const text = inputMessage.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    setInputMessage('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, channel: selectedChannel }),
      })

      const data = await res.json()

      const aiMsg: ChatMessage = {
        id: 'ai-' + Date.now(),
        sender: 'ai',
        text: data.ai_reply || 'Sorry, no response generated.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        detectedLanguage: data.detected_language,
        intentDetected: data.intent_detected,
        providerUsed: data.provider_used,
        modelUsed: data.model_used,
      }

      setMessages((prev) => [...prev, aiMsg])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'ai',
          text: 'Error generating response. Please check connection.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          detectedLanguage: 'error',
          intentDetected: 'error',
          providerUsed: 'none',
          modelUsed: 'none',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleClearChat() {
    setMessages([])
  }

  return (
    <div className="space-y-6">
      {/* WhatsApp/Messenger Styled Chat Simulator Container */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden flex flex-col h-[650px]">
        {/* Top Chat Header */}
        <div className="p-4 bg-muted/40 border-b flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                JobabDesk AI Agent Simulator
              </h3>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Online &bull; Multi-Language Router
              </p>
            </div>
          </div>

          {/* Channel Selector Pill & Actions */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-xl bg-background border p-1 text-xs">
              <button
                type="button"
                onClick={() => setSelectedChannel('sandbox')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  selectedChannel === 'sandbox'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sandbox
              </button>
              <button
                type="button"
                onClick={() => setSelectedChannel('whatsapp')}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                  selectedChannel === 'whatsapp'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MessageSquare className="h-3 w-3" /> WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setSelectedChannel('messenger')}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                  selectedChannel === 'messenger'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MessageCircle className="h-3 w-3" /> Messenger
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClearChat}
              className="text-xs text-muted-foreground hover:text-red-600 gap-1 rounded-xl h-8"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear Chat
            </Button>
          </div>
        </div>

        {/* Chat Messages Bubble Thread */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-muted/10">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <Sparkles className="h-8 w-8 text-primary opacity-40 mb-2" />
              <p className="text-sm font-medium text-foreground">Playground Reset</p>
              <p className="text-xs mt-1">Type any question below or click a quick prompt to test AI replies.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}
              >
                <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[70%]">
                  {msg.sender === 'ai' && (
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs shrink-0 shadow-xs">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}

                  <div
                    className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-none shadow-xs'
                        : 'bg-background border text-foreground rounded-bl-none shadow-xs'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <div
                      className={`text-[10px] mt-1.5 flex items-center justify-end gap-1 ${
                        msg.sender === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}
                    >
                      <Clock className="h-2.5 w-2.5" /> {msg.timestamp}
                    </div>
                  </div>

                  {msg.sender === 'user' && (
                    <div className="h-7 w-7 rounded-full bg-muted border flex items-center justify-center text-muted-foreground text-xs shrink-0">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>

                {/* AI Metadata Badges */}
                {msg.sender === 'ai' && msg.detectedLanguage && (
                  <div className="flex flex-wrap items-center gap-1.5 ml-9 text-[10px]">
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-mono font-medium flex items-center gap-1">
                      <Globe className="h-2.5 w-2.5" /> Lang: {msg.detectedLanguage}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 font-mono font-medium flex items-center gap-1">
                      <Tag className="h-2.5 w-2.5" /> Intent: {msg.intentDetected}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-mono font-medium flex items-center gap-1">
                      <Zap className="h-2.5 w-2.5" /> {msg.providerUsed} ({msg.modelUsed})
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick Prompts Bar & Message Input Form */}
        <div className="p-4 bg-background border-t space-y-3">
          {/* Quick Prompts */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-[11px] font-medium text-muted-foreground self-center">Try Prompts:</span>
            {[
              'Nivea face wash price?',
              'নিভিয়া ফেস ওয়াশ স্টকে আছে?',
              'bhai delivery charge koto?',
              'আমার অর্ডারের স্ট্যাটাস কি?',
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInputMessage(prompt)}
                className="px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted text-foreground transition-colors border text-[11px]"
              >
                &ldquo;{prompt}&rdquo;
              </button>
            ))}
          </div>

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type message in English, Bengali (বাংলা), or Banglish..."
              className="flex-1 px-4 py-2.5 rounded-xl border bg-background text-xs sm:text-sm focus:ring-2 focus:ring-primary outline-none"
            />
            <Button
              type="submit"
              disabled={loading || !inputMessage.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-5 gap-2 text-xs font-medium"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" /> Send
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
