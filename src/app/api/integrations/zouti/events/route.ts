import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const { data, error } = await ctx.supabase.from('zouti_events')
      .select('id, integration_id, event_type, object_name, product_name, product_matched, status, received_at, pix_send_status, pix_send_at, pix_send_error, pix_message_id, abandoned_send_status, abandoned_send_at, abandoned_send_error, abandoned_message_id')
      .eq('account_id', ctx.accountId).order('received_at', { ascending: false }).limit(30)
    if (error) return NextResponse.json({ error: 'Falha ao carregar eventos da Zouti.' }, { status: 500 })
    const messageIds = [...new Set((data ?? []).flatMap((event) => [event.pix_message_id, event.abandoned_message_id]).filter((id): id is string => Boolean(id)))]
    if (messageIds.length === 0) return NextResponse.json({ events: (data ?? []).map((event) => ({ ...event, pix_message_id: undefined, abandoned_message_id: undefined })) })
    const { data: messages, error: deliveryError } = await ctx.supabase.from('messages')
      .select('message_id, status, error_code, conversations!inner(account_id)')
      .in('message_id', messageIds).eq('conversations.account_id', ctx.accountId)
    if (deliveryError) return NextResponse.json({ error: 'Falha ao carregar situação da entrega.' }, { status: 500 })
    const delivery = new Map((messages ?? []).map((message) => [message.message_id, message]))
    return NextResponse.json({ events: (data ?? []).map((event) => ({
      ...event,
      delivery_status: event.pix_message_id ? delivery.get(event.pix_message_id)?.status ?? null : null,
      delivery_error_code: event.pix_message_id ? delivery.get(event.pix_message_id)?.error_code ?? null : null,
      abandoned_delivery_status: event.abandoned_message_id ? delivery.get(event.abandoned_message_id)?.status ?? null : null,
      abandoned_delivery_error_code: event.abandoned_message_id ? delivery.get(event.abandoned_message_id)?.error_code ?? null : null,
      pix_message_id: undefined,
      abandoned_message_id: undefined,
    })) })
  } catch (error) { return toErrorResponse(error) }
}
