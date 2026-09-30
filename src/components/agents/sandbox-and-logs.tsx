'use client'

import { useState, useEffect } from 'react'
import {
  Send,
  Sparkles,
  Bot,
  RefreshCw,
  Clock,
  Globe,
  Tag,
  Cpu,
  User,
  MessageSquare,
  MessageCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LogEntry {
  id: string
  created_at: string
  channel: 'whatsapp' | 'messenger' | 'sandbox'
  incoming_message: string
  detected_language: string
  intent_detected: string
  ai_reply: string
  provider_used: string
  model_used: string
}

interface SimulationResult {
  ai_reply: string
  detected_language: string
  intent_detected: string
  provider_used: string
  model_used: string
  bypass_reason?: string
}

export function SandboxAndLogs() {
  const [inputMessage, setInputMessage] = useState('bhai Nivea face wash er dam koto? stock ache?')
  const [selectedChannel, setSelectedChannel] = useState<'sandbox' | 'whatsapp' | 'messenger'>('sandbox')
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)
  
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  async function fetchLogs() {
    setLoadingLogs(true)
    try {
      const res = await fetch('/api/ai/logs')
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      }
    } catch (err) {
      console.error('Failed fetching logs', err)
    } finally {
      setLoadingLogs(false)
    }
  }

  async function handleSimulate(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!inputMessage.trim() || simulating) return

    setSimulating(true)
    setSimResult(null)

    try {
      const res = await fetch('/api/ai/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputMessage,
          channel: selectedChannel,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setSimResult(data)
        // Refresh logs after simulation
        fetchLogs()
      } else {
        const err = await res.json()
        setSimResult({
          ai_reply: `[Error]: ${err.error || 'Failed to simulate auto-reply'}`,
          detected_language: 'error',
          intent_detected: 'error',
          provider_used: 'none',
          model_used: 'none',
        })
      }
    } catch {
      setSimResult({
        ai_reply: '[Error]: Network error simulating response',
        detected_language: 'error',
        intent_detected: 'error',
        provider_used: 'none',
        model_used: 'none',
      })
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Interactive Sandbox Section */}
      <div className="bg-card border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-foreground">Live AI Chat Sandbox</h3>
            <p className="text-xs text-muted-foreground">
              Test multi-language responses in real-time (English, Bengali, or Banglish)
            </p>
          </div>
        </div>

        {/* Quick Sample Prompts */}
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <span className="text-muted-foreground py-1 font-medium">Quick Prompts:</span>
          <button
            type="button"
            className="px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted text-foreground transition-colors border"
            onClick={() => setInputMessage('bhai Nivea face wash er dam koto? stock ache?')}
          >
            Banglish: "bhai Nivea face wash er dam koto?"
          </button>
          <button
            type="button"
            className="px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted text-foreground transition-colors border"
            onClick={() => setInputMessage('নিভিয়া ফেস ওয়াশের দাম কত? স্টক কি আছে?')}
          >
            Bengali: "নিভিয়া ফেস ওয়াশের দাম কত?"
          </button>
          <button
            type="button"
            className="px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted text-foreground transition-colors border"
            onClick={() => setInputMessage('What is the price of Nivea cleanser and is it in stock?')}
          >
            English: "What is the price of Nivea cleanser?"
          </button>
        </div>

        <form onSubmit={handleSimulate} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                className="w-full px-4 py-3 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-primary outline-none"
                placeholder="Type customer message in English, Bengali or Banglish..."
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select
                className="px-3 py-3 rounded-xl border bg-background text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                value={selectedChannel}
                onChange={e => setSelectedChannel(e.target.value as any)}
              >
                <option value="sandbox">Sandbox Test</option>
                <option value="whatsapp">WhatsApp Channel</option>
                <option value="messenger">Messenger Channel</option>
              </select>
              <Button
                type="submit"
                disabled={simulating || !inputMessage.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-5 rounded-xl gap-2 shadow-sm"
              >
                {simulating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Simulating...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Test AI Reply
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* Simulation Result Preview Box */}
        {simResult && (
          <div className="mt-6 p-5 rounded-2xl bg-muted/30 border space-y-4 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Bot className="h-4 w-4 text-primary" />
                  AI Router Result
                </span>
                {simResult.bypass_reason && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 font-medium">
                    Auto-Reply Disabled ({simResult.bypass_reason})
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-mono font-medium flex items-center gap-1">
                  <Globe className="h-3 w-3" /> Lang: {simResult.detected_language}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 font-mono font-medium flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Intent: {simResult.intent_detected}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-mono font-medium flex items-center gap-1">
                  <Zap className="h-3 w-3" /> {simResult.provider_used} ({simResult.model_used})
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-muted border flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="bg-background border rounded-2xl rounded-tl-none p-3.5 text-sm max-w-xl text-foreground">
                  <p className="font-medium text-xs text-muted-foreground mb-1">Customer Query</p>
                  {inputMessage}
                </div>
              </div>

              <div className="flex items-start gap-3 justify-end">
                <div className="bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-none p-3.5 text-sm max-w-xl text-foreground">
                  <p className="font-medium text-xs text-primary mb-1 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> Generated AI Response
                  </p>
                  <p className="whitespace-pre-wrap">{simResult.ai_reply}</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0 shadow-sm">
                  <Bot className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Auto-Reply History Table */}
      <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Auto-Reply History & Logs
            </h3>
            <p className="text-xs text-muted-foreground">
              Recent automated customer replies generated by the AI Router
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            disabled={loadingLogs}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
            Refresh Logs
          </Button>
        </div>

        {loadingLogs ? (
          <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            Loading recent auto-reply logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground border rounded-xl bg-muted/20">
            No auto-replies logged yet. Use the Live Sandbox above to test and generate your first logs!
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground font-semibold border-b">
                  <th className="p-3">Time</th>
                  <th className="p-3">Channel</th>
                  <th className="p-3">Incoming Customer Message</th>
                  <th className="p-3">Language</th>
                  <th className="p-3">Intent</th>
                  <th className="p-3">AI Response</th>
                  <th className="p-3">Provider</th>
                </tr>
              </thead>
              <tbody className="divide-y text-foreground">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 whitespace-nowrap text-muted-foreground font-mono">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="capitalize font-medium flex items-center gap-1">
                        {log.channel === 'whatsapp' ? (
                          <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
                        ) : log.channel === 'messenger' ? (
                          <MessageCircle className="h-3.5 w-3.5 text-blue-500" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                        )}
                        {log.channel}
                      </span>
                    </td>
                    <td className="p-3 max-w-xs truncate font-medium" title={log.incoming_message}>
                      {log.incoming_message}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-muted font-mono font-medium text-[11px]">
                        {log.detected_language}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 font-mono font-medium text-[11px]">
                        {log.intent_detected}
                      </span>
                    </td>
                    <td className="p-3 max-w-sm truncate" title={log.ai_reply}>
                      {log.ai_reply}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono font-medium text-[11px]">
                        {log.provider_used}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
