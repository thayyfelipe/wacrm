import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { resolveAuditUserId } from '@/lib/api/v1/contacts'
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation'
import { zoutiInternationalPhone } from './pix-send'
import type { ZoutiEvent } from './webhook'

export function abandonedEligible(event: ZoutiEvent, productId: string | null): boolean {
  return Boolean(productId && event.event_type === 'ABANDONED_CART_CREATED' &&
    event.object_name === 'AbandonedCart' && event.product_matched && event.product_id === productId &&
    event.product_name && event.customer_name && zoutiInternationalPhone(event.customer_phone))
}

/** Two body variables: customer, product. Optional third: verified Zouti checkout URL. */
export function abandonedTemplateVariables(body: string): 2 | 3 | null {
  const placeholders = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1])
  if (!placeholders.includes('1') || !placeholders.includes('2')) return null
  if (placeholders.some((number) => !['1', '2', '3'].includes(number))) return null
  return placeholders.includes('3') ? 3 : 2
}

/** One atomic claim per event. Ambiguous Meta failures are never retried automatically. */
export async function sendZoutiAbandoned(eventId: string, accountId: string, templateName: string): Promise<void> {
  const db = supabaseAdmin()
  const { data: event, error: claimError } = await db.from('zouti_events')
    .update({ abandoned_send_status: 'processing' })
    .eq('id', eventId).eq('account_id', accountId).eq('abandoned_send_status', 'pending')
    .select('id, integration_id, customer_name, customer_phone, product_name, abandoned_cart_url').maybeSingle()
  if (claimError) throw claimError
  if (!event) return
  try {
    const { data: connection, error: connectionError } = await db.from('zouti_integrations')
      .select('enabled, abandoned_automation_enabled, abandoned_template_name')
      .eq('id', event.integration_id).eq('account_id', accountId).maybeSingle()
    if (connectionError) throw connectionError
    if (!connection?.enabled || !connection.abandoned_automation_enabled || connection.abandoned_template_name !== templateName) {
      await db.from('zouti_events').update({ abandoned_send_status: 'skipped' }).eq('id', eventId).eq('account_id', accountId)
      return
    }
    const { data: template, error: templateError } = await db.from('message_templates')
      .select('id, body_text').eq('account_id', accountId).eq('name', templateName)
      .eq('language', 'pt_BR').eq('status', 'APPROVED').maybeSingle()
    if (templateError || !template) throw new Error('Modelo aprovado não encontrado.')
    const count = abandonedTemplateVariables(template.body_text)
    if (!count || (count === 3 && !event.abandoned_cart_url)) throw new Error('Variáveis do modelo incompatíveis com o evento.')
    const phone = zoutiInternationalPhone(event.customer_phone)
    if (!phone || !event.customer_name || !event.product_name) throw new Error('Dados do comprador incompletos.')
    const { conversationId, contactId } = await resolveConversationByPhone(db, accountId, phone, event.customer_name)
    const userId = await resolveAuditUserId(db, accountId)
    const sent = await engineSendTemplate({
      accountId, userId, conversationId, contactId, templateName, language: 'pt_BR',
      params: [event.customer_name, event.product_name, ...(count === 3 && event.abandoned_cart_url ? [event.abandoned_cart_url] : [])],
    })
    const { error } = await db.from('zouti_events').update({
      abandoned_send_status: 'sent', abandoned_send_at: new Date().toISOString(),
      abandoned_message_id: sent.whatsapp_message_id,
    }).eq('id', eventId).eq('account_id', accountId)
    if (error) throw error
  } catch {
    console.error('[zouti] abandoned cart send failed', { eventId, accountId })
    await db.from('zouti_events').update({
      abandoned_send_status: 'failed', abandoned_send_at: new Date().toISOString(),
      abandoned_send_error: 'Falha no envio. Verifique a configuração e o histórico do WhatsApp.',
    }).eq('id', eventId).eq('account_id', accountId).eq('abandoned_send_status', 'processing')
  }
}
