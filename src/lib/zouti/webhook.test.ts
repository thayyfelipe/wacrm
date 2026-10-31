import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseZoutiEvent, verifyZoutiSignature } from './webhook'

const secret = 'test-only-secret'
const now = 1_717_000_000_000
const raw = Buffer.from('{"id":"ord_abc","customer":{"name":"Teste"}}')
function signed(timestamp: number, body = raw) {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(body).digest('hex')}`
}

describe('Zouti webhook authentication', () => {
  it('validates the exact bytes inside the five-minute window', () => {
    expect(verifyZoutiSignature(raw, signed(now), secret, now)).toBe(true)
    expect(verifyZoutiSignature(Buffer.from('{ "id":"ord_abc","customer":{"name":"Teste"}}'), signed(now), secret, now)).toBe(false)
    expect(verifyZoutiSignature(raw, signed(now), 'another-secret', now)).toBe(false)
  })

  it('rejects expired, future, malformed and missing signatures', () => {
    expect(verifyZoutiSignature(raw, signed(now - 300_001), secret, now)).toBe(false)
    expect(verifyZoutiSignature(raw, signed(now + 300_001), secret, now)).toBe(false)
    expect(verifyZoutiSignature(raw, null, secret, now)).toBe(false)
    expect(verifyZoutiSignature(raw, `t=oops,v1=${'a'.repeat(64)}`, secret, now)).toBe(false)
  })
})

const pix = {
  id: 'ord_abc', status: 'AWAITING_PAYMENT',
  items: [{ product_id: 'prod_one', name: 'Produto A' }, { product_id: 'prod_two', name: 'Produto B' }],
  customer: { name: 'Cliente de teste', phone: '5511999999999', document: 'not-stored' },
  payment: { method: 'PIX', pix: { code: 'not-stored' } },
}
function headers(type = 'PIX_CREATED', objectId = 'ord_abc', objectName = 'Order') {
  return new Headers({
    'x-zouti-event-id': 'evt_1', 'x-zouti-event-type': type,
    'x-zouti-object-id': objectId, 'x-zouti-object-name': objectName,
  })
}

describe('Zouti event mapping', () => {
  it('recognizes signed Pix metadata and scopes by configured product', () => {
    const event = parseZoutiEvent(pix, headers(), 'prod_two')
    expect(event).toMatchObject({ event_type: 'PIX_CREATED', object_id: 'ord_abc', product_id: 'prod_two', status: 'AWAITING_PAYMENT' })
    expect(event).not.toHaveProperty('pix_code')
    expect(event).not.toHaveProperty('document')
  })

  it('rejects another product, mismatched object id and incorrect Pix state', () => {
    expect(parseZoutiEvent(pix, headers(), 'prod_other')).toMatchObject({ product_matched: false, customer_name: null, customer_phone: null, product_id: null })
    expect(parseZoutiEvent(pix, headers('PIX_CREATED', 'ord_different'), null)).toBeNull()
    expect(parseZoutiEvent({ ...pix, status: 'PAID' }, headers(), null)).toBeNull()
  })

  it('extracts only matching abandoned cart details and a verified Zouti link', () => {
    const cart = {
      id: 'ab_c_123', step: 'PAYMENT', url: 'https://pay.zouti.com.br/infoproduct_cart_token/ab_c_123',
      items: [{ product_id: 'prod_one', name: 'Produto A' }],
      customer: { name: 'Ana', phone: '5511999999999', document: 'secret', email: 'private@example.com' },
    }
    const event = parseZoutiEvent(cart, headers('ABANDONED_CART_CREATED', 'ab_c_123', 'AbandonedCart'), 'prod_one')
    expect(event).toMatchObject({ status: 'PAYMENT', product_id: 'prod_one', abandoned_cart_url: cart.url })
    expect(JSON.stringify(event)).not.toMatch(/secret|private@example.com/)
    const mismatched = parseZoutiEvent(cart, headers('ABANDONED_CART_CREATED', 'ab_c_123', 'AbandonedCart'), 'other')
    expect(mismatched).toMatchObject({ product_matched: false, customer_phone: null, abandoned_cart_url: null })
    expect(parseZoutiEvent({ ...cart, url: 'https://evil.example/cart' }, headers('ABANDONED_CART_CREATED', 'ab_c_123', 'AbandonedCart'), 'prod_one')?.abandoned_cart_url).toBeNull()
    expect(parseZoutiEvent(cart, headers('ABANDONED_CART_CREATED', 'ab_c_123', 'Order'), 'prod_one')).toBeNull()
  })
})
