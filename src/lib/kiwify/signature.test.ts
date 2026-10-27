import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseApprovedSale, verifyKiwifySignature } from './signature'

describe('Kiwify signature', () => {
  const body = { order_id: 'order-1', nested: { value: 2 } }
  const token = 'private-test-token'
  const signature = createHmac('sha1', token).update(JSON.stringify(body)).digest('hex')

  it('accepts a signed JSON body and rejects tampering or missing signatures', () => {
    expect(verifyKiwifySignature(body, signature, token)).toBe(true)
    expect(verifyKiwifySignature({ ...body, order_id: 'other' }, signature, token)).toBe(false)
    expect(verifyKiwifySignature(body, null, token)).toBe(false)
    expect(verifyKiwifySignature(body, signature, 'wrong-token')).toBe(false)
  })

  it('accepts an unchanged raw JSON body when its byte representation was signed', () => {
    const raw = JSON.stringify(body, null, 2)
    const rawSignature = createHmac('sha1', token).update(raw).digest('hex')
    expect(verifyKiwifySignature(body, rawSignature, token, raw)).toBe(true)
  })
})

describe('Kiwify approved sale', () => {
  it('accepts only a paid approved order and excludes card and identity details', () => {
    const input = {
      webhook_event_type: 'order_approved', order_status: 'paid', order_id: 'order-1',
      Product: { product_id: 'product-1', product_name: 'Produto' },
      Customer: { full_name: 'Cliente', email: 'cliente@example.com', CPF: '000', mobile: '+5511999999999' },
      Commissions: { charge_amount: 5000, currency: 'BRL' },
      card_last4digits: '1234',
    }
    const sale = parseApprovedSale(input)
    expect(sale).toMatchObject({ product_id: 'product-1', amount_cents: 5000, customer_name: 'Cliente' })
    expect(JSON.stringify(sale)).not.toContain('CPF')
    expect(JSON.stringify(sale)).not.toContain('1234')
    expect(parseApprovedSale({ ...input, order_status: 'refunded' })).toBeNull()
    expect(parseApprovedSale({ ...input, webhook_event_type: 'subscription_canceled' })).toBeNull()
  })
})
