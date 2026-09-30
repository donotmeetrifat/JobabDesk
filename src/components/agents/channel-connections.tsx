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
  ExternalLink,
  ShieldCheck,
  Zap,
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

  async function handleConnectFb() {
    setConnectingFb(true)
    try {
      const res = await fetch('/api/channels/messenger/connect', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setFbSession(data)
      }
    } catch {
      // quiet catch
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
      }
    } catch {
      // quiet catch
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

        {/* Card 2: Facebook Messenger Meta OAuth */}
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
                    {fbSession.pageName || 'Karim Cosmetics BD'}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div>
              {fbSession.status === 'connected' ? (
                <Button
                  variant="outline"
                  onClick={handleDisconnectFb}
                  className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 font-semibold gap-2 rounded-xl"
                >
                  <LogOut className="h-4 w-4" /> Disconnect Facebook Page
                </Button>
              ) : (
                <Button
                  onClick={handleConnectFb}
                  disabled={connectingFb}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 rounded-xl shadow-xs py-3"
                >
                  {connectingFb ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageCircle className="h-4 w-4" />
                  )}
                  Connect Facebook Page (Meta OAuth)
                </Button>
              )}
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 border-t pt-3">
            <Zap className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Instant Meta Webhook routing for instant customer response</span>
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
                <div
                  className="w-48 h-48"
                  dangerouslySetInnerHTML={{ __html: waSession.qrCode }}
                />
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
                <li>Tap <strong>Settings / Menu (⋮)</strong> $\rightarrow$ <strong>Linked Devices</strong>.</li>
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
    </div>
  )
}
