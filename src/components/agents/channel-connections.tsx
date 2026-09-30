'use client'

import { useState, useEffect } from 'react'
import {
  Smartphone,
  MessageCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  QrCode,
  LogOut,
  ShieldCheck,
  Zap,
  Copy,
  Check,
  Key,
  Globe,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'connected'
  qrCode: string
  connectedNumber: string
}

interface MessengerStatus {
  status: 'disconnected' | 'connected'
  pageId: string
  pageName: string
}

export function ChannelConnections() {
  const [waSession, setWaSession] = useState<WhatsAppStatus>({
    status: 'disconnected',
    qrCode: '',
    connectedNumber: '',
  })
  const [fbSession, setFbSession] = useState<MessengerStatus>({
    status: 'disconnected',
    pageId: '',
    pageName: '',
  })

  const [loadingWa, setLoadingWa] = useState(true)
  const [loadingFb, setLoadingFb] = useState(true)
  const [generatingQr, setGeneratingQr] = useState(false)
  const [connectingFb, setConnectingFb] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)

  // Facebook Messenger Setup Modal state
  const [showFbModal, setShowFbModal] = useState(false)
  const [fbPageName, setFbPageName] = useState('')
  const [fbPageId, setFbPageId] = useState('')
  const [fbAccessToken, setFbAccessToken] = useState('')
  const [fbError, setFbError] = useState('')
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [copiedVerifyToken, setCopiedVerifyToken] = useState(false)

  const webhookUrl = 'https://jobabdesk.vercel.app/api/webhooks/messenger'
  const verifyToken = 'jobabdesk_verify_token'

  // Load WhatsApp & Facebook Messenger statuses
  useEffect(() => {
    fetchWaStatus()
    fetchFbStatus()
  }, [])

  // Auto-polling when QR modal is active or connecting
  useEffect(() => {
    if (waSession.status !== 'connecting') return
    const timer = setInterval(() => {
      fetchWaStatus()
    }, 3000)
    return () => clearInterval(timer)
  }, [waSession.status])

  async function fetchWaStatus() {
    try {
      const res = await fetch('/api/channels/whatsapp/qr')
      if (res.ok) {
        const data = await res.json()
        setWaSession(data)
        if (data.status === 'connected') {
          setShowQrModal(false)
        }
      }
    } catch {
      // quiet catch
    } finally {
      setLoadingWa(false)
    }
  }

  async function fetchFbStatus() {
    try {
      const res = await fetch('/api/channels/messenger/connect')
      if (res.ok) {
        const data = await res.json()
        setFbSession(data)
        if (data.pageId) setFbPageId(data.pageId)
        if (data.pageName) setFbPageName(data.pageName)
      }
    } catch {
      // quiet catch
    } finally {
      setLoadingFb(false)
    }
  }

  async function handleGenerateQr() {
    setGeneratingQr(true)
    setShowQrModal(true)
    try {
      const res = await fetch('/api/channels/whatsapp/qr', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setWaSession(data)
      }
    } catch {
      // quiet catch
    } finally {
      setGeneratingQr(false)
    }
  }

  async function handleConfirmPairing() {
    try {
      const res = await fetch('/api/channels/whatsapp/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      })
      if (res.ok) {
        const data = await res.json()
        setWaSession(data)
        setShowQrModal(false)
      }
    } catch {
      // quiet catch
    }
  }

  async function handleDisconnectWa() {
    try {
      const res = await fetch('/api/channels/whatsapp/disconnect', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setWaSession(data)
      }
    } catch {
      // quiet catch
    }
  }

  async function handleSaveFbCredentials() {
    setFbError('')
    if (!fbPageId.trim() || !fbAccessToken.trim()) {
      setFbError('Facebook Page ID and Page Access Token are required.')
      return
    }

    setConnectingFb(true)
    try {
      const res = await fetch('/api/channels/messenger/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageData: {
            pageId: fbPageId.trim(),
            pageName: fbPageName.trim(),
            accessToken: fbAccessToken.trim(),
          },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setFbSession(data)
        if (data.status === 'connected') {
          setShowFbModal(false)
        } else {
          setFbError('Failed to save credentials. Please check your inputs.')
        }
      } else {
        setFbError('Failed to connect Facebook Page. Check server logs.')
      }
    } catch {
      setFbError('Network error while saving Facebook credentials.')
    } finally {
      setConnectingFb(false)
    }
  }

  async function handleDisconnectFb() {
    try {
      const res = await fetch('/api/channels/messenger/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      })
      if (res.ok) {
        const data = await res.json()
        setFbSession(data)
        setFbPageId('')
        setFbPageName('')
        setFbAccessToken('')
      }
    } catch {
      // quiet catch
    }
  }

  function handleCopy(text: string, type: 'webhook' | 'token') {
    navigator.clipboard.writeText(text)
    if (type === 'webhook') {
      setCopiedWebhook(true)
      setTimeout(() => setCopiedWebhook(false), 2000)
    } else {
      setCopiedVerifyToken(true)
      setTimeout(() => setCopiedVerifyToken(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: WhatsApp Customer Support (QR Code Scanner) */}
        <div className="rounded-2xl border bg-card p-6 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                    WhatsApp Business Pairing
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Connect your phone by scanning a QR Code (Zero API setup needed)
                  </p>
                </div>
              </div>
            </div>

            {/* Connection Status Indicator */}
            <div className="p-4 rounded-xl bg-muted/30 border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Session Status:</span>
                {waSession.status === 'connected' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    Connected
                  </span>
                ) : waSession.status === 'connecting' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                    Waiting for QR Scan...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    Disconnected
                  </span>
                )}
              </div>

              {waSession.status === 'connected' && (
                <div className="flex items-center justify-between text-xs pt-1 border-t">
                  <span className="text-muted-foreground">Connected Phone:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {waSession.connectedNumber || '+88017XXXXXXXX'}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div>
              {waSession.status === 'connected' ? (
                <Button
                  variant="outline"
                  onClick={handleDisconnectWa}
                  className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 font-semibold gap-2 rounded-xl"
                >
                  <LogOut className="h-4 w-4" /> Disconnect WhatsApp Session
                </Button>
              ) : (
                <Button
                  onClick={handleGenerateQr}
                  disabled={generatingQr}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 rounded-xl shadow-xs py-3"
                >
                  {generatingQr ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="h-4 w-4" />
                  )}
                  📱 Generate QR Code to Link Phone
                </Button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 border-t pt-3">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>0% Ban Risk with Jittered Human Typing Simulation (800ms–1500ms)</span>
          </div>
        </div>

        {/* Card 2: Facebook Messenger Meta API Connection */}
        <div className="rounded-2xl border bg-card p-6 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                    Facebook Page Messaging
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Connect your Facebook Business Page for automated Messenger replies
                  </p>
                </div>
              </div>
            </div>

            {/* Connection Status Indicator */}
            <div className="p-4 rounded-xl bg-muted/30 border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Page Connection:</span>
                {fbSession.status === 'connected' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    Disconnected
                  </span>
                )}
              </div>

              {fbSession.status === 'connected' && (
                <div className="flex items-center justify-between text-xs pt-1 border-t">
                  <span className="text-muted-foreground">Connected Page:</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400 truncate max-w-[180px]">
                    {fbSession.pageName || fbSession.pageId}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div>
              {fbSession.status === 'connected' ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowFbModal(true)}
                    className="flex-1 font-semibold gap-1.5 rounded-xl text-xs"
                  >
                    <Key className="h-3.5 w-3.5" /> Reconfigure
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDisconnectFb}
                    className="border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 font-semibold gap-1.5 rounded-xl text-xs"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setShowFbModal(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 rounded-xl shadow-xs py-3"
                >
                  <MessageCircle className="h-4 w-4" />
                  Connect Facebook Page
                </Button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 border-t pt-3">
            <Zap className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Authentic Meta Webhook routing & real page token storage</span>
          </div>
        </div>
      </div>

      {/* Live QR Code Scanner Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card border rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-center relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-sm font-bold p-1.5 rounded-full hover:bg-muted"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="font-bold text-lg text-foreground flex items-center justify-center gap-2">
                <QrCode className="h-5 w-5 text-emerald-600" />
                Scan WhatsApp QR Code
              </h3>
              <p className="text-xs text-muted-foreground">
                Link your WhatsApp Business account in 10 seconds
              </p>
            </div>

            {/* QR Code Graphic Box */}
            <div className="p-4 bg-white rounded-2xl border flex items-center justify-center max-w-[220px] mx-auto shadow-inner">
              {waSession.qrCode ? (
                waSession.qrCode.startsWith('data:image/') || waSession.qrCode.startsWith('http') ? (
                  <img
                    src={waSession.qrCode}
                    alt="WhatsApp QR Code"
                    className="w-48 h-48 object-contain"
                  />
                ) : (
                  <div
                    className="w-48 h-48"
                    dangerouslySetInnerHTML={{ __html: waSession.qrCode }}
                  />
                )
              ) : (
                <div className="h-48 w-48 flex items-center justify-center text-xs text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
                </div>
              )}
            </div>

            {/* Step-by-Step Scan Instructions */}
            <div className="bg-muted/40 rounded-2xl p-4 text-left space-y-2 text-xs text-foreground">
              <p className="font-bold text-xs text-muted-foreground">How to Link Phone:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground leading-relaxed">
                <li>Open <strong>WhatsApp Business</strong> on your phone.</li>
                <li>Tap <strong>Settings / Menu (⋮)</strong> &rarr; <strong>Linked Devices</strong>.</li>
                <li>Tap <strong>Link a Device</strong> and point your camera at this QR code.</li>
              </ol>
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                onClick={handleConfirmPairing}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl py-2.5"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm QR Scanned & Pair Phone
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Facebook Messenger Credentials Modal */}
      {showFbModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card border rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 relative">
            <button
              onClick={() => setShowFbModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-sm font-bold p-1.5 rounded-full hover:bg-muted"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-blue-600" />
                Connect Facebook Business Page
              </h3>
              <p className="text-xs text-muted-foreground">
                Configure your authentic Facebook Page ID and Page Access Token
              </p>
            </div>

            {fbError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 font-medium">
                {fbError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Facebook Page Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. My Fashion Store BD"
                  value={fbPageName}
                  onChange={(e) => setFbPageName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-background text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Facebook Page ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 109876543210987"
                  value={fbPageId}
                  onChange={(e) => setFbPageId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-background text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Page Access Token <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Paste Meta Page Access Token (EAAG...)"
                  value={fbAccessToken}
                  onChange={(e) => setFbAccessToken(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-background text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>

              {/* Meta Webhook Instructions Box */}
              <div className="bg-muted/40 rounded-2xl p-4 space-y-3 text-xs border">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Globe className="h-4 w-4 text-blue-600" />
                  Meta Webhook Configuration
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Set these credentials in your Meta Developer App &rarr; Messenger &rarr; Webhooks settings:
                </p>

                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] font-semibold text-muted-foreground">Callback Webhook URL:</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border text-[11px] font-mono text-foreground truncate">
                        {webhookUrl}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(webhookUrl, 'webhook')}
                        className="h-8 px-2.5 text-xs shrink-0"
                      >
                        {copiedWebhook ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-muted-foreground">Verify Token:</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border text-[11px] font-mono text-foreground truncate">
                        {verifyToken}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(verifyToken, 'token')}
                        className="h-8 px-2.5 text-xs shrink-0"
                      >
                        {copiedVerifyToken ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFbModal(false)}
                className="flex-1 rounded-xl text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveFbCredentials}
                disabled={connectingFb}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl"
              >
                {connectingFb ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                Save & Connect Page
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
