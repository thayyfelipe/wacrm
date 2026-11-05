import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const { data, error } = await ctx.supabase.from('kiwify_order_events')
      .select('id, order_ref, order_id, product_name, event_type, customer_name, received_at')
      .eq('account_id', ctx.accountId)
      .order('received_at', { ascending: false })
      .limit(100)
    if (error) return NextResponse.json({ error: 'Falha ao carregar eventos da Kiwify' }, { status: 500 })
    return NextResponse.json({ events: data })
  } catch (error) { return toErrorResponse(error) }
}
