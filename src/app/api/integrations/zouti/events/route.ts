import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const { data, error } = await ctx.supabase.from('zouti_events')
      .select('id, integration_id, event_type, object_name, product_name, product_matched, status, received_at, pix_send_status, pix_send_at, pix_send_error')
      .eq('account_id', ctx.accountId).order('received_at', { ascending: false }).limit(30)
    if (error) return NextResponse.json({ error: 'Falha ao carregar eventos da Zouti.' }, { status: 500 })
    return NextResponse.json({ events: data })
  } catch (error) { return toErrorResponse(error) }
}
