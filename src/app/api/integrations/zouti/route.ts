import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

function dbError(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST205' || error.code === '42P01') {
    return NextResponse.json({ error: 'A migração Zouti ainda não foi aplicada no banco.' }, { status: 503 })
  }
  console.error('[zouti] database error', { code: error.code })
  return NextResponse.json({ error: 'Falha ao consultar a Zouti.' }, { status: 500 })
}

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const { data, error } = await ctx.supabase.from('zouti_integrations')
      .select('id, name, product_id, enabled, pix_automation_enabled, pix_template_name, created_at')
      .eq('account_id', ctx.accountId).order('created_at', { ascending: false })
    if (error) return dbError(error)
    return NextResponse.json({ integrations: data })
  } catch (error) { return toErrorResponse(error) }
}

/** Create an inactive endpoint; the provider issues its secret separately. */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const body = await request.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const productId = typeof body?.product_id === 'string' ? body.product_id.trim() : ''
    if (!name || name.length > 100 || productId.length > 100) {
      return NextResponse.json({ error: 'Nome ou ID do produto inválido.' }, { status: 400 })
    }
    const { data, error } = await ctx.supabase.from('zouti_integrations')
      .insert({ account_id: ctx.accountId, created_by: ctx.userId, name, product_id: productId || null })
      .select('id, name, product_id, enabled').single()
    if (error) return dbError(error)
    return NextResponse.json({ integration: data }, { status: 201 })
  } catch (error) { return toErrorResponse(error) }
}
