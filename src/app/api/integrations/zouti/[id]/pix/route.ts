import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { validPixTemplateBody } from '@/lib/zouti/pix-send'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: Context) {
  try {
    const ctx = await requireRole('admin')
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    if (typeof body?.enabled !== 'boolean') return NextResponse.json({ error: 'Opção inválida.' }, { status: 400 })
    if (body.enabled && body.event_type !== 'PIX_CREATED') {
      return NextResponse.json({ error: 'O envio de mensagens está disponível para Pix criado nesta etapa.' }, { status: 400 })
    }
    const templateName = typeof body?.template_name === 'string' ? body.template_name.trim() : ''
    const { data: integration, error: lookupError } = await ctx.supabase.from('zouti_integrations')
      .select('id, enabled, product_id').eq('id', id).eq('account_id', ctx.accountId).maybeSingle()
    if (lookupError) return NextResponse.json({ error: 'Falha ao consultar conexão.' }, { status: 500 })
    if (!integration) return NextResponse.json({ error: 'Conexão não encontrada.' }, { status: 404 })
    if (body.enabled) {
      if (!integration.enabled || !integration.product_id) {
        return NextResponse.json({ error: 'Ative a conexão e configure o ID do produto antes do envio.' }, { status: 400 })
      }
      if (!/^[a-z0-9_]{1,512}$/.test(templateName)) return NextResponse.json({ error: 'Nome do modelo inválido.' }, { status: 400 })
      const { data: template, error: templateError } = await ctx.supabase.from('message_templates')
        .select('id, body_text').eq('account_id', ctx.accountId).eq('name', templateName)
        .eq('language', 'pt_BR').eq('status', 'APPROVED').maybeSingle()
      if (templateError || !template || !validPixTemplateBody(template.body_text)) {
        return NextResponse.json({ error: 'Selecione um modelo pt_BR aprovado com {{1}} para nome e {{2}} para produto.' }, { status: 400 })
      }
    }
    const { data, error } = await ctx.supabase.from('zouti_integrations').update({
      pix_automation_enabled: body.enabled,
      ...(body.enabled ? { pix_template_name: templateName } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('account_id', ctx.accountId).select('id, pix_automation_enabled, pix_template_name').maybeSingle()
    if (error) return NextResponse.json({ error: 'Falha ao salvar envio de Pix.' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Conexão não encontrada.' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) { return toErrorResponse(error) }
}
