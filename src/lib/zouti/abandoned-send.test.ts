import { describe, expect, it } from 'vitest'
import { abandonedEligible, abandonedTemplateVariables } from './abandoned-send'
import type { ZoutiEvent } from './webhook'

const event: ZoutiEvent = {
  event_id: 'evt_cart', event_type: 'ABANDONED_CART_CREATED', object_id: 'ab_c_1',
  object_name: 'AbandonedCart', delivery_id: null, product_id: 'prod_real',
  product_name: 'Curso', product_matched: true, status: 'PAYMENT',
  customer_name: 'Ana', customer_phone: '5511999999999', abandoned_cart_url: null,
}

describe('Zouti abandoned cart eligibility', () => {
  it('requires an exact configured product and a reachable recipient', () => {
    expect(abandonedEligible(event, 'prod_real')).toBe(true)
    expect(abandonedEligible(event, null)).toBe(false)
    expect(abandonedEligible({ ...event, product_matched: false }, 'prod_real')).toBe(false)
    expect(abandonedEligible({ ...event, customer_phone: null }, 'prod_real')).toBe(false)
    expect(abandonedEligible({ ...event, event_type: 'PIX_CREATED' }, 'prod_real')).toBe(false)
  })
  it('accepts two body variables or an optional verified cart link as the third', () => {
    expect(abandonedTemplateVariables('Olá {{1}}, você viu {{2}}.')).toBe(2)
    expect(abandonedTemplateVariables('Olá {{1}}, {{2}}: {{3}}')).toBe(3)
    expect(abandonedTemplateVariables('{{1}} {{2}} {{4}}')).toBeNull()
    expect(abandonedTemplateVariables('{{1}}')).toBeNull()
  })
})
