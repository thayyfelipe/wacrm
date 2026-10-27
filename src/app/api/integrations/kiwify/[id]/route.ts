import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { encrypt } from '@/lib/whatsapp/encryption'

type Context = { params: Promise<{ id: string }> }

/** Save Kiwify's webhook token server-side and enable receipt. */
export async function PATCH(request: Request, context: Context) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    // Kiwify does not document a minimum webhook-token length. Accept the
    // exact non-empty token it issued rather than imposing an arbitrary size.
    if (!token || token.length > 512) return NextResponse.json({ error: 'Informe o token do webhook da Kiwify' }, { status: 400 })
    const { data: owned } = await ctx.supabase
      .from('kiwify_integrations').select('id').eq('id', id).eq('account_id', ctx.accountId).maybeSingle()
    if (!owned) return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 })
    const admin = supabaseAdmin()
    const { error: secretError } = await admin.from('kiwify_integration_secrets')
      .upsert({ integration_id: id, token_encrypted: encrypt(token) }, { onConflict: 'integration_id' })
    if (secretError) return NextResponse.json({ error: 'Falha ao salvar token' }, { status: 500 })
    const { error } = await ctx.supabase.from('kiwify_integrations')
      .update({ enabled: true, updated_at: new Date().toISOString() }).eq('id', id).eq('account_id', ctx.accountId)
    if (error) return NextResponse.json({ error: 'Falha ao ativar integração' }, { status: 500 })
    return NextResponse.json({ enabled: true })
  } catch (error) { return toErrorResponse(error) }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await context.params
    const { data, error } = await ctx.supabase.from('kiwify_integrations')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('id', id).eq('account_id', ctx.accountId).select('id').maybeSingle()
    if (error) return NextResponse.json({ error: 'Falha ao desativar integração' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 })
    return NextResponse.json({ enabled: false })
  } catch (error) { return toErrorResponse(error) }
}
