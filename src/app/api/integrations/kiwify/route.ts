import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

function databaseError(error: { code?: string; message?: string }) {
  // PostgREST returns PGRST205 for a missing relation in its schema cache;
  // PostgreSQL returns 42P01 if the relation is queried directly.
  if (error.code === 'PGRST205' || error.code === '42P01' ||
      error.message?.includes("'public.kiwify_integrations'")) {
    return NextResponse.json(
      { error: 'A integração Kiwify ainda não foi instalada no banco. A migração 047 precisa ser aplicada antes de criar conexões.', code: 'KIWIFY_SCHEMA_MISSING' },
      { status: 503 },
    )
  }
  console.error('[kiwify] integration database error', { code: error.code, message: error.message })
  return NextResponse.json({ error: 'Falha ao acessar a integração Kiwify. Verifique as permissões do banco.' }, { status: 500 })
}

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const { data, error } = await ctx.supabase
      .from('kiwify_integrations')
      .select('id, name, product_id, enabled, created_at')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
    if (error) return databaseError(error)
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
    if (error) return databaseError(error)
    if (!data) return NextResponse.json({ error: 'Falha ao criar integração' }, { status: 500 })
    return NextResponse.json({ integration: data, webhook_path: `/api/integrations/kiwify/webhook/${data.id}` }, { status: 201 })
  } catch (error) { return toErrorResponse(error) }
}
