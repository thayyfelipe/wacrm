import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ configs: [] as Array<{ account_id: string; phone_number_id: string; waba_id: string }>, saved: null as { encrypted_secret: string } | null }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => ({
  select: () => table === 'whatsapp_config'
    ? { or: async () => ({ data: state.configs, error: null }) }
    : { eq: () => ({ maybeSingle: async () => ({ data: state.saved, error: null }) }) },
}) }) }))
vi.mock('./encryption', () => ({ decrypt: (value: string) => value }))

import { verifyAccountWebhookSignature } from './account-webhook-signature'

function signed(raw: string, secret: string) {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
}

describe('Meta webhook account secret routing', () => {
  beforeEach(() => {
    state.configs = [{ account_id: 'A', phone_number_id: '111', waba_id: '222' }]
    state.saved = { encrypted_secret: 'secret-A' }
  })
  const entries = [{ id: '222', changes: [{ value: { metadata: { phone_number_id: '111' } } }] }]
  it('accepts only the owner account secret', async () => {
    expect(await verifyAccountWebhookSignature('{}', signed('{}', 'secret-A'), entries)).toBe(true)
    expect(await verifyAccountWebhookSignature('{}', signed('{}', 'other-secret'), entries)).toBe(false)
  })
  it('rejects mismatched WABA and mixed accounts before processing', async () => {
    expect(await verifyAccountWebhookSignature('{}', signed('{}', 'secret-A'), [{ ...entries[0], id: '333' }])).toBe(false)
    state.configs.push({ account_id: 'B', phone_number_id: '333', waba_id: '444' })
    const mixed = [...entries, { id: '444', changes: [{ value: { metadata: { phone_number_id: '333' } } }] }]
    expect(await verifyAccountWebhookSignature('{}', signed('{}', 'secret-A'), mixed)).toBe(false)
  })
  it('rejects IDs with query syntax and missing signatures', async () => {
    expect(await verifyAccountWebhookSignature('{}', signed('{}', 'secret-A'), [{ ...entries[0], id: '222),account_id.eq.A' }])).toBe(false)
    expect(await verifyAccountWebhookSignature('{}', null, entries)).toBe(false)
  })
})
