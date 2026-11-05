import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { parseApprovedSale, verifyKiwifySignature } from '@/lib/kiwify/signature'

type Context = { params: Promise<{ id: string }> }
const MAX_BODY_BYTES = 256 * 1024

export async function POST(request: Request, context: Context) {
  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  const signature = new URL(request.url).searchParams.get('signature')
  if (!signature) return NextResponse.json({ error: 'Assinatura ausente' }, { status: 401 })
  const db = supabaseAdmin()
  const { data: integration, error: lookupError } = await db.from('kiwify_integrations')
    .select('id, account_id, product_id, enabled').eq('id', id).maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Falha temporária' }, { status: 503 })
  if (!integration?.enabled) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  const { data: secret, error: secretError } = await db.from('kiwify_integration_secrets')
    .select('token_encrypted').eq('integration_id', id).maybeSingle()
  if (secretError || !secret) return NextResponse.json({ error: 'Falha temporária' }, { status: 503 })
  const declaredLength = Number(request.headers.get('content-length'))
  if (declaredLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Requisição grande demais' }, { status: 413 })
  let raw: string
  try {
    const reader = request.body?.getReader()
    if (!reader) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        await reader.cancel()
        return NextResponse.json({ error: 'Requisição grande demais' }, { status: 413 })
      }
      chunks.push(value)
    }
    raw = Buffer.concat(chunks).toString('utf8')
  } catch { return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 }) }
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  let token: string
  try { token = decrypt(secret.token_encrypted) } catch { return NextResponse.json({ error: 'Falha temporária' }, { status: 503 }) }
  if (!verifyKiwifySignature(body, signature, token, raw)) {
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
  }
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  const product = payload.Product && typeof payload.Product === 'object' && !Array.isArray(payload.Product)
    ? payload.Product as Record<string, unknown> : {}
  const field = (value: unknown, max = 200) => typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max) : null
  const productId = field(product.product_id)
  const { error: eventError } = await db.from('kiwify_events').upsert({
    integration_id: id,
    account_id: integration.account_id,
    event_type: field(payload.webhook_event_type, 100) ?? 'unknown',
    order_id: field(payload.order_id),
    product_id: productId,
    product_name: field(product.product_name),
    order_status: field(payload.order_status, 100),
    product_matched: productId === integration.product_id,
    payload_hash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
  }, { onConflict: 'integration_id,payload_hash', ignoreDuplicates: true })
  if (eventError) {
    console.error('[kiwify] event insert failed', { integrationId: id, code: eventError.code })
    return NextResponse.json({ error: 'Falha temporária' }, { status: 503 })
  }
  const sale = parseApprovedSale(body)
  if (!sale) return NextResponse.json({ received: true, recorded: false })
  if (sale.product_id !== integration.product_id) {
    return NextResponse.json({ received: true, recorded: false })
  }
  // ON CONFLICT DO NOTHING guarantees retries and duplicate connections
  // within one account never create a second sale.
  const { error } = await db.from('kiwify_sales').upsert({
    ...sale, integration_id: id, account_id: integration.account_id,
  }, { onConflict: 'account_id,order_id', ignoreDuplicates: true })
  if (error) {
    console.error('[kiwify] sale insert failed', { integrationId: id, code: error.code })
    return NextResponse.json({ error: 'Falha temporária' }, { status: 503 })
  }
  return NextResponse.json({ received: true, recorded: true })
}
