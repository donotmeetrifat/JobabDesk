export interface MetaSignupResult {
  phoneNumberId?: string
  wabaId?: string
  code?: string
  accessToken?: string
}

export interface MetaSignupOptions {
  appId?: string
  configId?: string
  onSuccess: (result: MetaSignupResult) => void
  onError: (error: string) => void
}

/**
 * Dynamically injects the Facebook SDK script into the DOM if not already present.
 */
export function loadFacebookSDK(appId?: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve()

    if ((window as any).FB) {
      return resolve()
    }

    if (document.getElementById('facebook-jssdk')) {
      return resolve()
    }

    const fbAppId = appId || process.env.NEXT_PUBLIC_META_APP_ID || ''

    ;(window as any).fbAsyncInit = function () {
      if ((window as any).FB) {
        ;(window as any).FB.init({
          appId: fbAppId,
          cookie: true,
          xfbml: true,
          version: 'v19.0',
        })
      }
      resolve()
    }

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.body.appendChild(script)
  })
}

/**
 * Launches Meta Embedded Signup flow using Facebook SDK postMessage & FB.login with synchronous popup fallback.
 */
export function launchMetaEmbeddedSignup(
  optionsOrSuccess: MetaSignupOptions | ((result: MetaSignupResult) => void),
  optionalError?: (error: string) => void
): void {
  if (typeof window === 'undefined') return

  let onSuccess: (result: MetaSignupResult) => void
  let onError: (error: string) => void
  let appId: string | undefined
  let configId: string | undefined

  if (typeof optionsOrSuccess === 'function') {
    onSuccess = optionsOrSuccess
    onError = optionalError || (() => {})
  } else {
    onSuccess = optionsOrSuccess.onSuccess
    onError = optionsOrSuccess.onError
    appId = optionsOrSuccess.appId
    configId = optionsOrSuccess.configId
  }

  const metaAppId = appId || process.env.NEXT_PUBLIC_META_APP_ID || ''
  const metaConfigId = configId || process.env.NEXT_PUBLIC_META_CONFIG_ID || ''

  if (!metaAppId) {
    onError('Meta App ID is missing. Please enter your Phone Number ID & Permanent Access Token manually below.')
    return
  }

  let handled = false
  const safeSuccess = (res: MetaSignupResult) => {
    if (handled) return
    handled = true
    cleanup()
    onSuccess(res)
  }

  const safeError = (err: string) => {
    if (handled) return
    handled = true
    cleanup()
    onError(err)
  }

  // 60-second safety timeout guard
  const timeoutId = setTimeout(() => {
    safeError('Connection window timed out. Please try again or enter credentials manually.')
  }, 60000)

  // 1. Session message listener for Meta postMessage events
  const sessionHandler = (event: MessageEvent) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      if (data && data.type === 'WA_EMBEDDED_SIGNUP') {
        if (data.event === 'FINISH') {
          const { phone_number_id, waba_id, code } = data.data || {}
          safeSuccess({ phoneNumberId: phone_number_id, wabaId: waba_id, code })
        } else if (data.event === 'CANCEL') {
          safeError('Embedded Signup cancelled by user')
        }
      }
    } catch {
      // Ignore non-matching events safely
    }
  }

  // 2. BroadcastChannel listener for cross-tab or popup-decoupled communication
  let bc: BroadcastChannel | null = null
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel('jobabdesk_wa_auth')
      bc.onmessage = (event) => {
        if (event.data?.type === 'WA_EMBEDDED_SIGNUP') {
          if (event.data.event === 'FINISH') {
            const { phone_number_id, waba_id, code } = event.data.data || {}
            safeSuccess({ phoneNumberId: phone_number_id, wabaId: waba_id, code })
          } else if (event.data.event === 'CANCEL') {
            safeError('Embedded Signup cancelled by user')
          }
        }
      }
    } catch {}
  }

  // 3. Storage event listener
  const storageHandler = (e: StorageEvent) => {
    if (e.key === 'jobabdesk_wa_auth_event' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue)
        if (parsed.type === 'WA_EMBEDDED_SIGNUP') {
          if (parsed.event === 'FINISH') {
            const { phone_number_id, waba_id, code } = parsed.data || {}
            safeSuccess({ phoneNumberId: phone_number_id, wabaId: waba_id, code })
          } else if (parsed.event === 'CANCEL') {
            safeError('Embedded Signup cancelled by user')
          }
        }
      } catch {}
    }
  }

  const cleanup = () => {
    clearTimeout(timeoutId)
    window.removeEventListener('message', sessionHandler)
    window.removeEventListener('storage', storageHandler)
    if (bc) {
      try { bc.close() } catch {}
    }
  }

  window.addEventListener('message', sessionHandler)
  window.addEventListener('storage', storageHandler)

  // Attempt synchronous Facebook SDK login or direct window popup
  if ((window as any).FB) {
    const loginOptions: Record<string, any> = {
      scope: 'whatsapp_business_management,whatsapp_business_messaging',
      extras: {
        feature: 'whatsapp_embedded_signup',
        ...(metaConfigId ? { setup: { config_id: metaConfigId } } : {}),
      },
    }

    try {
      ;(window as any).FB.login((response: any) => {
        if (response && response.authResponse) {
          const code = response.authResponse.code
          const accessToken = response.authResponse.accessToken
          safeSuccess({ code, accessToken })
        } else {
          safeError('Facebook Login popup was closed or cancelled.')
        }
      }, loginOptions)
    } catch {
      openOAuthPopupDirectly(metaAppId, metaConfigId, safeSuccess, safeError)
    }
  } else {
    openOAuthPopupDirectly(metaAppId, metaConfigId, safeSuccess, safeError)
    loadFacebookSDK(metaAppId)
  }
}

function openOAuthPopupDirectly(
  appId: string,
  configId: string,
  onSuccess: (res: MetaSignupResult) => void,
  onError: (err: string) => void
) {
  const redirectUri = window.location.origin + '/api/channels/whatsapp/embedded-signup'
  const extras = JSON.stringify({
    feature: 'whatsapp_embedded_signup',
    ...(configId ? { setup: { config_id: configId } } : {}),
  })

  const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(
    appId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=whatsapp_business_management,whatsapp_business_messaging&response_type=code&extras=${encodeURIComponent(
    extras
  )}`

  let popup: Window | null = null
  try {
    popup = window.open(oauthUrl, 'MetaLoginPopup', 'width=650,height=750,scrollbars=yes,resizable=yes')
  } catch {
    popup = null
  }

  if (!popup) {
    try {
      popup = window.open(oauthUrl, '_blank')
    } catch {
      popup = null
    }
  }

  if (!popup) {
    onError('Browser popup blocked. Please click to open login in a new tab or use manual setup.')
  }
}
