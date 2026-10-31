import { describe, expect, it } from 'vitest'
import { pixEligible, validPixTemplateBody, zoutiInternationalPhone } from './pix-send'
import type { ZoutiEvent } from './webhook'

const event: ZoutiEvent = {
  event_id: 'evt_1', event_type: 'PIX_CREATED', object_id: 'ord_1', object_name: 'Order',
  delivery_id: null, product_id: 'prod_real', product_name: 'Curso', product_matched: true,
  status: 'AWAITING_PAYMENT', customer_name: 'Ana', customer_phone: '5511999999999',
  abandoned_cart_url: null,
}

describe('Zouti Pix eligibility', () => {
  it('requires an explicitly configured, matching product and complete recipient', () => {
    expect(pixEligible(event, 'prod_real')).toBe(true)
    expect(pixEligible(event, null)).toBe(false)
    expect(pixEligible({ ...event, product_matched: false }, 'prod_real')).toBe(false)
    expect(pixEligible({ ...event, product_id: 'prod_sample' }, 'prod_real')).toBe(false)
    expect(pixEligible({ ...event, customer_phone: '11999999999' }, 'prod_real')).toBe(false)
    expect(pixEligible({ ...event, customer_name: null }, 'prod_real')).toBe(false)
    expect(pixEligible({ ...event, status: 'PAID' }, 'prod_real')).toBe(false)
    expect(pixEligible({ ...event, event_type: 'ORDER_PAID' }, 'prod_real')).toBe(false)
  })

  it('accepts only an explicit country code', () => {
    expect(zoutiInternationalPhone('55 (11) 99999-9999')).toBe('+5511999999999')
    expect(zoutiInternationalPhone('+5511999999999')).toBe('+5511999999999')
    expect(zoutiInternationalPhone('+14155550123')).toBe('+14155550123')
    expect(zoutiInternationalPhone('11999999999')).toBeNull()
    expect(zoutiInternationalPhone(null)).toBeNull()
  })

  it('rejects templates with extra body variables', () => {
    expect(validPixTemplateBody('Olá {{1}}, o produto {{2}} espera pagamento.')).toBe(true)
    expect(validPixTemplateBody('{{1}} {{2}} {{3}}')).toBe(false)
  })
})
