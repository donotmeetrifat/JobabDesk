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
  Hash,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadFacebookSDK, launchMetaEmbeddedSignup } from '@/lib/whatsapp/meta-embedded-signup'

interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'connected'
  qrCode: string
  connectedNumber: string
  pairingCode?: string
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
  const [persistentQr, setPersistentQr] = useState('')

  const [metaAppId, setMetaAppId] = useState('1789555715522515')
  const [metaConfigId, setMetaConfigId] = useState('')

  // WhatsApp Linking 3-Tab state
  const [waTab, setWaTab] = useState<'meta' | 'qr' | 'phone'>('meta')
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('')
  const [waAccessToken, setWaAccessToken] = useState('')
  const [waWabaId, setWaWabaId] = useState('')
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [metaSuccessMsg, setMetaSuccessMsg] = useState('')
  const [metaErrorMsg, setMetaErrorMsg] = useState('')

  const [waPhoneInput, setWaPhoneInput] = useState('')
  const [waPairingCode, setWaPairingCode] = useState('')
  const [loadingCode, setLoadingCode] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  // Whapi Gateway State
  const [whapiApiKey, setWhapiApiKey] = useState('')
  const [whapiInstanceId, setWhapiInstanceId] = useState('')
  const [whapiProvider, setWhapiProvider] = useState<'whapi' | 'evolution'>('whapi')

  // Facebook Messenger Setup Modal state
  const [showFbModal, setShowFbModal] = useState(false)
  const [fbPageName, setFbPageName] = useState('')
  const [fbPageId, setFbPageId] = useState('')
  const [fbAccessToken, setFbAccessToken] = useState('')
  const [fbError, setFbError] = useState('')
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [copiedVerifyToken, setCopiedVerifyToken] = useState(false)
  const [copiedMetaWebhook, setCopiedMetaWebhook] = useState(false)
  const [copiedMetaVerifyToken, setCopiedMetaVerifyToken] = useState(false)

  const metaWebhookUrl = 'https://jobabdesk.vercel.app/api/webhooks/whatsapp'
  const messengerWebhookUrl = 'https://jobabdesk.vercel.app/api/webhooks/messenger'
  const verifyToken = 'jobabdesk_verify_token'

  // Load SDK and statuses
  useEffect(() => {
    const initialAppId = process.env.NEXT_PUBLIC_META_APP_ID || '1789555715522515'
    loadFacebookSDK(initialAppId)
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
      let isMetaConnected = false
      let metaPhone = ''

      const metaRes = await fetch('/api/channels/whatsapp/meta')
      if (metaRes.ok) {
        const metaData = await metaRes.json()
        if (metaData.phoneNumberId) setWaPhoneNumberId(metaData.phoneNumberId)
        if (metaData.accessToken) setWaAccessToken(metaData.accessToken)
        if (metaData.wabaId) setWaWabaId(metaData.wabaId)
        if (metaData.appId) {
          setMetaAppId(metaData.appId)
          loadFacebookSDK(metaData.appId)
        }
        if (metaData.configId) setMetaConfigId(metaData.configId)

        if (metaData.status === 'connected') {
          isMetaConnected = true
          metaPhone = metaData.phoneNumberId || 'Meta Official WABA'
          setWaSession({
            status: 'connected',
            connectedNumber: metaPhone,
            qrCode: '',
          })
        }
      }

      const gwRes = await fetch('/api/channels/whatsapp/gateway')
      if (gwRes.ok) {
        const data: WhatsAppStatus = await gwRes.json()
        setWaSession((prev) => ({
          status: isMetaConnected ? 'connected' : data.status,
          connectedNumber: isMetaConnected ? metaPhone : (data.connectedNumber || prev.connectedNumber),
          qrCode: data.qrCode || prev.qrCode,
          pairingCode: data.pairingCode || prev.pairingCode,
        }))
        if (data.qrCode) {
          setPersistentQr(data.qrCode)
        }
        if (isMetaConnected || data.status === 'connected') {
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

  async function handleMetaEmbeddedSignup() {
    setMetaErrorMsg('')
    setMetaSuccessMsg('')

    const activeAppId = metaAppId || process.env.NEXT_PUBLIC_META_APP_ID || '1789555715522515'
    const activeConfigId = metaConfigId || process.env.NEXT_PUBLIC_META_CONFIG_ID || ''

    setSavingMeta(true)

    launchMetaEmbeddedSignup({
      appId: activeAppId,
      configId: activeConfigId,
      onSuccess: async (result: { phoneNumberId?: string; wabaId?: string; code?: string; accessToken?: string }) => {
        try {
          const res = await fetch('/api/channels/whatsapp/embedded-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
          })
          const data = await res.json()
          if (res.ok && data.success) {
            setWaSession((prev) => ({
              ...prev,
              status: 'connected',
              connectedNumber: result.phoneNumberId || 'Meta Official WABA',
            }))
            if (result.phoneNumberId) setWaPhoneNumberId(result.phoneNumberId)
            if (result.wabaId) setWaWabaId(result.wabaId)
            setMetaSuccessMsg('Successfully connected WhatsApp with Facebook Meta WABA!')
            setTimeout(() => setMetaSuccessMsg(''), 5000)
            setShowQrModal(false)
          } else {
            setMetaErrorMsg(data.error || 'Failed to complete Meta Embedded Signup.')
            setShowQrModal(true)
            setWaTab('meta')
          }
        } catch (err: any) {
          setMetaErrorMsg(err?.message || 'Error exchanging Meta credentials.')
          setShowQrModal(true)
          setWaTab('meta')
        } finally {
          setSavingMeta(false)
        }
      },
      onError: (err: string) => {
        setMetaErrorMsg(err)
        setSavingMeta(false)
        setShowQrModal(true)
        setWaTab('meta')
      },
    })
  }

  async function handleSaveMetaCredentials() {
    setMetaErrorMsg('')
    setMetaSuccessMsg('')

    if (!waPhoneNumberId.trim() || !waAccessToken.trim()) {
      setMetaErrorMsg('Phone Number ID and Permanent Access Token are required.')
      return
    }

    setSavingMeta(true)
    try {
      const res = await fetch('/api/channels/whatsapp/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: waPhoneNumberId.trim(),
          accessToken: waAccessToken.trim(),
          wabaId: waWabaId.trim(),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.status === 'connected') {
          setWaSession((prev) => ({
            ...prev,
            status: 'connected',
            connectedNumber: waPhoneNumberId.trim(),
          }))
          setMetaSuccessMsg('Meta WhatsApp Cloud API credentials saved successfully!')
          setTimeout(() => setMetaSuccessMsg(''), 4000)
          setShowQrModal(false)
        } else {
          setMetaErrorMsg('Failed to save Meta WhatsApp credentials.')
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        setMetaErrorMsg(errData.error || 'Failed to save Meta WhatsApp credentials.')
      }
    } catch {
      setMetaErrorMsg('Network error while saving Meta WhatsApp credentials.')
    } finally {
      setSavingMeta(false)
    }
  }

  async function handleGenerateQr() {
    setGeneratingQr(true)
    setShowQrModal(true)
    setWaTab('qr')
    try {
      const res = await fetch('/api/channels/whatsapp/gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: whapiApiKey.trim(),
          instanceId: whapiInstanceId.trim(),
          provider: whapiProvider,
        }),
      })
      if (res.ok) {
        const data: WhatsAppStatus = await res.json()
        setWaSession(data)
        if (data.qrCode) {
          setPersistentQr(data.qrCode)
        }
      }
    } catch {
      // quiet catch
    } finally {
      setGeneratingQr(false)
    }
  }

  async function handleGeneratePairingCode() {
    if (!waPhoneInput.trim()) return
    setLoadingCode(true)
    try {
      const res = await fetch('/api/channels/whatsapp/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pairing_code',
          phoneNumber: waPhoneInput.trim(),
        }),
      })
      if (res.ok) {
        const data: WhatsAppStatus = await res.json()
        setWaSession(data)
        if (data.pairingCode) {
          setWaPairingCode(data.pairingCode)
        }
      }
    } catch {
      // quiet catch
    } finally {
      setLoadingCode(false)
    }
  }

  async function handleConfirmPairing() {
    try {
      const res = await fetch('/api/channels/whatsapp/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_pairing' }),
      })
      if (res.ok) {
        const data: WhatsAppStatus = await res.json()
        setWaSession(data)
        if (data.status === 'connected') {
          setShowQrModal(false)
        }
      }
    } catch {
      // quiet catch
    }
  }

  async function handleDisconnectWa() {
    try {
      await fetch('/api/channels/whatsapp/gateway', { method: 'DELETE' })
      setWaSession({ status: 'disconnected', qrCode: '', connectedNumber: '' })
      setPersistentQr('')
      setWaPhoneNumberId('')
      setWaAccessToken('')
      setWaWabaId('')
    } catch {
      // quiet catch
    }
  }

  const [fbPagesList, setFbPagesList] = useState<Array<{ id: string; name: string; accessToken: string; category?: string; picture?: string }>>([])
  const [fetchingFbPages, setFetchingFbPages] = useState(false)
  const [showManualFbInput, setShowManualFbInput] = useState(false)

  function handle1ClickFbConnect() {
    setFbError('')
    setFetchingFbPages(true)

    const appId = metaAppId || process.env.NEXT_PUBLIC_META_APP_ID || '1789555715522515'
    const redirectUri = window.location.origin + '/api/channels/messenger/pages'

    const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(
      appId
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=pages_messaging,pages_show_list,pages_read_engagement,pages_manage_metadata&response_type=code`

    let handled = false
    const safeStopFetching = () => {
      if (!handled) {
        handled = true
        setFetchingFbPages(false)
      }
    }

    const timer = setTimeout(() => {
      safeStopFetching()
      setFbError('Login timed out or popup was closed. Please check popups or try again.')
    }, 30000)

    const messageHandler = async (event: MessageEvent) => {
      if (event.data?.type === 'FB_PAGE_CONNECT') {
        clearTimeout(timer)
        window.removeEventListener('message', messageHandler)

        if (event.data.event === 'FINISH' && event.data.code) {
          try {
            const res = await fetch('/api/channels/messenger/pages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: event.data.code }),
            })
            const data = await res.json()
            if (res.ok && data.pages && data.pages.length > 0) {
              setFbPagesList(data.pages)
            } else {
              setFbError(data.error || 'No Facebook Pages found. Make sure you are an Admin of a Facebook Page.')
            }
          } catch (err: any) {
            setFbError(err?.message || 'Error fetching Facebook Pages.')
          } finally {
            safeStopFetching()
          }
        } else {
          setFbError(event.data.error || 'Facebook Login was cancelled.')
          safeStopFetching()
        }
      }
    }

    window.addEventListener('message', messageHandler)

    // Synchronous popup execution to bypass browser popup blockers
    const popup = window.open(oauthUrl, 'FBPagesPopup', 'width=600,height=750,scrollbars=yes,resizable=yes')

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      clearTimeout(timer)
      window.removeEventListener('message', messageHandler)
      safeStopFetching()
      setFbError('Browser blocked the popup window! Please click the popup icon 🚫 in your browser address bar to allow popups.')
    }
  }

  async function handleSelectFbPage(page: { id: string; name: string; accessToken: string }) {
    setConnectingFb(true)
    setFbError('')
    try {
      const res = await fetch('/api/channels/messenger/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: page.id,
          accessToken: page.accessToken,
          pageName: page.name,
        }),
      })

      if (res.ok) {
        setFbSession({
          status: 'connected',
          pageId: page.id,
          pageName: page.name,
        })
        setShowFbModal(false)
      } else {
        const errData = await res.json().catch(() => ({}))
        setFbError(errData.error || 'Failed to connect Facebook Page.')
      }
    } catch {
      setFbError('Network error while connecting Facebook Page.')
    } finally {
      setConnectingFb(false)
    }
  }

  async function handleSaveFbCredentials() {
    setFbError('')
    if (!fbPageId.trim() || !fbAccessToken.trim()) {
      setFbError('Page ID and Page Access Token are required.')
      return
    }

    setConnectingFb(true)
    try {
      const res = await fetch('/api/channels/messenger/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: fbPageId.trim(),
          accessToken: fbAccessToken.trim(),
          pageName: fbPageName.trim(),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setFbSession({
          status: 'connected',
          pageId: data.settings?.messenger_page_id || fbPageId.trim(),
          pageName: data.settings?.messenger_page_name || fbPageName.trim() || 'Connected Page',
        })
        setShowFbModal(false)
      } else {
        const errData = await res.json().catch(() => ({}))
        setFbError(errData.error || 'Failed to save Facebook credentials.')
      }
    } catch {
      setFbError('Network error while saving Facebook credentials.')
    } finally {
      setConnectingFb(false)
    }
  }

  async function handleDisconnectFb() {
    try {
      await fetch('/api/channels/messenger/connect', { method: 'DELETE' })
      setFbSession({ status: 'disconnected', pageId: '', pageName: '' })
      setFbPageId('')
      setFbAccessToken('')
      setFbPageName('')
    } catch {
      // quiet catch
    }
  }

  function handleCopy(text: string, type: 'webhook' | 'token' | 'code' | 'meta_webhook' | 'meta_token') {
    navigator.clipboard.writeText(text)
    if (type === 'webhook') {
      setCopiedWebhook(true)
      setTimeout(() => setCopiedWebhook(false), 2000)
    } else if (type === 'token') {
      setCopiedVerifyToken(true)
      setTimeout(() => setCopiedVerifyToken(false), 2000)
    } else if (type === 'code') {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } else if (type === 'meta_webhook') {
      setCopiedMetaWebhook(true)
      setTimeout(() => setCopiedMetaWebhook(false), 2000)
    } else if (type === 'meta_token') {
      setCopiedMetaVerifyToken(true)
      setTimeout(() => setCopiedMetaVerifyToken(false), 2000)
    }
  }

  const activeQrSvg = persistentQr || waSession.qrCode

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: WhatsApp Customer Support */}
        <div className="rounded-2xl border bg-card p-6 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                    WhatsApp Integration
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Connect Meta Official Cloud API, QR Code, or 8-digit Phone Code
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
                    Connected (Meta Official WABA)
                  </span>
                ) : waSession.status === 'connecting' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                    Waiting for Connection...
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
                  <span className="text-muted-foreground">Connected ID / Phone:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {waSession.connectedNumber || waPhoneNumberId || '+88017XXXXXXXX'}
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
                  <LogOut className="h-4 w-4" /> Disconnect WhatsApp
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      setWaTab('meta')
                      setShowQrModal(true)
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 rounded-xl shadow-sm py-3.5 text-sm"
                  >
                    <ShieldCheck className="h-5 w-5" />
                    Connect Meta Official WhatsApp Cloud API
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    100% Free & Stable. Each shop gets 1,000 free monthly conversations directly from Meta.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setWaTab('qr')
                      setShowQrModal(true)
                    }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground pt-1"
                  >
                    Or scan QR Code / 8-Digit Phone Pairing Code
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 border-t pt-3">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Meta Official WhatsApp Cloud API & 0% Ban Anti-Spam Safeguards</span>
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

      {/* 3-Tab WhatsApp Setup & Pairing Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card border rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-sm font-bold p-1.5 rounded-full hover:bg-muted"
            >
              ✕
            </button>

            <div className="space-y-1 text-center">
              <h3 className="font-bold text-lg text-foreground flex items-center justify-center gap-2">
                <Smartphone className="h-5 w-5 text-emerald-600" />
                Configure WhatsApp Business Connection
              </h3>
              <p className="text-xs text-muted-foreground">
                Select your preferred WhatsApp pairing method
              </p>
            </div>

            {/* 3 Tab Navigation Switcher */}
            <div className="flex rounded-xl bg-muted p-1 gap-1 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setWaTab('meta')}
                className={`flex-1 py-2 px-1 rounded-lg transition-all flex items-center justify-center gap-1 ${
                  waTab === 'meta'
                    ? 'bg-card text-emerald-600 dark:text-emerald-400 shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Meta Cloud API
              </button>
              <button
                type="button"
                onClick={() => setWaTab('qr')}
                className={`flex-1 py-2 px-1 rounded-lg transition-all flex items-center justify-center gap-1 ${
                  waTab === 'qr'
                    ? 'bg-card text-emerald-600 dark:text-emerald-400 shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <QrCode className="h-3.5 w-3.5 shrink-0" /> Scan QR Code
              </button>
              <button
                type="button"
                onClick={() => setWaTab('phone')}
                className={`flex-1 py-2 px-1 rounded-lg transition-all flex items-center justify-center gap-1 ${
                  waTab === 'phone'
                    ? 'bg-card text-emerald-600 dark:text-emerald-400 shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Hash className="h-3.5 w-3.5 shrink-0" /> 8-Digit Code
              </button>
            </div>

            {/* Tab 1: Meta Official WhatsApp Cloud API */}
            {waTab === 'meta' && (
              <div className="space-y-4 animate-in fade-in text-left">
                {metaSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> {metaSuccessMsg}
                  </div>
                )}
                {metaErrorMsg && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 font-medium">
                    {metaErrorMsg}
                  </div>
                )}

                {/* Meta Official Cloud API Header */}
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                  <h4 className="font-bold text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> Meta Official Cloud API Credentials
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Paste your Phone Number ID and Access Token from Meta Developer Console. 100% Free & Stable.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Phone Number ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 109876543210987"
                      value={waPhoneNumberId}
                      onChange={(e) => setWaPhoneNumberId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border bg-background text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Permanent Access Token <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showAccessToken ? 'text' : 'password'}
                        placeholder="Paste Meta Permanent Access Token (EAAG...)"
                        value={waAccessToken}
                        onChange={(e) => setWaAccessToken(e.target.value)}
                        className="w-full px-3 py-2 pr-10 rounded-xl border bg-background text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccessToken(!showAccessToken)}
                        className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      WhatsApp Business Account ID (Optional WABA ID)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 100200300400500"
                      value={waWabaId}
                      onChange={(e) => setWaWabaId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border bg-background text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  {/* Meta Webhook Box */}
                  <div className="bg-muted/40 rounded-2xl p-4 space-y-3 text-xs border">
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <Globe className="h-4 w-4 text-emerald-600" />
                      Meta Webhook Configuration
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Set these values in Meta Developer Console &rr; WhatsApp &rr; Configuration:
                    </p>

                    <div className="space-y-2">
                      <div>
                        <span className="text-[11px] font-semibold text-muted-foreground">Callback Webhook URL:</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border text-[11px] font-mono text-foreground truncate">
                            {metaWebhookUrl}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(metaWebhookUrl, 'meta_webhook')}
                            className="h-8 px-2.5 text-xs shrink-0"
                          >
                            {copiedMetaWebhook ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
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
                            onClick={() => handleCopy(verifyToken, 'meta_token')}
                            className="h-8 px-2.5 text-xs shrink-0"
                          >
                            {copiedMetaVerifyToken ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground pt-1">
                        Subscribed Webhook Fields: <code className="font-mono text-emerald-600 font-bold">messages</code>
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleSaveMetaCredentials}
                  disabled={savingMeta}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl py-2.5"
                >
                  {savingMeta ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  )}
                  Save Meta WhatsApp Credentials
                </Button>
              </div>
            )}

            {/* Tab 2: Scan QR Code */}
            {waTab === 'qr' && (
              <div className="space-y-4 animate-in fade-in text-center">
                <div className="p-4 bg-white rounded-2xl border flex items-center justify-center max-w-[220px] mx-auto shadow-inner">
                  {activeQrSvg ? (
                    activeQrSvg.startsWith('data:image/') || activeQrSvg.startsWith('http') ? (
                      <img
                        src={activeQrSvg}
                        alt="WhatsApp High-Density QR Code"
                        className="w-48 h-48 object-contain"
                      />
                    ) : (
                      <div
                        className="w-48 h-48"
                        dangerouslySetInnerHTML={{ __html: activeQrSvg }}
                      />
                    )
                  ) : (
                    <div className="h-48 w-48 flex items-center justify-center text-xs text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
                    </div>
                  )}
                </div>

                <div className="bg-muted/40 rounded-2xl p-4 text-left space-y-2 text-xs text-foreground">
                  <p className="font-bold text-xs text-muted-foreground">How to Link via QR:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground leading-relaxed">
                    <li>Open <strong>WhatsApp Business</strong> on your phone.</li>
                    <li>Tap <strong>Settings / Menu (⋮)</strong> &rr; <strong>Linked Devices</strong>.</li>
                    <li>Tap <strong>Link a Device</strong> and scan this QR code.</li>
                  </ol>
                </div>

                <Button
                  onClick={handleConfirmPairing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl py-2.5"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm QR Scanned & Link
                </Button>
              </div>
            )}

            {/* Tab 3: Link with Phone Number */}
            {waTab === 'phone' && (
              <div className="space-y-4 text-left animate-in fade-in">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Enter WhatsApp Phone Number
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="017XXXXXXXX"
                      value={waPhoneInput}
                      onChange={(e) => setWaPhoneInput(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border bg-background text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <Button
                      type="button"
                      onClick={handleGeneratePairingCode}
                      disabled={loadingCode || !waPhoneInput.trim()}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl px-3"
                    >
                      {loadingCode ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Get Code'}
                    </Button>
                  </div>
                </div>

                {waPairingCode && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Your Official 8-Digit Pairing Code:
                    </span>
                    <div className="flex items-center justify-center gap-3">
                      <code className="text-2xl font-mono font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                        {waPairingCode}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(waPairingCode, 'code')}
                        className="h-8 px-2.5 text-xs rounded-lg"
                      >
                        {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="bg-muted/40 rounded-2xl p-4 space-y-2 text-xs text-foreground border">
                  <p className="font-bold text-xs text-muted-foreground">How to Link with Phone Code:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground leading-relaxed text-[11px]">
                    <li>Open <strong>WhatsApp Business</strong> on your phone.</li>
                    <li>Tap <strong>Settings / Menu (⋮)</strong> &rr; <strong>Linked Devices</strong>.</li>
                    <li>Tap <strong>Link a Device</strong> &rr; Select <strong>Link with Phone Number instead</strong>.</li>
                    <li>Enter the 8-digit pairing code generated above.</li>
                  </ol>
                </div>

                <Button
                  onClick={handleConfirmPairing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl py-2.5"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm Code Entered & Link Phone
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Facebook Messenger Credentials Modal */}
      {showFbModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card border rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
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
                Connect your Facebook Page automatically in 1-Click or configure manually
              </p>
            </div>

            {fbError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 font-medium">
                {fbError}
              </div>
            )}

            {/* 1-Click Facebook Login Banner */}
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-3">
              <h4 className="font-bold text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-blue-600" /> Recommended 1-Click Facebook Connect
              </h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Log in with Facebook to automatically list and select your Facebook Business Pages.
              </p>
              <Button
                type="button"
                onClick={handle1ClickFbConnect}
                disabled={fetchingFbPages}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl py-2.5 gap-2"
              >
                {fetchingFbPages ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                Log in & Select Facebook Page
              </Button>
            </div>

            {/* Facebook Pages Picker List */}
            {fbPagesList.length > 0 && (
              <div className="space-y-2.5 border-t pt-3">
                <h4 className="text-xs font-bold text-foreground">Select a Facebook Page to Connect:</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {fbPagesList.map((page) => (
                    <div
                      key={page.id}
                      className="p-3 rounded-xl border bg-muted/30 flex items-center justify-between gap-3 hover:border-blue-500 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {page.picture ? (
                          <img src={page.picture} alt={page.name} className="h-8 w-8 rounded-full shrink-0 border" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                            {page.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-foreground truncate">{page.name}</p>
                          <p className="text-[10px] text-muted-foreground">ID: {page.id}</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSelectFbPage(page)}
                        disabled={connectingFb}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg px-3 h-8 shrink-0"
                      >
                        {connectingFb ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Connect Page'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-muted"></div>
              <button
                type="button"
                onClick={() => setShowManualFbInput(!showManualFbInput)}
                className="flex-shrink mx-3 text-[10px] uppercase font-bold text-muted-foreground hover:text-foreground tracking-wider underline cursor-pointer"
              >
                {showManualFbInput ? 'Hide Manual Settings' : 'Or Manual Setup (Page ID & Access Token)'}
              </button>
              <div className="flex-grow border-t border-muted"></div>
            </div>

            {showManualFbInput && (
              <div className="space-y-4 animate-in fade-in">
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
                    Set these credentials in your Meta Developer App &rr; Messenger &rr; Webhooks settings:
                  </p>

                  <div className="space-y-2">
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground">Callback Webhook URL:</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border text-[11px] font-mono text-foreground truncate">
                          {messengerWebhookUrl}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopy(messengerWebhookUrl, 'webhook')}
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

                <Button
                  type="button"
                  onClick={handleSaveFbCredentials}
                  disabled={connectingFb}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl py-2.5"
                >
                  {connectingFb ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  )}
                  Save & Connect Page Manually
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
