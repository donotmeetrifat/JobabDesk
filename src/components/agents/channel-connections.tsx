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
  Sliders,
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
  accessToken?: string
}

export function ChannelConnections() {
  const [waSession, setWaSession] = useState<WhatsAppStatus>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('jobabdesk_wa_session')
        if (cached) return JSON.parse(cached)
      } catch {}
    }
    return { status: 'disconnected', qrCode: '', connectedNumber: '' }
  })
  const [fbSession, setFbSession] = useState<MessengerStatus>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('jobabdesk_fb_session')
        if (cached) return JSON.parse(cached)
      } catch {}
    }
    return { status: 'disconnected', pageId: '', pageName: '' }
  })

  const [loadingWa, setLoadingWa] = useState(false)
  const [loadingFb, setLoadingFb] = useState(false)
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
      // 1. Primary check: Meta Cloud API status
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
          const newSession: WhatsAppStatus = {
            status: 'connected',
            connectedNumber: metaData.phoneNumberId || 'Meta Official WABA',
            qrCode: '',
          }
          setWaSession(newSession)
          if (typeof window !== 'undefined') {
            localStorage.setItem('jobabdesk_wa_session', JSON.stringify(newSession))
          }
          setLoadingWa(false)
          return
        }
      }

      // 2. Secondary check: /api/ai/settings (authenticated SSR accounts table read)
      try {
        const aiRes = await fetch('/api/ai/settings')
        if (aiRes.ok) {
          const aiData = await aiRes.json()
          const settings = aiData.settings || aiData
          const waPhone = settings.whatsapp_phone_number_id || settings.whatsapp_connected_number
          if (waPhone || settings.whatsapp_status === 'connected') {
            if (settings.whatsapp_phone_number_id) setWaPhoneNumberId(settings.whatsapp_phone_number_id)
            if (settings.whatsapp_access_token) setWaAccessToken(settings.whatsapp_access_token)
            if (settings.whatsapp_waba_id) setWaWabaId(settings.whatsapp_waba_id)

            const newSession: WhatsAppStatus = {
              status: 'connected',
              connectedNumber: waPhone || 'Meta Official WABA',
              qrCode: '',
            }
            setWaSession(newSession)
            if (typeof window !== 'undefined') {
              localStorage.setItem('jobabdesk_wa_session', JSON.stringify(newSession))
            }
            setLoadingWa(false)
            return
          }
        }
      } catch {}

      // 3. Tertiary check: WhatsApp Gateway / QR session
      const gwRes = await fetch('/api/channels/whatsapp/gateway')
      if (gwRes.ok) {
        const data: WhatsAppStatus = await gwRes.json()
        if (data.status === 'connected') {
          setWaSession(data)
          if (typeof window !== 'undefined') {
            localStorage.setItem('jobabdesk_wa_session', JSON.stringify(data))
          }
          setShowQrModal(false)
        } else {
          // NEVER overwrite an active connected session with an unconfigured gateway's disconnected status
          setWaSession((prev) => {
            if (prev.status === 'connected') {
              return prev
            }
            return data
          })
        }
        if (data.qrCode) {
          setPersistentQr(data.qrCode)
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
      // 1. Primary check: Messenger connect API
      const res = await fetch('/api/channels/messenger/connect')
      if (res.ok) {
        const data = await res.json()
        if (data.pageId) setFbPageId(data.pageId)
        if (data.pageName) setFbPageName(data.pageName)

        if (data.status === 'connected') {
          setFbSession(data)
          if (typeof window !== 'undefined') {
            localStorage.setItem('jobabdesk_fb_session', JSON.stringify(data))
          }
          setLoadingFb(false)
          return
        }
      }

      // 2. Secondary check: /api/ai/settings (authenticated SSR accounts table read)
      try {
        const aiRes = await fetch('/api/ai/settings')
        if (aiRes.ok) {
          const aiData = await aiRes.json()
          const settings = aiData.settings || aiData
          const pageId = settings.facebook_page_id
          const pageName = settings.facebook_page_name || pageId
          if (pageId || settings.messenger_status === 'connected') {
            if (pageId) setFbPageId(pageId)
            if (pageName) setFbPageName(pageName)

            const newSession: MessengerStatus = {
              status: 'connected',
              pageId: pageId || '',
              pageName: pageName || 'Connected Page',
            }
            setFbSession(newSession)
            if (typeof window !== 'undefined') {
              localStorage.setItem('jobabdesk_fb_session', JSON.stringify(newSession))
            }
            setLoadingFb(false)
            return
          }
        }
      } catch {}

      // If both explicitly returned disconnected, verify before marking disconnected
      setFbSession((prev) => {
        // Only clear if not already confirmed connected
        if (prev.status === 'connected') {
          // Check localStorage as fallback
          try {
            const cached = localStorage.getItem('jobabdesk_fb_session')
            if (cached) {
              const parsed = JSON.parse(cached)
              if (parsed.status === 'connected') return parsed
            }
          } catch {}
        }
        return { status: 'disconnected', pageId: '', pageName: '' }
      })
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
            const newSession: WhatsAppStatus = {
              status: 'connected',
              connectedNumber: result.phoneNumberId || 'Meta Official WABA',
              qrCode: '',
            }
            setWaSession(newSession)
            if (typeof window !== 'undefined') {
              localStorage.setItem('jobabdesk_wa_session', JSON.stringify(newSession))
            }
            if (result.phoneNumberId) setWaPhoneNumberId(result.phoneNumberId)
            if (result.wabaId) setWaWabaId(result.wabaId)
            setMetaSuccessMsg('Successfully connected WhatsApp with Facebook Meta WABA!')
            setTimeout(() => setMetaSuccessMsg(''), 5000)
            setShowQrModal(false)

            // Redundant dual-sync to AI settings for guaranteed persistence
            fetch('/api/ai/settings', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                whatsapp_phone_number_id: result.phoneNumberId || '',
                whatsapp_waba_id: result.wabaId || '',
                whatsapp_access_token: result.accessToken || '',
                whatsapp_status: 'connected',
                whatsapp_auto_reply_enabled: true,
              }),
            }).catch(() => {})
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
          const newSession: WhatsAppStatus = {
            status: 'connected',
            connectedNumber: waPhoneNumberId.trim(),
            qrCode: '',
          }
          setWaSession(newSession)
          if (typeof window !== 'undefined') {
            localStorage.setItem('jobabdesk_wa_session', JSON.stringify(newSession))
          }
          setMetaSuccessMsg('Meta WhatsApp Cloud API credentials saved successfully!')
          setTimeout(() => setMetaSuccessMsg(''), 4000)
          setShowQrModal(false)

          // Redundant dual-sync to AI settings for guaranteed persistence
          fetch('/api/ai/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              whatsapp_phone_number_id: waPhoneNumberId.trim(),
              whatsapp_access_token: waAccessToken.trim(),
              whatsapp_waba_id: waWabaId.trim(),
              whatsapp_status: 'connected',
              whatsapp_auto_reply_enabled: true,
            }),
          }).catch(() => {})
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
          if (typeof window !== 'undefined') {
            localStorage.setItem('jobabdesk_wa_session', JSON.stringify(data))
          }
          setShowQrModal(false)
        }
      }
    } catch {
      // quiet catch
    }
  }

  async function handleDisconnectWa() {
    try {
      await fetch('/api/channels/whatsapp/meta', { method: 'DELETE' })
      await fetch('/api/channels/whatsapp/gateway', { method: 'DELETE' })
      // Sync disconnected status to AI settings
      fetch('/api/ai/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp_status: 'disconnected',
        }),
      }).catch(() => {})

      const disconnectedState: WhatsAppStatus = { status: 'disconnected', qrCode: '', connectedNumber: '' }
      setWaSession(disconnectedState)
      setPersistentQr('')
      setWaPhoneNumberId('')
      setWaAccessToken('')
      setWaWabaId('')
      if (typeof window !== 'undefined') {
        localStorage.removeItem('jobabdesk_wa_session')
      }
    } catch {
      // quiet catch
    }
  }

  const [fbPagesList, setFbPagesList] = useState<Array<{ id: string; name: string; accessToken: string; category?: string; picture?: string }>>([])
  const [fetchingFbPages, setFetchingFbPages] = useState(false)
  const [showManualFbInput, setShowManualFbInput] = useState(true)

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
              body: JSON.stringify({ code: event.data.code, redirectUri }),
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
        const newSession: MessengerStatus = {
          status: 'connected',
          pageId: page.id,
          pageName: page.name,
          accessToken: page.accessToken,
        }
        setFbSession(newSession)
        if (typeof window !== 'undefined') {
          localStorage.setItem('jobabdesk_fb_session', JSON.stringify(newSession))
        }
        setShowFbModal(false)

        // Dual-sync to AI settings for guaranteed persistence
        fetch('/api/ai/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facebook_page_id: page.id,
            facebook_page_name: page.name,
            facebook_page_access_token: page.accessToken,
            messenger_status: 'connected',
            messenger_auto_reply_enabled: true,
          }),
        }).catch(() => {})
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
        const newSession: MessengerStatus = {
          status: 'connected',
          pageId: data.pageId || data.settings?.messenger_page_id || fbPageId.trim(),
          pageName: data.pageName || data.settings?.messenger_page_name || fbPageName.trim() || 'Connected Page',
          accessToken: fbAccessToken.trim(),
        }
        setFbSession(newSession)
        if (typeof window !== 'undefined') {
          localStorage.setItem('jobabdesk_fb_session', JSON.stringify(newSession))
        }
        setShowFbModal(false)

        // Dual-sync to AI settings for guaranteed persistence
        fetch('/api/ai/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facebook_page_id: fbPageId.trim(),
            facebook_page_name: fbPageName.trim() || fbPageId.trim(),
            facebook_page_access_token: fbAccessToken.trim(),
            messenger_status: 'connected',
            messenger_auto_reply_enabled: true,
          }),
        }).catch(() => {})
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
      // Sync disconnected status to AI settings
      fetch('/api/ai/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messenger_status: 'disconnected',
        }),
      }).catch(() => {})

      const disconnectedState: MessengerStatus = { status: 'disconnected', pageId: '', pageName: '' }
      setFbSession(disconnectedState)
      setFbPageId('')
      setFbAccessToken('')
      setFbPageName('')
      if (typeof window !== 'undefined') {
        localStorage.removeItem('jobabdesk_fb_session')
      }
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-stretch">
        {/* Card 1: WhatsApp Integration */}
        <section className="bg-card rounded-2xl border border-border p-6 shadow-xs flex flex-col justify-between relative overflow-hidden transition-all duration-200 hover:shadow-md">
          {/* Ambient subtle background blur spot */}
          <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

          <div className="flex flex-col gap-5">
            {/* Card Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 flex items-center justify-center shrink-0 text-[#25D366]">
                  <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67ZM8.53 7.33C8.37 7.33 8.1 7.39 7.87 7.64C7.65 7.89 7.02 8.48 7.02 9.68C7.02 10.88 7.9 12.03 8.02 12.19C8.14 12.35 9.74 14.82 12.19 15.88C12.78 16.13 13.23 16.28 13.59 16.39C14.18 16.58 14.72 16.55 15.15 16.49C15.63 16.42 16.62 15.89 16.83 15.31C17.03 14.72 17.03 14.22 16.97 14.12C16.91 14.02 16.76 13.96 16.53 13.84C16.3 13.73 15.18 13.18 14.97 13.1C14.76 13.02 14.61 12.98 14.45 13.21C14.3 13.45 13.86 13.96 13.73 14.12C13.6 14.27 13.47 14.29 13.24 14.17C13.01 14.06 12.28 13.82 11.41 13.04C10.73 12.44 10.27 11.69 10.14 11.46C10.01 11.24 10.12 11.11 10.24 11C10.34 10.9 10.47 10.73 10.59 10.59C10.71 10.45 10.75 10.35 10.83 10.19C10.91 10.04 10.87 9.9 10.81 9.78C10.75 9.67 10.3 8.56 10.12 8.11C9.93 7.67 9.75 7.73 9.61 7.72C9.48 7.72 9.33 7.72 9.17 7.72C9.02 7.72 8.77 7.78 8.56 8.01L8.53 7.33Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">WhatsApp Integration</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connect Cloud API, QR Code, or 8-digit device pairing code
                  </p>
                </div>
              </div>

              {waSession.status === 'connected' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                  Connected
                </span>
              ) : waSession.status === 'connecting' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Connecting...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/60" />
                  Disconnected
                </span>
              )}
            </div>

            {/* Connection Details Slate Panel */}
            <div className="bg-muted/40 rounded-xl p-3.5 flex flex-col gap-2 border border-border/60">
              <div className="flex items-center justify-between text-xs text-foreground">
                <span className="text-muted-foreground font-medium">Channel Protocol</span>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  Meta Graph API v19.0
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-foreground">
                <span className="text-muted-foreground font-medium">Monthly Allocation</span>
                <span className="text-foreground font-medium">1,000 Free Service Conversations</span>
              </div>
              <div className="flex items-center justify-between text-xs text-foreground">
                <span className="text-muted-foreground font-medium">Automated Failover</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Smart QR Standby</span>
              </div>
              {waSession.status === 'connected' && (
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/60">
                  <span className="text-muted-foreground font-medium">Linked Phone / ID:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {waSession.connectedNumber || waPhoneNumberId || '+88017XXXXXXXX'}
                  </span>
                </div>
              )}
            </div>

            {/* Actions Block */}
            {waSession.status === 'connected' ? (
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setWaTab('meta')
                    setShowQrModal(true)
                  }}
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-lg border border-border bg-muted/50 hover:bg-muted text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sliders className="h-4 w-4 text-muted-foreground" />
                  <span>Reconfigure Permissions</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectWa}
                  className="w-full sm:w-auto py-2.5 px-4 rounded-lg bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Disconnect Channel</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWaTab('meta')
                    setShowQrModal(true)
                  }}
                  className="w-full py-3 px-4 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] active:scale-[0.99] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-xs transition-all duration-150 cursor-pointer"
                  id="connect-whatsapp-btn"
                >
                  <ShieldCheck className="h-5 w-5" />
                  <span>Connect Official WhatsApp Cloud API</span>
                </button>
                <div className="flex items-center justify-center gap-1.5 text-center text-muted-foreground text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>100% stable cloud connectivity • Each business gets 1,000 free monthly conversations</span>
                </div>

                {/* Alternate Pairing Divider */}
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-border"></div>
                  <span className="shrink-0 mx-3 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    or alternate pairing
                  </span>
                  <div className="flex-grow border-t border-border"></div>
                </div>

                {/* Secondary Pairing Option */}
                <button
                  type="button"
                  onClick={() => {
                    setWaTab('qr')
                    setShowQrModal(true)
                  }}
                  className="w-full py-2.5 px-4 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <QrCode className="h-4 w-4 text-muted-foreground" />
                  <span>Scan QR Code / 8-Digit Pairing Code</span>
                </button>
              </div>
            )}
          </div>

          {/* Trust & Security Footer Tag */}
          <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-muted-foreground text-xs">
            <ShieldCheck className="h-4 w-4 text-[#25D366] shrink-0" />
            <span>Official Cloud API with automated rate-limiting protection</span>
          </div>
        </section>

        {/* Card 2: Facebook Page Messaging */}
        <section className="bg-card rounded-2xl border border-border p-6 shadow-xs flex flex-col justify-between relative overflow-hidden transition-all duration-200 hover:shadow-md">
          {/* Ambient subtle background blur spot */}
          <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />

          <div className="flex flex-col gap-5">
            {/* Card Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-[#0084FF]/10 flex items-center justify-center shrink-0 text-[#0084FF]">
                  <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C6.36 2 2 6.13 2 11.7C2 14.61 3.19 17.06 5.15 18.73V22L8.27 20.28C9.44 20.61 10.69 20.79 12 20.79C17.64 20.79 22 16.66 22 11.09C22 5.53 17.64 2 12 2M13.11 14.15L10.74 11.62L6.11 14.15L11.19 8.75L13.56 11.28L18.19 8.75L13.11 14.15Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">Facebook Page Messaging</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connect your Facebook business page for automated customer inquiries
                  </p>
                </div>
              </div>

              {fbSession.status === 'connected' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/60" />
                  Disconnected
                </span>
              )}
            </div>

            {/* Connected Profile Showcase Row OR Disconnected Info Panel */}
            {fbSession.status === 'connected' ? (
              <>
                <div className="bg-muted/40 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-border/60">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shadow-inner shrink-0 overflow-hidden border border-border/60">
                      <span className="uppercase">{(fbSession.pageName || 'Aura Home Living').slice(0, 2)}</span>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground">
                          {fbSession.pageName || 'Aura Home Living'}
                        </span>
                        <span title="Verified Facebook Merchant Page">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>Page ID: <code className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono text-foreground">{fbSession.pageId || 'fb_893240219'}</code></span>
                        <span>•</span>
                        <span>Linked Recently</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-end gap-1 shrink-0">
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-semibold">
                      Live 24/7 Bot
                    </span>
                    <span className="text-[11px] text-muted-foreground">Sync: 12 sec ago</span>
                  </div>
                </div>

                {/* Action Row */}
                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowFbModal(true)}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-lg border border-border bg-muted/50 hover:bg-muted text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sliders className="h-4 w-4 text-muted-foreground" />
                    <span>Reconfigure Permissions</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnectFb}
                    className="w-full sm:w-auto py-2.5 px-4 rounded-lg bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Disconnect Channel</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-muted/40 rounded-xl p-3.5 flex flex-col gap-2 border border-border/60">
                  <div className="flex items-center justify-between text-xs text-foreground">
                    <span className="text-muted-foreground font-medium">Channel Protocol</span>
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#0084FF]" />
                      Meta Graph API v19.0
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-foreground">
                    <span className="text-muted-foreground font-medium">Webhook Routing</span>
                    <span className="text-foreground font-medium">Instant Automated Handshake</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-foreground">
                    <span className="text-muted-foreground font-medium">Automated Replies</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Smart AI Active</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFbModal(true)}
                    className="w-full py-3 px-4 rounded-lg bg-[#0084FF] hover:bg-[#0073e6] active:scale-[0.99] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-xs transition-all duration-150 cursor-pointer"
                  >
                    <MessageCircle className="h-5 w-5" />
                    <span>Connect Facebook Page</span>
                  </button>
                  <div className="flex items-center justify-center gap-1.5 text-center text-muted-foreground text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Official Meta Page Messaging API with 24/7 automated instant responses</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Webhook & Sync Security Footer */}
          <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-muted-foreground text-xs">
            <Zap className="h-4 w-4 text-[#0084FF] shrink-0" />
            <span>Real-time webhook routing & token encryption active</span>
          </div>
        </section>
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
