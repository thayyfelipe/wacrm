import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

const PAGE_SIZE = 10

export async function GET(request: Request) {
  try {
    const rawPage = new URL(request.url).searchParams.get('page') ?? '1'
    const page = /^\d+$/.test(rawPage) ? Number(rawPage) : NaN
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) {
      return NextResponse.json({ error: 'Página inválida.' }, { status: 400 })
    }
    const ctx = await requireRole('admin')
    const { data, error, count } = await ctx.supabase.from('zouti_events')
      .select('id, integration_id, event_type, object_name, product_name, product_matched, status, received_at, pix_send_status, pix_send_at, pix_send_error, pix_message_id, abandoned_send_status, abandoned_send_at, abandoned_send_error, abandoned_message_id', { count: 'exact' })
      .eq('account_id', ctx.accountId).order('received_at', { ascending: false }).order('id', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (error) return NextResponse.json({ error: 'Falha ao carregar eventos da Zouti.' }, { status: 500 })
    const pagination = { page, pageSize: PAGE_SIZE, total: count ?? 0 }
    const messageIds = [...new Set((data ?? []).flatMap((event) => [event.pix_message_id, event.abandoned_message_id]).filter((id): id is string => Boolean(id)))]
    if (messageIds.length === 0) return NextResponse.json({ events: (data ?? []).map((event) => ({ ...event, pix_message_id: undefined, abandoned_message_id: undefined })), pagination })
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
    })), pagination })
  } catch (error) { return toErrorResponse(error) }
}
