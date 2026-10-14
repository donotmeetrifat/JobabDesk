import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// All protected dashboard route prefixes
const PROTECTED_PATHS = [
  '/dashboard',
  '/inbox',
  '/contacts',
  '/pipelines',
  '/broadcasts',
  '/automations',
  '/flows',
  '/agents',
  '/ai-agents',
  '/notifications',
  '/orders',
  '/products',
  '/settings',
]

// Edge timeout safeguard: abort any auth check that takes longer than 1500ms
const AUTH_TIMEOUT_MS = 1500

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. 0ms Edge Bypass: immediately skip static assets, Next internals, fonts, images, css, js, icons
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|eot|css|js|map)$/i.test(pathname)
  ) {
    return NextResponse.next()
  }

  // 2. 0ms Edge Bypass: webhooks and public payment/pay checkout pages never need middleware auth
  if (
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/webhooks') ||
    pathname.startsWith('/pay') ||
    pathname.startsWith('/api/pay')
  ) {
    return NextResponse.next()
  }

  // 3. 0ms Edge Bypass: All API routes (except /api/whatsapp/) handle their own auth
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/whatsapp/')) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  // Check if any Supabase session cookies exist
  const allCookies = request.cookies.getAll()
  const hasAuthCookie = allCookies.some(
    (c) =>
      c.name.startsWith('sb-') ||
      c.name.includes('auth-token') ||
      c.name.includes('supabase')
  )

  const isProtectedPath = PROTECTED_PATHS.some((path) => pathname.startsWith(path))
  const isAuthPath =
    pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password'
  const isRootPath = pathname === '/'

  // 4. Fast Path for Unauthenticated Visitors:
  // If NOT in test mode and the visitor has NO auth cookies whatsoever:
  // - Protected dashboard path or root ('/'): redirect to /login immediately (0ms, no remote network call)
  // - Auth path (/login, /signup, etc.): pass through immediately (0ms, no remote network call)
  if (process.env.NODE_ENV !== 'test' && !hasAuthCookie) {
    if (isProtectedPath || isRootPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    if (isAuthPath) {
      return NextResponse.next()
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
      global: {
        fetch: (url, options) => {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
          return fetch(url, {
            ...options,
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId))
        },
      },
    })

    // Timeout-guarded getUser() call
    let user: any = null
    try {
      const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) =>
        setTimeout(
          () => resolve({ data: { user: null }, error: new Error('Auth timeout') }),
          AUTH_TIMEOUT_MS
        )
      )

      const result = await Promise.race([supabase.auth.getUser(), timeoutPromise])
      user = result.data?.user ?? null
    } catch (authErr) {
      console.warn('[middleware] Auth check timed out or failed:', authErr)
      user = null
    }

    // getUser() transparently refreshes an expired access token, which
    // ROTATES the refresh token and writes the new cookies onto
    // `supabaseResponse` via setAll() above. Any response we return in
    // place of `supabaseResponse` (every redirect / JSON branch below)
    // is a fresh object that does NOT carry those Set-Cookie headers, so
    // the rotated token never reaches the browser. Copy the refreshed
    // cookies onto whatever response we hand back to fix that.
    const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        response.cookies.set(cookie)
      })
      return response
    }

    // Root path ('/') — redirect signed-in users to /dashboard, signed-out to /login
    if (isRootPath) {
      const url = request.nextUrl.clone()
      url.pathname = user ? '/dashboard' : '/login'
      return withRefreshedCookies(NextResponse.redirect(url))
    }

    // Auth pages - redirect to dashboard if already logged in.
    // Exception: when an invite token is in the query string we
    // send the already-signed-in user to /join/<token> instead so
    // they can accept the invitation in one click.
    if (user && isAuthPath) {
      const url = request.nextUrl.clone()
      const inviteToken = request.nextUrl.searchParams.get('invite')
      if (
        inviteToken &&
        (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')
      ) {
        url.pathname = `/join/${encodeURIComponent(inviteToken)}`
        url.search = ''
      } else {
        url.pathname = '/dashboard'
        url.search = ''
      }
      return withRefreshedCookies(NextResponse.redirect(url))
    }

    // Protected pages - redirect to login if not authenticated
    if (!user && isProtectedPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return withRefreshedCookies(NextResponse.redirect(url))
    }

    // API routes that need auth (not webhooks)
    if (
      !user &&
      request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')
    ) {
      return withRefreshedCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    }
  } catch (err) {
    console.error('[middleware] Unhandled error during auth check:', err)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|eot|css|js|map)$).*)',
  ],
}
