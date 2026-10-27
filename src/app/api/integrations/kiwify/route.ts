import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const { data, error } = await ctx.supabase
      .from('kiwify_integrations')
      .select('id, name, product_id, enabled, created_at')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ integrations: data })
  } catch (error) { return toErrorResponse(error) }
}

/** Create an inactive integration; Kiwify requires the URL before issuing its token. */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const body = await request.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const productId = typeof body?.product_id === 'string' ? body.product_id.trim() : ''
    if (!name || name.length > 100) return NextResponse.json({ error: 'Nome inválido' }, { status: 400 })
    if (!productId || productId.length > 100) return NextResponse.json({ error: 'ID do produto inválido' }, { status: 400 })
    const { data, error } = await ctx.supabase
      .from('kiwify_integrations')
      .insert({ account_id: ctx.accountId, created_by: ctx.userId, name, product_id: productId })
      .select('id, name, product_id, enabled, created_at')
      .single()
    if (error || !data) return NextResponse.json({ error: 'Falha ao criar integração' }, { status: 500 })
    return NextResponse.json({ integration: data, webhook_path: `/api/integrations/kiwify/webhook/${data.id}` }, { status: 201 })
  } catch (error) { return toErrorResponse(error) }
}
