'use client'

import { useState, useEffect } from 'react'
import { Bot, Radio, MessageSquare, Globe, CheckCircle2, AlertCircle, Save, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface ChannelSettings {
  ai_auto_reply_enabled: boolean
  whatsapp_auto_reply_enabled: boolean
  messenger_auto_reply_enabled: boolean
  ai_primary_language: string
  ai_store_instructions: string
  whatsapp_status: string
  messenger_status: string
}

export function ChannelControls() {
  const [settings, setSettings] = useState<ChannelSettings>({
    ai_auto_reply_enabled: true,
    whatsapp_auto_reply_enabled: true,
    messenger_auto_reply_enabled: true,
    ai_primary_language: 'auto_detect',
    ai_store_instructions: '',
    whatsapp_status: 'disconnected',
    messenger_status: 'disconnected',
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
          ai_store_instructions: data.settings.ai_store_instructions || '',
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
      ai_store_instructions: settings.ai_store_instructions,
    })
  }

  if (loading) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading controls...</div>
  }

  return (
    <div className="space-y-6">
      {/* Global Master Switch */}
      <div className="rounded-xl border bg-card p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Bot className="size-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground">Global AI Auto-Reply Master Switch</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Turn all AI auto-replies ON or OFF across all channels instantly.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-muted/30 p-2.5 rounded-xl border">
          <span className="text-xs font-semibold text-foreground">Global Engine:</span>
          <button
            type="button"
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
          <span className={`text-xs font-bold ${settings.ai_auto_reply_enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
            {settings.ai_auto_reply_enabled ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Granular Channel Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* WhatsApp Auto-Reply Control */}
        <div className="rounded-xl border bg-card p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/50 p-2 text-green-600">
                <Radio className="size-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-foreground">WhatsApp Auto-Reply</h4>
                <p className="text-[11px] text-muted-foreground">Meta WhatsApp Business API</p>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                settings.whatsapp_status === 'connected'
                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300'
                  : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {settings.whatsapp_status === 'connected' ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
              {settings.whatsapp_status === 'connected' ? 'Connected' : 'Not Linked'}
            </span>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-xs text-muted-foreground">Channel Auto-Reply Switch</span>
            <button
              type="button"
              onClick={() => updateSettings({ whatsapp_auto_reply_enabled: !settings.whatsapp_auto_reply_enabled })}
              disabled={saving}
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.whatsapp_auto_reply_enabled ? 'bg-green-600' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.whatsapp_auto_reply_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Facebook Messenger Auto-Reply Control */}
        <div className="rounded-xl border bg-card p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 p-2 text-blue-600">
                <MessageSquare className="size-5" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-foreground">Messenger Auto-Reply</h4>
                <p className="text-[11px] text-muted-foreground">Facebook Page Messaging</p>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                settings.messenger_status === 'connected'
                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {settings.messenger_status === 'connected' ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
              {settings.messenger_status === 'connected' ? 'Connected' : 'Not Linked'}
            </span>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-xs text-muted-foreground">Channel Auto-Reply Switch</span>
            <button
              type="button"
              onClick={() => updateSettings({ messenger_auto_reply_enabled: !settings.messenger_auto_reply_enabled })}
              disabled={saving}
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.messenger_auto_reply_enabled ? 'bg-blue-600' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.messenger_auto_reply_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Language Mode Selector */}
      <div className="rounded-xl border bg-card p-5 space-y-3 shadow-xs">
        <div className="flex items-center gap-2 border-b pb-2">
          <Globe className="size-4 text-primary" />
          <h4 className="font-semibold text-sm text-foreground">Primary Language Mode</h4>
        </div>

        <p className="text-xs text-muted-foreground">
          Smart AI automatically matches the language script of incoming messages (Bangla, English, or Banglish).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
          {[
            { id: 'auto_detect', label: '⚡ Auto-Detect (BN/EN/Banglish)', desc: 'Smart matches language' },
            { id: 'bn', label: '🇧🇩 Bengali Only', desc: 'Responds exclusively in বাংলা' },
            { id: 'banglish', label: '💬 Banglish Only', desc: 'Bangla in English script' },
            { id: 'en', label: '🌐 English Only', desc: 'Responds exclusively in English' },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSettings({ ...settings, ai_primary_language: mode.id })}
              className={`rounded-xl p-3 text-left border transition-all ${
                settings.ai_primary_language === mode.id
                  ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <p className="font-bold text-xs">{mode.label}</p>
              <p className="text-[10px] mt-1 opacity-80">{mode.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Store Instructions Textarea */}
      <div className="rounded-xl border bg-card p-5 space-y-3 shadow-xs">
        <div className="flex items-center gap-2 border-b pb-2">
          <FileText className="size-4 text-primary" />
          <h4 className="font-semibold text-sm text-foreground">Custom Store Instructions & Policies</h4>
        </div>

        <p className="text-xs text-muted-foreground">
          Provide specific instructions, delivery rules, or FAQs for the AI to include in customer replies (e.g. &ldquo;We offer free delivery inside Dhaka for orders over ৳2000&rdquo;).
        </p>

        <textarea
          rows={3}
          value={settings.ai_store_instructions}
          onChange={(e) => setSettings({ ...settings, ai_store_instructions: e.target.value })}
          placeholder="e.g. We offer free delivery inside Dhaka for orders over ৳2000. Inside Dhaka delivery takes 24 hours, outside Dhaka takes 2-3 days."
          className="w-full rounded-xl border bg-background p-3.5 text-xs outline-none focus:ring-2 focus:ring-primary resize-none"
        />

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSaveAll}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2 text-xs rounded-xl px-5 shadow-sm"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
