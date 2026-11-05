import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

const PAGE_SIZE = 10

export async function GET(request: Request) {
  try {
    const rawPage = new URL(request.url).searchParams.get('page') ?? '1'
    const page = /^\d+$/.test(rawPage) ? Number(rawPage) : NaN
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) {
      return NextResponse.json({ error: 'Página inválida' }, { status: 400 })
    }
    const ctx = await requireRole('admin')
    const { data, count, error } = await ctx.supabase.from('kiwify_events')
      .select('id, event_type, order_id, product_name, order_status, product_matched, received_at', { count: 'exact' })
      .eq('account_id', ctx.accountId)
      .order('received_at', { ascending: false }).order('id', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (error) return NextResponse.json({ error: 'Falha ao carregar eventos da Kiwify' }, { status: 500 })
    return NextResponse.json({ events: data ?? [], pagination: { page, pageSize: PAGE_SIZE, total: count ?? 0 } })
  } catch (error) { return toErrorResponse(error) }
}
