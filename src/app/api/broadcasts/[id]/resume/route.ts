import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { executeBroadcastDelivery } from '@/lib/broadcasts/broadcast-dispatcher'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getAdminClient()

    // Mark status back to sending
    await db
      .from('broadcasts')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', id)

    after(() => {
      executeBroadcastDelivery(id).catch((err) => {
        console.error('[Broadcast Resume] Delivery error:', err)
      })
    })

    return NextResponse.json({ success: true, message: 'Broadcast delivery resumed' })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to resume broadcast' }, { status: 500 })
  }
}
