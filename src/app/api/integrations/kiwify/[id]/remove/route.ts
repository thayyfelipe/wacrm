import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

type Context = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: Context) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await context.params
    const { data, error } = await ctx.supabase.from('kiwify_integrations')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).eq('account_id', ctx.accountId).eq('enabled', false).is('deleted_at', null)
      .select('id').maybeSingle()
    if (error) return NextResponse.json({ error: 'Falha ao excluir conexão' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Somente conexões inativas podem ser excluídas' }, { status: 409 })
    return NextResponse.json({ deleted: true })
  } catch (error) { return toErrorResponse(error) }
}
