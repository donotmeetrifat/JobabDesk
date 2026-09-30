'use client'

import { useState, useEffect } from 'react'
import {
  MessageSquare,
  MessageCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Key,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Smartphone,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SettingsData {
  whatsapp_phone_number_id: string | null
  whatsapp_waba_id: string | null
  whatsapp_access_token: string | null
  whatsapp_status: 'connected' | 'disconnected'
  facebook_page_id: string | null
  facebook_page_name: string | null
  facebook_page_access_token: string | null
  messenger_status: 'connected' | 'disconnected'
}

export function ChannelConnections() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showWaManual, setShowWaManual] = useState(false)
  const [showFbManual, setShowFbManual] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [settings, setSettings] = useState<SettingsData>({
    whatsapp_phone_number_id: '',
    whatsapp_waba_id: '',
    whatsapp_access_token: '',
    whatsapp_status: 'disconnected',
    facebook_page_id: '',
    facebook_page_name: '',
    facebook_page_access_token: '',
    messenger_status: 'disconnected',
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings({
          whatsapp_phone_number_id: data.whatsapp_phone_number_id || '',
          whatsapp_waba_id: data.whatsapp_waba_id || '',
          whatsapp_access_token: data.whatsapp_access_token || '',
          whatsapp_status: data.whatsapp_status || 'disconnected',
          facebook_page_id: data.facebook_page_id || '',
          facebook_page_name: data.facebook_page_name || '',
          facebook_page_access_token: data.facebook_page_access_token || '',
          messenger_status: data.messenger_status || 'disconnected',
        })
      }
    } catch (err) {
      console.error('Failed loading settings', err)
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings(updates: Partial<SettingsData>) {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update settings')
      const data = await res.json()
      setSettings(prev => ({ ...prev, ...data }))
      setMsg({ type: 'success', text: 'Channel settings updated successfully!' })
    } catch {
      setMsg({ type: 'error', text: 'Failed to save settings. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  // Toggle manual setup panels for WhatsApp and Messenger
  function handleConnectWhatsapp() {
    setShowWaManual(true)
    setMsg({ type: 'success', text: 'Please configure your Meta WhatsApp Cloud API credentials below.' })
  }

  function handleDisconnectWhatsapp() {
    saveSettings({
      whatsapp_phone_number_id: '',
      whatsapp_waba_id: '',
      whatsapp_access_token: '',
      whatsapp_status: 'disconnected',
    })
  }

  function handleConnectMessenger() {
    setShowFbManual(true)
    setMsg({ type: 'success', text: 'Please configure your Meta Facebook Page Access Token below.' })
  }

  function handleDisconnectMessenger() {
    saveSettings({
      facebook_page_id: '',
      facebook_page_name: '',
      facebook_page_access_token: '',
      messenger_status: 'disconnected',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading channel configurations...</span>
      </div>
    )
  }

  const isWaConnected = settings.whatsapp_status === 'connected' || Boolean(settings.whatsapp_access_token)
  const isFbConnected = settings.messenger_status === 'connected' || Boolean(settings.facebook_page_access_token)

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
          }`}
        >
          {msg.type === 'success' ? <Check className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* WhatsApp Connection Box */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
                    WhatsApp Business API
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Connect Meta Cloud API to enable automated customer replies
                  </p>
                </div>
              </div>
              <div>
                {isWaConnected ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    <XCircle className="h-3.5 w-3.5 text-zinc-400" />
                    Disconnected
                  </span>
                )}
              </div>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-muted/40 border space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Phone Number ID:</span>
                <span className="font-mono text-foreground font-medium">
                  {settings.whatsapp_phone_number_id || 'Not configured'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">WABA ID:</span>
                <span className="font-mono text-foreground font-medium">
                  {settings.whatsapp_waba_id || 'Not configured'}
                </span>
              </div>
            </div>

            {/* 1-Click Connect button or Disconnect button */}
            <div className="mt-6 space-y-3">
              {isWaConnected ? (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200"
                    onClick={handleDisconnectWhatsapp}
                    disabled={saving}
                  >
                    Disconnect WhatsApp
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-2 shadow-sm"
                  onClick={handleConnectWhatsapp}
                  disabled={saving}
                >
                  <Smartphone className="h-4 w-4" />
                  1-Click Connect WhatsApp Business (Meta OAuth)
                </Button>
              )}
            </div>
          </div>

          {/* Advanced Collapsible Manual Creds */}
          <div className="mt-6 border-t pt-4">
            <button
              type="button"
              className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowWaManual(!showWaManual)}
            >
              <span className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                Advanced Token & Credentials Setup
              </span>
              {showWaManual ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showWaManual && (
              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="block font-medium mb-1 text-muted-foreground">Phone Number ID</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-xs focus:ring-2 focus:ring-primary outline-none"
                    placeholder="e.g. 100982736451001"
                    value={settings.whatsapp_phone_number_id || ''}
                    onChange={e => setSettings({ ...settings, whatsapp_phone_number_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-muted-foreground">WhatsApp Business Account (WABA) ID</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-xs focus:ring-2 focus:ring-primary outline-none"
                    placeholder="e.g. 9082736154321"
                    value={settings.whatsapp_waba_id || ''}
                    onChange={e => setSettings({ ...settings, whatsapp_waba_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-muted-foreground">Meta Permanent Access Token</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-xs focus:ring-2 focus:ring-primary outline-none"
                    placeholder="EAAG..."
                    value={settings.whatsapp_access_token || ''}
                    onChange={e => setSettings({ ...settings, whatsapp_access_token: e.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full mt-2"
                  onClick={() =>
                    saveSettings({
                      whatsapp_phone_number_id: settings.whatsapp_phone_number_id,
                      whatsapp_waba_id: settings.whatsapp_waba_id,
                      whatsapp_access_token: settings.whatsapp_access_token,
                      whatsapp_status: settings.whatsapp_access_token ? 'connected' : 'disconnected',
                    })
                  }
                  disabled={saving}
                >
                  Save Manual Credentials
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Facebook Messenger Box */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
                    Facebook Messenger
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Connect your Facebook Page for instant messenger automation
                  </p>
                </div>
              </div>
              <div>
                {isFbConnected ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    <XCircle className="h-3.5 w-3.5 text-zinc-400" />
                    Disconnected
                  </span>
                )}
              </div>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-muted/40 border space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Connected Page:</span>
                <span className="font-medium text-foreground">
                  {settings.facebook_page_name || 'None'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Page ID:</span>
                <span className="font-mono text-foreground font-medium">
                  {settings.facebook_page_id || 'Not configured'}
                </span>
              </div>
            </div>

            {/* 1-Click Connect button or Disconnect button */}
            <div className="mt-6 space-y-3">
              {isFbConnected ? (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200"
                    onClick={handleDisconnectMessenger}
                    disabled={saving}
                  >
                    Disconnect Facebook Page
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium gap-2 shadow-sm"
                  onClick={handleConnectMessenger}
                  disabled={saving}
                >
                  <MessageCircle className="h-4 w-4" />
                  Connect Facebook Page (Meta OAuth)
                </Button>
              )}
            </div>
          </div>

          {/* Advanced Collapsible Manual Creds */}
          <div className="mt-6 border-t pt-4">
            <button
              type="button"
              className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowFbManual(!showFbManual)}
            >
              <span className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                Advanced Page Access Token Setup
              </span>
              {showFbManual ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showFbManual && (
              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="block font-medium mb-1 text-muted-foreground">Facebook Page Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg border bg-background text-xs focus:ring-2 focus:ring-primary outline-none"
                    placeholder="e.g. My Shop Bangladesh"
                    value={settings.facebook_page_name || ''}
                    onChange={e => setSettings({ ...settings, facebook_page_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-muted-foreground">Facebook Page ID</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-xs focus:ring-2 focus:ring-primary outline-none"
                    placeholder="e.g. 1029384756102"
                    value={settings.facebook_page_id || ''}
                    onChange={e => setSettings({ ...settings, facebook_page_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-muted-foreground">Page Access Token</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 rounded-lg border bg-background font-mono text-xs focus:ring-2 focus:ring-primary outline-none"
                    placeholder="EAAB..."
                    value={settings.facebook_page_access_token || ''}
                    onChange={e => setSettings({ ...settings, facebook_page_access_token: e.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full mt-2"
                  onClick={() =>
                    saveSettings({
                      facebook_page_name: settings.facebook_page_name,
                      facebook_page_id: settings.facebook_page_id,
                      facebook_page_access_token: settings.facebook_page_access_token,
                      messenger_status: settings.facebook_page_access_token ? 'connected' : 'disconnected',
                    })
                  }
                  disabled={saving}
                >
                  Save Manual Page Credentials
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
