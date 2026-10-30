import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { parseZoutiEvent, verifyZoutiSignature } from '@/lib/zouti/webhook'
import { pixEligible, sendZoutiPix } from '@/lib/zouti/pix-send'

type Context = { params: Promise<{ id: string }> }
const MAX_BODY_BYTES = 256 * 1024

/** Receives signed events; Pix sends require a separate opt-in on this connection. */
export async function POST(request: Request, context: Context) {
  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  }
  const db = supabaseAdmin()
  const { data: integration, error: lookupError } = await db.from('zouti_integrations')
    .select('id, account_id, product_id, enabled, pix_automation_enabled, pix_template_name').eq('id', id).maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Falha temporária.' }, { status: 503 })
  if (!integration?.enabled) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const { data: secretRow, error: secretError } = await db.from('zouti_integration_secrets')
    .select('secret_encrypted, previous_secret_encrypted, previous_secret_valid_until').eq('integration_id', id).maybeSingle()
  if (secretError || !secretRow) return NextResponse.json({ error: 'Falha temporária.' }, { status: 503 })

  const declared = Number(request.headers.get('content-length'))
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: 'Requisição grande demais.' }, { status: 413 })
  let raw: Buffer
  try {
    const reader = request.body?.getReader()
    if (!reader) return NextResponse.json({ error: 'Corpo ausente.' }, { status: 400 })
    const chunks: Buffer[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        await reader.cancel()
        return NextResponse.json({ error: 'Requisição grande demais.' }, { status: 413 })
      }
      chunks.push(Buffer.from(value))
    }
    raw = Buffer.concat(chunks)
  } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }

  let secret: string
  try { secret = decrypt(secretRow.secret_encrypted) }
  catch { return NextResponse.json({ error: 'Falha temporária.' }, { status: 503 }) }
  const signature = request.headers.get('x-zouti-signature')
  let valid = verifyZoutiSignature(raw, signature, secret)
  if (!valid && secretRow.previous_secret_encrypted && secretRow.previous_secret_valid_until &&
      Date.parse(secretRow.previous_secret_valid_until) > Date.now()) {
    try { valid = verifyZoutiSignature(raw, signature, decrypt(secretRow.previous_secret_encrypted)) }
    catch { /* A corrupt old secret cannot authorize a request. */ }
  }
  if (!valid) {
    return NextResponse.json({ error: 'Assinatura inválida ou expirada.' }, { status: 401 })
  }

  let body: unknown
  try { body = JSON.parse(raw.toString('utf8')) }
  catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }) }
  const event = parseZoutiEvent(body, request.headers, integration.product_id)
  if (!event) return NextResponse.json({ received: true, recorded: false })
  const eligible = integration.pix_automation_enabled && integration.pix_template_name && pixEligible(event, integration.product_id)
  const { error } = await db.from('zouti_events').upsert({
    ...event, integration_id: id, account_id: integration.account_id,
    pix_send_status: eligible ? 'pending' : 'skipped',
  }, { onConflict: 'integration_id,event_id', ignoreDuplicates: true })
  if (error) {
    console.error('[zouti] event insert failed', { integrationId: id, code: error.code })
    return NextResponse.json({ error: 'Falha temporária.' }, { status: 503 })
  }
  if (eligible) {
    const { data: saved, error: findError } = await db.from('zouti_events')
      .select('id').eq('integration_id', id).eq('account_id', integration.account_id)
      .eq('event_id', event.event_id).eq('pix_send_status', 'pending').maybeSingle()
    if (findError) return NextResponse.json({ error: 'Falha temporária.' }, { status: 503 })
    if (saved) await sendZoutiPix(saved.id, integration.account_id, integration.pix_template_name)
  }
  return NextResponse.json({ received: true, recorded: true, product_matched: event.product_matched })
}
