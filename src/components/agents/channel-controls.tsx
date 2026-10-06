'use client'

import { useState, useEffect } from 'react'
import {
  Bot,
  Radio,
  MessageSquare,
  Globe,
  CheckCircle2,
  AlertCircle,
  Save,
  Info,
  UserX,
  ShieldCheck,
  QrCode,
  Store,
  Sliders,
  LogOut,
  Zap,
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
  onNavigateToConnections?: (tab?: 'meta' | 'qr' | 'phone') => void
}

export function ChannelControls({ onNavigateToConnections }: ChannelControlsProps) {
  const [settings, setSettings] = useState<ChannelSettings>({
    ai_auto_reply_enabled: true,
    whatsapp_auto_reply_enabled: true,
    messenger_auto_reply_enabled: true,
    ai_primary_language: 'auto_detect',
    whatsapp_status: 'disconnected',
    messenger_status: 'connected',
  })
  const [storeName, setStoreName] = useState('Aura Home Living')
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
        if (data.settings.name?.trim()) {
          setStoreName(data.settings.name.trim())
        }
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
      {/* Global Master Switch */}
      <div className="rounded-2xl border bg-card p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary shrink-0">
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

      {/* Two Column Primary Integration Grid (Redesigned matching stitch_jobdesk_ui_redesign) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Card 1: WhatsApp Integration */}
        <section className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between transition-all duration-200 hover:shadow-md">
          {/* Ambient subtle background blur spot */}
          <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

          <div className="flex flex-col gap-5">
            {/* Card Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 flex items-center justify-center shrink-0 text-[#25D366]">
                  <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67ZM8.53 7.33C8.37 7.33 8.1 7.39 7.87 7.64C7.65 7.89 7.02 8.48 7.02 9.68C7.02 10.88 7.9 12.03 8.02 12.19C8.14 12.35 9.74 14.82 12.19 15.88C12.78 16.13 13.23 16.28 13.59 16.39C14.18 16.58 14.72 16.55 15.15 16.49C15.63 16.42 16.62 15.89 16.83 15.31C17.03 14.72 17.03 14.22 16.97 14.12C16.91 14.02 16.76 13.96 16.53 13.84C16.3 13.73 15.18 13.18 14.97 13.1C14.76 13.02 14.61 12.98 14.45 13.21C14.3 13.45 13.86 13.96 13.73 14.12C13.6 14.27 13.47 14.29 13.24 14.17C13.01 14.06 12.28 13.82 11.41 13.04C10.73 12.44 10.27 11.69 10.14 11.46C10.01 11.24 10.12 11.11 10.24 11C10.34 10.9 10.47 10.73 10.59 10.59C10.71 10.45 10.75 10.35 10.83 10.19C10.91 10.04 10.87 9.9 10.81 9.78C10.75 9.67 10.3 8.56 10.12 8.11C9.93 7.67 9.75 7.73 9.61 7.72C9.48 7.72 9.33 7.72 9.17 7.72C9.02 7.72 8.77 7.78 8.56 8.01L8.53 7.33Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">WhatsApp Integration</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connect Cloud API, QR Code, or 8-digit device pairing code
                  </p>
                </div>
              </div>

              {settings.whatsapp_status === 'connected' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground text-xs font-medium border border-border">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/60" />
                  Disconnected
                </span>
              )}
            </div>

            {/* Connection Details Slate Panel */}
            <div className="bg-muted/40 rounded-xl p-4 flex flex-col gap-2.5 border border-border/60">
              <div className="flex items-center justify-between text-xs text-foreground">
                <span className="text-muted-foreground font-medium">Channel Protocol</span>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <CheckCircle2 className="size-3.5 text-primary" />
                  Meta Graph API v19.0
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-foreground">
                <span className="text-muted-foreground font-medium">Monthly Allocation</span>
                <span className="text-foreground font-medium">1,000 Free Service Conversations</span>
              </div>
              <div className="flex items-center justify-between text-xs text-foreground">
                <span className="text-muted-foreground font-medium">Automated Failover</span>
                <span className="text-emerald-500 font-semibold">Smart QR Standby</span>
              </div>

              {/* Integrated Channel Auto-Reply Switch */}
              <div className="flex items-center justify-between border-t border-border/50 pt-2.5 mt-1">
                <div>
                  <span className="text-xs font-semibold text-foreground block">Channel Auto-Reply Switch</span>
                  <span className="text-[11px] text-muted-foreground">Automatic 24/7 AI response to incoming messages</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateSettings({ whatsapp_auto_reply_enabled: !settings.whatsapp_auto_reply_enabled })}
                  disabled={saving}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.whatsapp_auto_reply_enabled ? 'bg-[#25D366]' : 'bg-muted-foreground/30'
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

            {/* Primary Action Block */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                id="connect-whatsapp-btn"
                onClick={() => onNavigateToConnections?.('meta')}
                className="w-full py-3 px-5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] active:scale-[0.99] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all duration-150"
              >
                <ShieldCheck className="size-5" />
                <span>Connect Official WhatsApp Cloud API</span>
              </button>
              <div className="flex items-center justify-center gap-1.5 text-center text-muted-foreground text-xs">
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                <span>100% stable cloud connectivity • Each business gets 1,000 free monthly conversations</span>
              </div>
            </div>

            {/* Alternate Pairing Divider */}
            <div className="relative flex py-1 items-center">
              <div className="grow border-t border-border" />
              <span className="shrink-0 mx-4 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                or alternate pairing
              </span>
              <div className="grow border-t border-border" />
            </div>

            {/* Secondary Pairing Option */}
            <button
              type="button"
              onClick={() => onNavigateToConnections?.('qr')}
              className="w-full py-2.5 px-4 rounded-lg bg-card hover:bg-muted text-foreground border border-border/80 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <QrCode className="size-4 text-muted-foreground" />
              <span>Scan QR Code / 8-Digit Pairing Code</span>
            </button>
          </div>

          {/* Trust & Security Footer Tag */}
          <div className="mt-5 pt-3.5 border-t border-border flex items-center gap-2 text-muted-foreground text-xs">
            <ShieldCheck className="size-4 text-[#25D366]" />
            <span>Official Cloud API with automated rate-limiting protection</span>
          </div>
        </section>

        {/* Card 2: Facebook Page Messaging */}
        <section className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between transition-all duration-200 hover:shadow-md">
          {/* Ambient subtle background blur spot */}
          <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />

          <div className="flex flex-col gap-5">
            {/* Card Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#0084FF]/10 flex items-center justify-center shrink-0 text-[#0084FF]">
                  <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.36 2 2 6.13 2 11.7C2 14.61 3.19 17.06 5.15 18.73V22L8.27 20.28C9.44 20.61 10.69 20.79 12 20.79C17.64 20.79 22 16.66 22 11.09C22 5.53 17.64 2 12 2M13.11 14.15L10.74 11.62L6.11 14.15L11.19 8.75L13.56 11.28L18.19 8.75L13.11 14.15Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Facebook Page Messaging</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connect your Facebook business page for automated customer inquiries
                  </p>
                </div>
              </div>

              {settings.messenger_status === 'connected' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground text-xs font-medium border border-border">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/60" />
                  Not Linked
                </span>
              )}
            </div>

            {/* Connected Profile Showcase Row */}
            <div className="bg-muted/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-border/60">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-base shadow-inner shrink-0 overflow-hidden">
                  <Store className="size-6 text-primary" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-foreground">{storeName}</span>
                    <span title="Verified Facebook Merchant Page" className="inline-flex items-center">
                      <CheckCircle2 className="size-3.5 text-primary" />
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-muted-foreground text-xs">
                    <span>
                      Page ID: <code className="bg-card px-1 py-0.5 rounded text-[11px] font-mono text-foreground border border-border">fb_893240219</code>
                    </span>
                    <span>•</span>
                    <span>Linked May 14, 2024</span>
                  </div>
                </div>
              </div>
              <div className="flex sm:flex-col items-start sm:items-end gap-1">
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-semibold border border-primary/20">
                  Live 24/7 Bot
                </span>
                <span className="text-[11px] text-muted-foreground">Sync: 12 sec ago</span>
              </div>
            </div>

            {/* Integrated Channel Auto-Reply Switch */}
            <div className="bg-muted/40 rounded-xl p-4 flex items-center justify-between border border-border/60">
              <div>
                <span className="text-xs font-semibold text-foreground block">Channel Auto-Reply Switch</span>
                <span className="text-[11px] text-muted-foreground">Automatic 24/7 AI response to incoming messages</span>
              </div>
              <button
                type="button"
                onClick={() => updateSettings({ messenger_auto_reply_enabled: !settings.messenger_auto_reply_enabled })}
                disabled={saving}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.messenger_auto_reply_enabled ? 'bg-[#0084FF]' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.messenger_auto_reply_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Action Row */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigateToConnections?.('meta')}
                className="w-full sm:flex-1 py-2.5 px-4 rounded-lg bg-card hover:bg-muted border border-border/80 text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Sliders className="size-4 text-muted-foreground" />
                <span>Reconfigure Permissions</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  updateSettings({ messenger_status: 'disconnected', messenger_auto_reply_enabled: false })
                  toast.info('Facebook Page disconnected')
                }}
                className="w-full sm:w-auto py-2.5 px-4 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="size-4" />
                <span>Disconnect Channel</span>
              </button>
            </div>
          </div>

          {/* Webhook & Sync Security Footer */}
          <div className="mt-5 pt-3.5 border-t border-border flex items-center gap-2 text-muted-foreground text-xs">
            <Zap className="size-4 text-[#0084FF]" />
            <span>Real-time webhook routing &amp; token encryption active</span>
          </div>
        </section>
      </div>

      {/* Language Mode Selector */}
      <div className="rounded-2xl border bg-card p-5 space-y-3 shadow-xs">
        <div className="flex items-center gap-2 border-b pb-2">
          <Globe className="size-4 text-primary" />
          <h4 className="font-semibold text-sm text-foreground">Primary Language Mode</h4>
        </div>

        <p className="text-xs text-muted-foreground">
          Smart AI automatically matches the language script of incoming customer messages (Bangla, English, or Banglish).
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

      {/* Per-Contact Mute Guidance Info Banner */}
      <div className="rounded-2xl border bg-amber-500/10 border-amber-500/20 p-4 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-3">
        <UserX className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div>
          <p className="font-bold">Specific Customer AI Mute Control (Manual Chat Mode)</p>
          <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
            Want to turn OFF AI auto-reply for a specific customer? Open any conversation thread in your <strong>Inbox</strong>, and toggle <strong>&ldquo;Mute AI for this Customer&rdquo;</strong> in the contact sidebar. The AI will pause and leave all incoming chats for manual agent reply.
          </p>
        </div>
      </div>

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
