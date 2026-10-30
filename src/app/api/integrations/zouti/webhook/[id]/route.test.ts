import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  seen: new Set<string>(),
}))

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === 'zouti_integrations'
            ? { id: '11111111-1111-4111-8111-111111111111', account_id: 'account-A', product_id: 'prod_A', enabled: true }
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

async function deliver(payload: unknown, opts: { valid?: boolean; eventId?: string; timestamp?: number } = {}) {
  const raw = JSON.stringify(payload)
  const timestamp = opts.timestamp ?? Date.now()
  const signature = createHmac('sha256', opts.valid === false ? 'wrong' : 'test-zouti-secret').update(raw).digest('hex')
  return POST(new Request(`https://example.test/api/integrations/zouti/webhook/${id}`, {
    method: 'POST', body: raw, headers: {
      'x-zouti-signature': `t=${timestamp},v1=${signature}`,
      'x-zouti-event-type': 'PIX_CREATED', 'x-zouti-event-id': opts.eventId ?? 'evt_1',
      'x-zouti-object-id': 'ord_one', 'x-zouti-object-name': 'Order',
    },
  }), { params: Promise.resolve({ id }) })
}

describe('Zouti signed webhook', () => {
  beforeEach(() => { state.inserts.length = 0; state.seen.clear() })

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
})
