import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  seen: new Set<string>(),
  pixEnabled: false,
  abandonedEnabled: false,
  claimed: new Set<string>(),
  send: vi.fn(async () => {}),
  abandonedSend: vi.fn(async () => {}),
}))

vi.mock('@/lib/zouti/pix-send', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/zouti/pix-send')>()
  return { ...original, sendZoutiPix: state.send }
})
vi.mock('@/lib/zouti/abandoned-send', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/zouti/abandoned-send')>()
  return { ...original, sendZoutiAbandoned: state.abandonedSend }
})

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Record<string, string> = {}
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { filters[key] = value; return query },
        maybeSingle: async () => ({
          data: table === 'zouti_integrations'
            ? { id: '11111111-1111-4111-8111-111111111111', account_id: 'account-A', product_id: 'prod_A', enabled: true,
                pix_automation_enabled: state.pixEnabled, pix_template_name: 'kiwify_pix_gerado',
                abandoned_automation_enabled: state.abandonedEnabled, abandoned_template_name: 'carrinho_abandonado' }
            : table === 'zouti_events'
              ? state.inserts.find((row) => row.event_id === filters.event_id &&
                  (filters.pix_send_status ? row.pix_send_status === filters.pix_send_status : row.abandoned_send_status === filters.abandoned_send_status) && !state.claimed.has(filters.event_id))
                ? { id: '22222222-2222-4222-8222-222222222222' } : null
              : { secret_encrypted: 'encrypted-secret' },
          error: null,
        }),
        upsert: async (row: Record<string, unknown>, options: { onConflict: string; ignoreDuplicates: boolean }) => {
          expect(options).toEqual({ onConflict: 'integration_id,event_id', ignoreDuplicates: true })
          const key = `${row.integration_id}:${row.event_id}`
          if (!state.seen.has(key)) { state.seen.add(key); state.inserts.push(row) }
          return { error: null }
        },
      }
      return query
    },
  }),
}))
vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: () => 'test-zouti-secret' }))

import { POST } from './route'

const id = '11111111-1111-4111-8111-111111111111'
const body = {
  id: 'ord_one', status: 'AWAITING_PAYMENT',
  items: [{ product_id: 'prod_A', name: 'Produto real' }],
  customer: { name: 'Teste', phone: '5511999999999', document: 'sensitive' },
  payment: { method: 'PIX', pix: { code: 'sensitive' } },
}

async function deliver(payload: { id: string; [key: string]: unknown }, opts: { valid?: boolean; eventId?: string; timestamp?: number; eventType?: string; objectName?: string } = {}) {
  const raw = JSON.stringify(payload)
  const timestamp = opts.timestamp ?? Date.now()
  const signature = createHmac('sha256', opts.valid === false ? 'wrong' : 'test-zouti-secret').update(raw).digest('hex')
  return POST(new Request(`https://example.test/api/integrations/zouti/webhook/${id}`, {
    method: 'POST', body: raw, headers: {
      'x-zouti-signature': `t=${timestamp},v1=${signature}`,
      'x-zouti-event-type': opts.eventType ?? 'PIX_CREATED', 'x-zouti-event-id': opts.eventId ?? 'evt_1',
      'x-zouti-object-id': payload.id, 'x-zouti-object-name': opts.objectName ?? 'Order',
    },
  }), { params: Promise.resolve({ id }) })
}

describe('Zouti signed webhook', () => {
  beforeEach(() => { state.inserts.length = 0; state.seen.clear(); state.claimed.clear(); state.pixEnabled = false; state.abandonedEnabled = false; state.send.mockReset().mockImplementation(async () => {}); state.abandonedSend.mockReset().mockImplementation(async () => {}) })

  it('rejects invalid and expired signatures without writing', async () => {
    expect((await deliver(body, { valid: false })).status).toBe(401)
    expect((await deliver(body, { timestamp: Date.now() - 300_001 })).status).toBe(401)
    expect(state.inserts).toHaveLength(0)
  })

  it('records only metadata for another product, without customer data', async () => {
    const response = await deliver({ ...body, items: [{ product_id: 'prod_other' }] })
    expect(await response.json()).toMatchObject({ recorded: true })
    expect(state.inserts[0]).toMatchObject({ product_matched: false, customer_phone: null, product_id: null })
  })

  it('records one tenant-scoped event and ignores repeated delivery', async () => {
    expect((await deliver(body)).status).toBe(200)
    expect((await deliver(body)).status).toBe(200)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ account_id: 'account-A', event_id: 'evt_1', event_type: 'PIX_CREATED', product_id: 'prod_A' })
    expect(JSON.stringify(state.inserts[0])).not.toMatch(/sensitive/)
  })

  it('opts in only for a real product and does not send twice on repeated delivery', async () => {
    state.pixEnabled = true
    state.send.mockImplementation(async () => { state.claimed.add('evt_1') })
    expect((await deliver(body)).status).toBe(200)
    expect((await deliver(body)).status).toBe(200)
    expect(state.send).toHaveBeenCalledTimes(1)
    expect(state.inserts[0].pix_send_status).toBe('pending')
  })

  it('never sends an unmatched test product even when enabled', async () => {
    state.pixEnabled = true
    expect((await deliver({ ...body, items: [{ product_id: 'prod_fake' }] })).status).toBe(200)
    expect(state.send).not.toHaveBeenCalled()
    expect(state.inserts[0].pix_send_status).toBe('skipped')
  })

  it('sends a matching signed cart event at most once when enabled', async () => {
    state.abandonedEnabled = true
    state.abandonedSend.mockImplementation(async () => { state.claimed.add('evt_cart') })
    const cart = { id: 'ab_c_one', step: 'PAYMENT', items: [{ product_id: 'prod_A', name: 'Curso' }],
      customer: { name: 'Ana', phone: '5511999999999' }, url: 'https://pay.zouti.com.br/infoproduct_cart_token/ab_c_one' }
    const opts = { eventId: 'evt_cart', eventType: 'ABANDONED_CART_CREATED', objectName: 'AbandonedCart' }
    expect((await deliver(cart, opts)).status).toBe(200)
    expect((await deliver(cart, opts)).status).toBe(200)
    expect(state.abandonedSend).toHaveBeenCalledTimes(1)
    expect(state.send).not.toHaveBeenCalled()
    expect(state.inserts[0]).toMatchObject({ abandoned_send_status: 'pending', pix_send_status: 'skipped' })
  })

  it('does not send an abandoned cart from another product', async () => {
    state.abandonedEnabled = true
    const cart = { id: 'ab_c_one', items: [{ product_id: 'other', name: 'Outro' }], customer: { name: 'Ana', phone: '5511999999999' } }
    expect((await deliver(cart, { eventType: 'ABANDONED_CART_CREATED', objectName: 'AbandonedCart' })).status).toBe(200)
    expect(state.abandonedSend).not.toHaveBeenCalled()
    expect(state.inserts[0]).toMatchObject({ abandoned_send_status: 'skipped', customer_phone: null })
  })
})
