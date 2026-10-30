import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: Context) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const secret = typeof body?.secret === 'string' ? body.secret.trim() : ''
    if (!secret || secret.length > 512) return NextResponse.json({ error: 'Informe o segredo do webhook da Zouti.' }, { status: 400 })
    const { data: integration, error: lookupError } = await ctx.supabase.from('zouti_integrations')
      .select('id').eq('id', id).eq('account_id', ctx.accountId).maybeSingle()
    if (lookupError) return NextResponse.json({ error: 'Falha ao localizar integração.' }, { status: 500 })
    if (!integration) return NextResponse.json({ error: 'Integração não encontrada.' }, { status: 404 })
    const admin = supabaseAdmin()
    const { data: prior, error: priorError } = await admin.from('zouti_integration_secrets')
      .select('secret_encrypted').eq('integration_id', id).maybeSingle()
    if (priorError) return NextResponse.json({ error: 'Falha ao consultar segredo atual.' }, { status: 500 })
    const oldEncrypted = prior?.secret_encrypted
    let rotating = false
    if (oldEncrypted) {
      try { rotating = decrypt(oldEncrypted) !== secret }
      catch { return NextResponse.json({ error: 'Falha ao ler segredo atual.' }, { status: 503 }) }
    }
    const { error: secretError } = await admin.from('zouti_integration_secrets')
      .upsert({
        integration_id: id,
        secret_encrypted: rotating || !oldEncrypted ? encrypt(secret) : oldEncrypted,
        ...(rotating ? {
          previous_secret_encrypted: oldEncrypted,
          previous_secret_valid_until: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        } : {}),
      }, { onConflict: 'integration_id' })
    if (secretError) return NextResponse.json({ error: 'Falha ao salvar segredo.' }, { status: 500 })
    const { error } = await ctx.supabase.from('zouti_integrations')
      .update({ enabled: true, updated_at: new Date().toISOString() })
      .eq('id', id).eq('account_id', ctx.accountId)
    if (error) return NextResponse.json({ error: 'Falha ao ativar integração.' }, { status: 500 })
    return NextResponse.json({ enabled: true })
  } catch (error) { return toErrorResponse(error) }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await context.params
    const { data, error } = await ctx.supabase.from('zouti_integrations')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('id', id).eq('account_id', ctx.accountId).select('id').maybeSingle()
    if (error) return NextResponse.json({ error: 'Falha ao desativar integração.' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Integração não encontrada.' }, { status: 404 })
    return NextResponse.json({ enabled: false })
  } catch (error) { return toErrorResponse(error) }
}
