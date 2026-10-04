import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { backfillContactInfoFromChat } from '@/lib/contacts/auto-extract'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, serviceKey.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET() {
  try {
    const admin = getAdminClient()

    // 1. Fetch recent message reactions
    const { data: reactions, error: rErr } = await admin
      .from('message_reactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    // 2. Fetch recent webhook debug logs
    const { data: webhookLogs, error: logErr } = await admin
      .from('webhook_debug_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    // 3. Fetch recent customer messages
    const { data: messages, error: mErr } = await admin
      .from('messages')
      .select('id, conversation_id, sender_type, message_id, content_text, created_at')
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(30)

    // 3b. Inspect conversation and contact for mute status
    const targetConvId = messages?.[0]?.conversation_id || 'f7bdd5b5-e9a1-4ad4-83f9-989a18dde09e'
    const { data: convInfo } = await admin
      .from('conversations')
      .select('id, contact_id, account_id, channel, ai_autoreply_disabled, assigned_agent_id')
      .eq('id', targetConvId)
      .maybeSingle()

    let contactInfo: any = null
    let contactColumns: string[] = []
    let addressColumnExists = false
    let allContacts: any = []
    let allNotes: any = []
    try {
      const { data: ct, error: ctErr } = await admin
        .from('contacts')
        .select('*')
        .limit(1)
        .maybeSingle()
      if (ct) {
        contactColumns = Object.keys(ct)
        addressColumnExists = 'address' in ct
      }
      const { data: cList } = await admin.from('contacts').select('id, name, phone, email, company').limit(10)
      allContacts = cList || []
      const { data: nList } = await admin.from('contact_notes').select('*').limit(10)
      allNotes = nList || []
      contactInfo = { contactColumns, addressColumnExists, ctErr, allContacts, allNotes }
    } catch (e: any) {
      contactInfo = { error: e.message }
    }

    // Auto-backfill real phone numbers & addresses from customer messages into their contacts
    const backfillStats = await backfillContactInfoFromChat(admin).catch((e: any) => ({
      error: e.message,
      processed: 0,
      updated: 0,
    }))

    // Clean up dummy @facebook.com emails from contacts table
    const { data: cleanedContacts } = await admin
      .from('contacts')
      .update({ email: null })
      .like('email', '%@facebook.com')
      .select('id, name')
    const { data: accounts } = await admin
      .from('accounts')
      .select('id, name, facebook_page_id, facebook_page_name, facebook_page_access_token')
      .not('facebook_page_id', 'is', null)

    const { data: chanConns } = await admin
      .from('channel_connections')
      .select('id, account_id, channel_type, external_account_id, display_name, metadata')
      .eq('channel_type', 'messenger')

    const pageSubscriptions: any[] = []

    // Helper to verify and subscribe a page
    const checkAndSubscribe = async (pageId: string, pageToken: string, accountName: string) => {
      if (!pageId || !pageToken) return
      try {
        // Check current subscribed apps with explicit fields=subscribed_fields
        const checkRes = await fetch(
          `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?fields=subscribed_fields&access_token=${encodeURIComponent(pageToken)}`
        )
        const checkJson = await checkRes.json()

        const currentFields = checkJson?.data?.[0]?.subscribed_fields || []
        const hasReactionSub = currentFields.includes('message_reactions')

        let subscribeResult: any = null
        // Auto-subscribe if message_reactions is missing
        if (!hasReactionSub) {
          const subRes = await fetch(
            `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_reactions,message_reads,messaging_optins&access_token=${encodeURIComponent(pageToken)}`,
            { method: 'POST' }
          )
          subscribeResult = await subRes.json()
        }

        pageSubscriptions.push({
          pageId,
          accountName,
          rawCheckJson: checkJson,
          currentFields,
          hasReactionSub,
          reSubscribed: !hasReactionSub,
          subscribeResult,
        })
      } catch (err: any) {
        pageSubscriptions.push({
          pageId,
          accountName,
          error: err.message,
        })
      }
    }

    if (accounts) {
      for (const acc of accounts) {
        if (acc.facebook_page_id && acc.facebook_page_access_token) {
          await checkAndSubscribe(acc.facebook_page_id, acc.facebook_page_access_token, acc.name || 'Account')
        }
      }
    }

    if (chanConns) {
      for (const ch of chanConns) {
        const token = ch.metadata?.access_token || ch.metadata?.accessToken
        if (ch.external_account_id && token) {
          const already = pageSubscriptions.some((p) => p.pageId === ch.external_account_id)
          if (!already) {
            await checkAndSubscribe(ch.external_account_id, token, ch.display_name || 'ChannelConnection')
          }
        }
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      reactionsCount: reactions?.length || 0,
      reactions: reactions || [],
      webhookLogs: webhookLogs || [],
      pageSubscriptions,
      recentMessages: messages || [],
      convInfo,
      contactInfo,
      backfillStats,
      errors: { rErr, logErr, mErr },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
