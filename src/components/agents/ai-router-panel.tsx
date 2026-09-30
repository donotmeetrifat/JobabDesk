'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Send, RefreshCw, MessageSquare, Bot, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface AutoReplyLog {
  id: string
  incoming_message: string
  intent_detected: 'product_inquiry' | 'order_status' | 'general_faq' | 'human_escalation'
  ai_reply: string
  model_used: string
  confidence_score: number
  is_sent: boolean
  created_at: string
  contact?: {
    name?: string | null
    phone?: string | null
  } | null
}

const INTENT_BADGES: Record<string, { label: string; style: string }> = {
  product_inquiry: {
    label: 'Product Inquiry',
    style: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  order_status: {
    label: 'Order Status',
    style: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  },
  general_faq: {
    label: 'General FAQ',
    style: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  },
  human_escalation: {
    label: 'Human Escalation',
    style: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
  },
}

export function AiRouterPanel() {
  const [enabled, setEnabled] = useState(true)
  const [tone, setTone] = useState('friendly_bangla')
  const [savingSettings, setSavingSettings] = useState(false)

  const [logs, setLogs] = useState<AutoReplyLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  // Sandbox states
  const [sampleMessage, setSampleMessage] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    intent: string
    aiReply: string
    modelUsed: string
    confidence: number
  } | null>(null)

  // Load Settings & Logs
  useEffect(() => {
    fetch('/api/ai/router-settings')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.ai_auto_reply_enabled === 'boolean') setEnabled(d.ai_auto_reply_enabled)
        if (d.ai_auto_reply_tone) setTone(d.ai_auto_reply_tone)
      })
      .catch(() => {})

    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    setLoadingLogs(true)
    try {
      const res = await fetch('/api/ai/router-logs?limit=20')
      const data = await res.json()
      setLogs(data.logs ?? [])
    } catch {
      toast.error('Failed to load auto-reply logs')
    } finally {
      setLoadingLogs(false)
    }
  }

  const handleSaveSettings = async (newEnabled: boolean, newTone: string) => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/ai/router-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_auto_reply_enabled: newEnabled,
          ai_auto_reply_tone: newTone,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save settings')
      toast.success('AI auto-reply settings updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleTestSandbox = async () => {
    if (!sampleMessage.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/ai/router-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageText: sampleMessage.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Test failed')
      setTestResult(data.result)
      fetchLogs()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Settings */}
      <div className="rounded-xl border bg-card p-6 space-y-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <Bot className="size-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">AI WhatsApp & Messenger Router</h2>
              <p className="text-xs text-muted-foreground">
                Automatically detects intent (Product inquiry, Order status, FAQ) and replies to customers.
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center gap-3 bg-muted/40 p-2 rounded-lg border">
            <span className="text-xs font-semibold text-foreground">Auto-Reply Status:</span>
            <button
              type="button"
              onClick={() => {
                const next = !enabled
                setEnabled(next)
                handleSaveSettings(next, tone)
              }}
              disabled={savingSettings}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enabled ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-xs font-semibold ${enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
              {enabled ? 'Active' : 'Disabled'}
            </span>
          </div>
        </div>

        {/* Tone Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">AI Response Tone</label>
            <select
              value={tone}
              onChange={(e) => {
                const newTone = e.target.value
                setTone(newTone)
                handleSaveSettings(enabled, newTone)
              }}
              className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="friendly_bangla">Friendly Bangladeshi Bengali (ন্যাচারাল বাংলা)</option>
              <option value="professional_english">Professional English</option>
              <option value="short_direct">Short & Direct (সংক্ষিপ্ত ও সরাসরি)</option>
            </select>
          </div>

          <div className="md:col-span-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-2">
            <Sparkles className="size-5 text-primary shrink-0" />
            <span>
              The engine automatically matches your live product catalogue and recent order history to give exact, accurate replies without hallucinating prices.
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Interactive Test Sandbox & Recent Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Test Sandbox (Interactive Simulator) */}
        <div className="lg:col-span-5 rounded-xl border bg-card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-3">
              <Sparkles className="size-4 text-purple-600" />
              <h3 className="font-semibold text-sm text-foreground">Interactive AI Router Simulator</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Test how the AI router interprets customer messages and generates replies in real time.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Sample Customer Message</label>
              <div className="relative">
                <textarea
                  value={sampleMessage}
                  onChange={(e) => setSampleMessage(e.target.value)}
                  rows={3}
                  placeholder="e.g. এই প্রোডাক্টের প্রাইস কত? নাকি স্টক শেষ?"
                  className="w-full rounded-lg border bg-background p-3 text-xs outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-muted-foreground self-center">Try:</span>
                {[
                  'আজকে ডেলিভারি দেওয়া যাবে?',
                  'আমার ORD-2026-0001 অর্ডার কি শিফ হয়েছে?',
                  'প্রোডাক্টের দাম কত?',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSampleMessage(preset)}
                    className="rounded bg-muted/60 hover:bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    &ldquo;{preset}&rdquo;
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleTestSandbox}
              disabled={testing || !sampleMessage.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 text-xs disabled:opacity-50 transition-colors cursor-pointer"
            >
              {testing ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" /> Simulating AI Router...
                </>
              ) : (
                <>
                  <Send className="size-3.5" /> Test AI Response
                </>
              )}
            </button>
          </div>

          {/* Test Result Output Box */}
          {testResult && (
            <div className="mt-4 rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-purple-200 dark:border-purple-900/50 pb-2">
                <span className="font-semibold text-purple-900 dark:text-purple-300">Detected Intent</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${INTENT_BADGES[testResult.intent]?.style ?? INTENT_BADGES.general_faq.style}`}>
                  {INTENT_BADGES[testResult.intent]?.label ?? testResult.intent}
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase font-semibold text-purple-700 dark:text-purple-400">Generated Reply</p>
                <p className="text-foreground bg-background/80 p-2.5 rounded-lg border text-xs whitespace-pre-wrap">
                  {testResult.aiReply}
                </p>
              </div>

              <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
                <span>Model: {testResult.modelUsed}</span>
                <span>Confidence: {Math.round(testResult.confidence * 100)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Recent Auto-Replies Logs Table */}
        <div className="lg:col-span-7 rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Recent Auto-Replies Log</h3>
            </div>
            <button
              onClick={fetchLogs}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 underline-offset-2 hover:underline"
            >
              <RefreshCw className="size-3" /> Refresh
            </button>
          </div>

          {loadingLogs ? (
            <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
              Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center border border-dashed rounded-lg text-center p-4">
              <p className="text-xs font-semibold">No auto-reply logs recorded yet</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Incoming customer messages on WhatsApp / Messenger will be logged here automatically.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-muted-foreground sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Incoming Message</th>
                    <th className="px-3 py-2">AI Response Generated</th>
                    <th className="px-3 py-2">Intent</th>
                    <th className="px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => {
                    const badge = INTENT_BADGES[log.intent_detected] ?? INTENT_BADGES.general_faq

                    return (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                          {log.contact?.name || log.contact?.phone || 'Customer'}
                        </td>
                        <td className="px-3 py-2 max-w-[140px] truncate text-muted-foreground" title={log.incoming_message}>
                          {log.incoming_message}
                        </td>
                        <td className="px-3 py-2 max-w-[180px] truncate font-medium text-foreground" title={log.ai_reply}>
                          {log.ai_reply}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.style}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
