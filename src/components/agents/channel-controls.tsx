'use client'

import { useState, useEffect } from 'react'
import {
  Bot,
  MessageCircle,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  Save,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface ChannelSettings {
  ai_auto_reply_enabled: boolean
  whatsapp_auto_reply_enabled: boolean
  messenger_auto_reply_enabled: boolean
  ai_primary_language: string
  whatsapp_status: string
  messenger_status: string
}

interface ChannelControlsProps {
  onNavigateToConnections?: () => void
}

export function ChannelControls({ onNavigateToConnections }: ChannelControlsProps = {}) {
  const [settings, setSettings] = useState<ChannelSettings>({
    ai_auto_reply_enabled: true,
    whatsapp_auto_reply_enabled: true,
    messenger_auto_reply_enabled: true,
    ai_primary_language: 'auto_detect',
    whatsapp_status: 'connected',
    messenger_status: 'connected',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/ai/settings')
      const data = await res.json()
      if (data.settings) {
        setSettings((prev) => ({
          ...prev,
          ...data.settings,
        }))
      }
    } catch {
      // quiet catch
    } finally {
      setLoading(false)
    }
  }

  const updateSettings = async (updates: Partial<ChannelSettings>) => {
    setSaving(true)
    const next = { ...settings, ...updates }
    setSettings(next)
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update')
      toast.success('Channel automation controls saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
      fetchSettings() // rollback
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAll = () => {
    updateSettings({
      ai_auto_reply_enabled: settings.ai_auto_reply_enabled,
      whatsapp_auto_reply_enabled: settings.whatsapp_auto_reply_enabled,
      messenger_auto_reply_enabled: settings.messenger_auto_reply_enabled,
      ai_primary_language: settings.ai_primary_language,
    })
  }

  if (loading) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading controls...</div>
  }

  return (
    <div className="space-y-6">
      {/* 1. Sleek Global Master Switch */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-5 transition-all">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-primary shrink-0">
            <Bot className="size-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Global AI Auto-Reply Switch</h2>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                settings.ai_auto_reply_enabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${settings.ai_auto_reply_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/60'}`} />
                {settings.ai_auto_reply_enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Master toggle governing automated customer replies across connected messaging channels.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:self-center">
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
            {settings.ai_auto_reply_enabled ? 'All bots responding' : 'Bots paused'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.ai_auto_reply_enabled}
            onClick={() => updateSettings({ ai_auto_reply_enabled: !settings.ai_auto_reply_enabled })}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              settings.ai_auto_reply_enabled ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                settings.ai_auto_reply_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 2. Streamlined Channel Controls (Meta WhatsApp Business & Facebook Messenger) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Meta WhatsApp Business */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between gap-4 hover:border-border/80 transition-all">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <MessageCircle className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Meta WhatsApp Business</h3>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                  settings.whatsapp_status === 'connected' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${settings.whatsapp_status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/60'}`} />
                  {settings.whatsapp_status === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.whatsapp_auto_reply_enabled}
              onClick={() => updateSettings({ whatsapp_auto_reply_enabled: !settings.whatsapp_auto_reply_enabled })}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.whatsapp_auto_reply_enabled ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.whatsapp_auto_reply_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Automates product catalog lookups, stock checks, and order booking confirmations via WhatsApp.
          </p>
        </div>

        {/* Facebook Messenger */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between gap-4 hover:border-border/80 transition-all">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-primary shrink-0">
                <MessageSquare className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Facebook Messenger</h3>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                  settings.messenger_status === 'connected' ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${settings.messenger_status === 'connected' ? 'bg-primary' : 'bg-muted-foreground/60'}`} />
                  {settings.messenger_status === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.messenger_auto_reply_enabled}
              onClick={() => updateSettings({ messenger_auto_reply_enabled: !settings.messenger_auto_reply_enabled })}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.messenger_auto_reply_enabled ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.messenger_auto_reply_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Handles direct customer inquiries, Facebook post-comment replies, and page mentions in real-time.
          </p>
        </div>
      </div>

      {/* 3. Language & AI Persona Mode */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Language &amp; Script Mode</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select how the AI adapts to customer dialects and alphabet scripts.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 border border-border/70 px-2.5 py-1 rounded-full w-fit">
            <Sparkles className="size-3.5 text-primary" />
            <span>Context Detection Enabled</span>
          </span>
        </div>

        {/* Minimalist Segmented Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              id: 'auto_detect',
              label: 'Auto-Detect',
              desc: 'BN, EN, and Banglish dynamically matched.',
            },
            {
              id: 'bn',
              label: 'Bengali (বাংলা)',
              desc: 'Standard Bengali script only.',
            },
            {
              id: 'banglish',
              label: 'Banglish',
              desc: 'Phonetic Bengali in English Roman script.',
            },
            {
              id: 'en',
              label: 'English',
              desc: 'Strict professional English for corporate desks.',
            },
          ].map((mode) => {
            const isSelected = settings.ai_primary_language === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setSettings({ ...settings, ai_primary_language: mode.id })}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col gap-1.5 relative ${
                  isSelected
                    ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{mode.label}</span>
                  {isSelected && <CheckCircle2 className="size-4 text-primary" />}
                </div>
                <span className="text-xs text-muted-foreground leading-relaxed">{mode.desc}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Specific Customer AI Mute Control Info Banner */}
      <div className="rounded-xl border bg-amber-500/10 border-amber-500/20 p-4 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-3">
        <UserX className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div>
          <p className="font-bold">Specific Customer AI Mute Control (Manual Chat Mode)</p>
          <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
            Want to turn OFF AI auto-reply for a specific customer? Open any conversation thread in your <strong>Inbox</strong>, and toggle <strong>&ldquo;Mute AI for this Customer&rdquo;</strong> in the contact sidebar. The AI will pause and leave all incoming chats for manual agent reply.
          </p>
        </div>
      </div>

      {/* Save Action Footer */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSaveAll}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 rounded-xl gap-2 shadow-sm"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving Settings...' : 'Save Automation Controls'}
        </Button>
      </div>
    </div>
  )
}
