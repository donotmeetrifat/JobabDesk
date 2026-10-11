import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { fetchMetaUserProfile } from '@/lib/messenger/profile'
import { isFacebookPsid } from '@/lib/contacts/extract-info'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey && serviceKey.trim().length > 0) {
    return createSupabaseClient(url, serviceKey.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return createSupabaseClient(url, anonKey)
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Missing contact ID' }, { status: 400 })
    }

    const db = getAdminClient()

    // 1. Fetch contact
    const { data: contact } = await db
      .from('contacts')
      .select('id, name, avatar_url, phone, messenger_id, account_id, company')
      .eq('id', id)
      .maybeSingle()

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // 2. If contact already has an avatar URL, attempt to stream image bytes
    if (contact.avatar_url) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4000)
        const imgRes = await fetch(contact.avatar_url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        })
        clearTimeout(timeout)

        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
          const arrayBuffer = await imgRes.arrayBuffer()
          return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
          })
        }
      } catch {
        // Image fetch failed or expired, fall through to re-resolve from Meta
      }
    }

    // 3. If avatar_url is missing or was expired/broken, attempt resolution from Facebook
    const customerPsid =
      contact.messenger_id ||
      (isFacebookPsid(contact.phone) ? contact.phone : null)

    if (customerPsid && contact.account_id) {
      // Find page access token for this account
      let pageAccessToken = ''
      const { data: account } = await db
        .from('accounts')
        .select('facebook_page_access_token')
        .eq('id', contact.account_id)
        .maybeSingle()

      if (account?.facebook_page_access_token) {
        pageAccessToken = account.facebook_page_access_token
      } else {
        const { data: conn } = await db
          .from('channel_connections')
          .select('metadata')
          .eq('account_id', contact.account_id)
          .eq('channel_type', 'messenger')
          .limit(1)
          .maybeSingle()
        if (conn?.metadata) {
          pageAccessToken =
            conn.metadata.access_token || conn.metadata.accessToken || ''
        }
      }

      if (pageAccessToken) {
        const profile = await fetchMetaUserProfile(customerPsid, pageAccessToken)
        if (profile?.avatarUrl || profile?.name) {
          const updates: Record<string, any> = {
            updated_at: new Date().toISOString(),
          }
          if (profile.avatarUrl) updates.avatar_url = profile.avatarUrl
          if (profile.name) updates.name = profile.name

          await db.from('contacts').update(updates).eq('id', contact.id)

          if (profile.avatarUrl) {
            try {
              const controller = new AbortController()
              const timeout = setTimeout(() => controller.abort(), 4000)
              const imgRes = await fetch(profile.avatarUrl, {
                signal: controller.signal,
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
              })
              clearTimeout(timeout)

              if (imgRes.ok) {
                const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
                const arrayBuffer = await imgRes.arrayBuffer()
                return new NextResponse(arrayBuffer, {
                  status: 200,
                  headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
                  },
                })
              }
            } catch {
              // Direct redirect fallback
              return NextResponse.redirect(profile.avatarUrl, { status: 307 })
            }
          }
        }
      }
    }

    return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to resolve avatar' },
      { status: 500 }
    )
  }
}
