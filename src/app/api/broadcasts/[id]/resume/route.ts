import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { executeBroadcastDelivery } from '@/lib/broadcasts/broadcast-dispatcher'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function getAdminClient() {
  try {
    return supabaseAdmin()
  } catch {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    return createClient(url, key)
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const scope = body?.scope || 'pending'
    const db = getAdminClient()

    // Mark status back to sending
    await db
      .from('broadcasts')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', id)

    // Execute delivery synchronously to ensure serverless doesn't freeze prematurely
    const result = await executeBroadcastDelivery(id, { scope })

    // Also schedule async pass to handle any remaining backlog
    after(async () => {
      try {
        await executeBroadcastDelivery(id, { scope })
      } catch (err) {
        console.error('[Broadcast Resume] Background delivery error:', err)
      }
    })

    return NextResponse.json({
      success: true,
      broadcast_id: id,
      resuming: result.sent + result.failed,
      sent: result.sent,
      failed: result.failed,
      remaining: 0,
      message: 'Broadcast delivery resumed and processed successfully',
    })
  } catch (err: any) {
    console.error('[Broadcast Resume] Error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to resume broadcast' }, { status: 500 })
  }
}

