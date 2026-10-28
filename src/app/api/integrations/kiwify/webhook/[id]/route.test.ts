import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  seen: new Set<string>(),
}))

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === 'kiwify_integrations'
            ? { id: '11111111-1111-4111-8111-111111111111', account_id: 'account-A', product_id: 'product-A', enabled: true }
            : { token_encrypted: 'encrypted-token' },
          error: null,
        }),
        upsert: async (row: Record<string, unknown>, options: { onConflict: string; ignoreDuplicates: boolean }) => {
          expect(options.ignoreDuplicates).toBe(true)
          const key = `${table}:${row.account_id}:${row.order_id}:${row.event_type ?? ''}`
          if (!state.seen.has(key)) {
            state.seen.add(key)
            state.inserts.push({ table, row })
          }
          return { error: null }
        },
      }
      return query
    },
  }),
}))
vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: () => 'test-webhook-token' }))

import { POST } from './route'

const id = '11111111-1111-4111-8111-111111111111'
const sale = {
  webhook_event_type: 'order_approved', order_status: 'paid', order_id: 'order-1',
  Product: { product_id: 'product-A', product_name: 'Produto' },
  Customer: { full_name: 'Cliente', email: 'cliente@example.com', CPF: '000' },
  Commissions: { charge_amount: 5000, currency: 'BRL' },
  card_last4digits: '1234',
}

async function send(payload: unknown, signed = true) {
  const raw = JSON.stringify(payload)
  const signature = signed
    ? createHmac('sha1', 'test-webhook-token').update(raw).digest('hex')
    : '0'.repeat(40)
  return POST(new Request(`https://example.test/api/integrations/kiwify/webhook/${id}?signature=${signature}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw,
  }), { params: Promise.resolve({ id }) })
}

describe('Kiwify webhook tenant and sale guards', () => {
  beforeEach(() => { state.inserts.length = 0; state.seen.clear() })

  it('rejects invalid signatures before any write', async () => {
    expect((await send(sale, false)).status).toBe(401)
    expect(state.inserts).toHaveLength(0)
  })

  it('acknowledges Kiwify example products without recording a false sale', async () => {
    const response = await send({ ...sale, Product: { product_id: 'other' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ recorded: false })
    expect(state.inserts).toHaveLength(0)
  })

  it('stamps the integration account, omits card/CPF and ignores a duplicate delivery', async () => {
    expect((await send(sale)).status).toBe(200)
    expect((await send(sale)).status).toBe(200)
    expect(state.inserts).toHaveLength(2)
    expect(state.inserts.map((i) => i.table)).toEqual(['kiwify_sales', 'kiwify_order_events'])
    expect(state.inserts[1].row).toMatchObject({ account_id: 'account-A', product_id: 'product-A', order_id: 'order-1', event_type: 'order_approved' })
    expect(JSON.stringify(state.inserts[0])).not.toMatch(/CPF|1234/)
  })

  it('records a pending Pix once without writing a sale or sending a message', async () => {
    const pix = { ...sale, webhook_event_type: 'pix_created', order_status: 'waiting_payment', payment_method: 'pix' }
    const first = await send(pix)
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ received: true, recorded: false, event_recorded: true })
    expect((await send(pix)).status).toBe(200)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].table).toBe('kiwify_order_events')
    expect(state.inserts[0].row.event_type).toBe('pix_created')
  })

  it('does not interpret an arbitrary waiting order as a Pix event', async () => {
    expect((await send({ ...sale, webhook_event_type: 'pix_created', order_status: 'paid', payment_method: 'pix' })).status).toBe(200)
    expect(state.inserts).toHaveLength(0)
  })

  it('keeps the Pix and approval as distinct events for one order', async () => {
    await send({ ...sale, webhook_event_type: 'pix_created', order_status: 'waiting_payment', payment_method: 'pix' })
    await send(sale)
    expect(state.inserts.map((i) => i.table)).toEqual([
      'kiwify_order_events', 'kiwify_sales', 'kiwify_order_events',
    ])
  })
})
