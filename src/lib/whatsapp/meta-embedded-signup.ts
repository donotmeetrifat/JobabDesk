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
    clearTimeout(timeoutId)
    onSuccess(res)
  }

  const safeError = (err: string) => {
    if (handled) return
    handled = true
    clearTimeout(timeoutId)
    onError(err)
  }

  // 45-second safety timeout guard
  const timeoutId = setTimeout(() => {
    safeError('Connection window timed out or popup was blocked by browser. Please allow popups for jobabdesk.vercel.app or use manual setup.')
  }, 45000)

  // Session message listener for Meta postMessage events
  const sessionHandler = (event: MessageEvent) => {
    if (
      event.origin !== 'https://www.facebook.com' &&
      event.origin !== 'https://web.facebook.com'
    ) {
      return
    }

    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      if (data && data.type === 'WA_EMBEDDED_SIGNUP') {
        if (data.event === 'FINISH') {
          const { phone_number_id, waba_id } = data.data || {}
          safeSuccess({ phoneNumberId: phone_number_id, wabaId: waba_id })
          window.removeEventListener('message', sessionHandler)
        } else if (data.event === 'CANCEL') {
          safeError('Embedded Signup cancelled by user')
          window.removeEventListener('message', sessionHandler)
        }
      }
    } catch {
      // Ignore non-JSON messages safely
    }
  }

  window.addEventListener('message', sessionHandler)

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
    // If FB SDK hasn't finished loading yet, open direct synchronous Meta OAuth popup so browser doesn't block it
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

  const popup = window.open(oauthUrl, 'MetaLoginPopup', 'width=600,height=750,scrollbars=yes,resizable=yes')

  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    onError('Browser popup blocked! Please click the popup icon 🚫 in your browser address bar to allow popups, or use manual credentials setup.')
  }
}
