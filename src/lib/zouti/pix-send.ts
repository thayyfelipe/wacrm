import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { resolveAuditUserId } from '@/lib/api/v1/contacts'
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation'
import type { ZoutiEvent } from './webhook'

/** Zouti may supply a Brazilian international number without the leading +. */
export function zoutiInternationalPhone(value: string | null): string | null {
  if (!value) return null
  const digits = value.replace(/[\s().-]/g, '')
  if (/^\+55[1-9]\d{9,10}$/.test(digits)) return digits
  if (/^55[1-9]\d{9,10}$/.test(digits)) return `+${digits}`
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits
  return null
}

export function pixEligible(event: ZoutiEvent, productId: string | null): boolean {
  return Boolean(productId && event.event_type === 'PIX_CREATED' &&
    event.object_name === 'Order' && event.status === 'AWAITING_PAYMENT' &&
    event.product_matched && event.product_id === productId &&
    event.product_name && event.customer_name && zoutiInternationalPhone(event.customer_phone))
}

/** Claim once before making any external call. A failed/ambiguous send needs manual review. */
export async function sendZoutiPix(eventId: string, accountId: string, templateName: string): Promise<void> {
  const db = supabaseAdmin()
  const { data: event, error: claimError } = await db.from('zouti_events')
    .update({ pix_send_status: 'processing' })
    .eq('id', eventId).eq('account_id', accountId).eq('pix_send_status', 'pending')
    .select('id, integration_id, customer_name, customer_phone, product_name').maybeSingle()
  if (claimError) throw claimError
  if (!event) return
  try {
    // Recheck the switch and the template. The template is owned by this account.
    const { data: connection } = await db.from('zouti_integrations')
      .select('enabled, pix_automation_enabled, pix_template_name')
      .eq('id', event.integration_id).eq('account_id', accountId).maybeSingle()
    if (!connection?.enabled || !connection.pix_automation_enabled || connection.pix_template_name !== templateName) {
      await db.from('zouti_events').update({ pix_send_status: 'skipped' }).eq('id', eventId).eq('account_id', accountId)
      return
    }
    const { data: template, error: templateError } = await db.from('message_templates')
      .select('id, body_text, status').eq('account_id', accountId)
      .eq('name', templateName).eq('language', 'pt_BR').eq('status', 'APPROVED').maybeSingle()
    if (templateError || !template || !validPixTemplateBody(template.body_text)) {
      throw new Error('Modelo aprovado com duas variáveis não encontrado.')
    }
    const phone = zoutiInternationalPhone(event.customer_phone)
    if (!phone || !event.customer_name || !event.product_name) throw new Error('Dados do comprador incompletos.')
    const { conversationId, contactId } = await resolveConversationByPhone(db, accountId, phone, event.customer_name)
    const userId = await resolveAuditUserId(db, accountId)
    const sent = await engineSendTemplate({
      accountId, userId, conversationId, contactId, templateName, language: 'pt_BR',
      params: [event.customer_name, event.product_name],
    })
    const { error } = await db.from('zouti_events').update({
      pix_send_status: 'sent', pix_send_at: new Date().toISOString(), pix_message_id: sent.whatsapp_message_id,
    }).eq('id', eventId).eq('account_id', accountId)
    if (error) throw error
  } catch {
    // A timeout after the Meta call is ambiguous. Never retry automatically.
    console.error('[zouti] pix send failed', { eventId, accountId })
    await db.from('zouti_events').update({
      pix_send_status: 'failed', pix_send_at: new Date().toISOString(),
      pix_send_error: 'Falha no envio. Verifique a configuração e o histórico do WhatsApp.',
    }).eq('id', eventId).eq('account_id', accountId).eq('pix_send_status', 'processing')
  }
}

export function validPixTemplateBody(body: string): boolean {
  const placeholders = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1])
  return placeholders.includes('1') && placeholders.includes('2') && placeholders.every((number) => number === '1' || number === '2')
}
