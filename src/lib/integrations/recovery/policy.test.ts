import { describe, expect, it } from 'vitest'
import { applyRecoveryEvent, decideRecovery, emptyRecoveryCase } from './policy'
import type { PaymentVerification, PurchaseScope, RecoveryCase, RecoveryEvent, RecoverySettings } from './policy'

const scope: PurchaseScope = { accountId: 'account-A', provider: 'zouti', merchantId: 'merchant-A', productId: 'product-A', purchaseId: 'session-A' }
const start = 1_800_000_000_000
const due = start + 30 * 60_000
const settings: RecoverySettings = { pixEnabled: true, cartEnabled: true, pixWaitMinutes: 30, cartWaitMinutes: 5 }
const event = (type: RecoveryEvent['type'], eventId: string = type, occurredAt = start): RecoveryEvent => ({ scope, type, eventId, occurredAt })
const pix = (): RecoveryCase => applyRecoveryEvent(emptyRecoveryCase(scope), event('pix_created'))
const proof = (state: PaymentVerification['state'] = 'pending'): PaymentVerification => ({ scope, state, source: 'provider_api', checkedAt: due })

describe('Shared recovery policy across providers', () => {
  it('waits until the exact configured deadline, then requires a current verification', () => {
    expect(decideRecovery(pix(), settings, due - 1, null, false)).toEqual({ action: 'wait', dueAt: due })
    expect(decideRecovery(pix(), settings, due, null, false)).toEqual({ action: 'hold', reason: 'verification_required' })
    expect(decideRecovery(pix(), settings, due, proof(), false)).toMatchObject({ action: 'send', kind: 'pix' })
  })
  it('does not move the deadline on a webhook retry or a second event for the same Pix', () => {
    const first = pix()
    expect(applyRecoveryEvent(first, event('pix_created'))).toBe(first)
    const second = applyRecoveryEvent(first, event('pix_created', 'retry-with-new-event-id', start + 60_000))
    expect(second.pixCreatedAt).toBe(start)
  })
  it('does not reopen a paid purchase when an older Pix event arrives afterwards', () => {
    const paid = applyRecoveryEvent(emptyRecoveryCase(scope), event('payment_paid', 'paid', start + 10_000))
    const latePix = applyRecoveryEvent(paid, event('pix_created'))
    expect(decideRecovery(latePix, settings, due, proof(), false)).toEqual({ action: 'cancel', reason: 'paid' })
  })
  it.each(['paid', 'canceled', 'refunded', 'disputed'] as const)('cancels when verification returns %s', (state) => {
    expect(decideRecovery(pix(), settings, due, proof(state), false)).toEqual({ action: 'cancel', reason: state })
  })
  it('gives Pix priority regardless of the order Pix and cart events arrive', () => {
    const cartThenPix = applyRecoveryEvent(applyRecoveryEvent(emptyRecoveryCase(scope), event('cart_abandoned')), event('pix_created'))
    const pixThenCart = applyRecoveryEvent(pix(), event('cart_abandoned'))
    for (const current of [cartThenPix, pixThenCart]) {
      expect(decideRecovery(current, settings, start + 5 * 60_000, null, false)).toEqual({ action: 'wait', dueAt: due })
      expect(decideRecovery(current, settings, due, proof(), false)).toMatchObject({ action: 'send', kind: 'pix' })
    }
  })
  it('does not fall back to a second cart message after a Pix attempt or ambiguous timeout', () => {
    for (const dispatch of ['reserved', 'accepted', 'ambiguous', 'failed'] as const) {
      const current = applyRecoveryEvent({ ...pix(), dispatch }, event('cart_abandoned'))
      expect(decideRecovery(current, settings, due, proof(), false)).toEqual({ action: 'skip', reason: 'already_attempted' })
    }
  })
  it('suppresses a second recovery contact for the same buyer/product guard', () => {
    expect(decideRecovery(pix(), settings, due, proof(), true)).toEqual({ action: 'skip', reason: 'recent_contact' })
  })
  it('rejects verification from another tenant, merchant, product or purchase', () => {
    for (const key of ['accountId', 'merchantId', 'productId', 'purchaseId', 'provider'] as const) {
      const wrong = { ...proof(), scope: { ...scope, [key]: 'other' } }
      expect(decideRecovery(pix(), settings, due, wrong, false)).toEqual({ action: 'hold', reason: 'verification_required' })
    }
  })
  it('rejects stale, unknown or future status checks', () => {
    for (const verification of [proof('unknown'), { ...proof(), checkedAt: due - 1 }, { ...proof(), checkedAt: due + 1 }]) {
      expect(decideRecovery(pix(), settings, due, verification, false)).toEqual({ action: 'hold', reason: 'verification_required' })
    }
    expect(decideRecovery(pix(), settings, due + 60_001, proof(), false)).toEqual({ action: 'hold', reason: 'verification_required' })
  })
  it('does not confuse buyer identity with a purchase identifier', () => {
    expect(decideRecovery({ ...pix(), scope: { ...scope, purchaseId: '' } }, settings, due, proof(), false)).toEqual({ action: 'hold', reason: 'missing_correlation' })
    expect(() => applyRecoveryEvent(pix(), { ...event('payment_paid'), scope: { ...scope, accountId: 'B' } })).toThrow()
  })
  it('uses identical rules for Kiwify and future providers', () => {
    for (const provider of ['kiwify', 'future-provider']) {
      const current = { ...pix(), scope: { ...scope, provider } }
      expect(decideRecovery(current, settings, due, { ...proof(), scope: current.scope }, false)).toMatchObject({ action: 'send', kind: 'pix' })
    }
  })
  it('requires a valid explicit waiting time instead of a platform default', () => {
    expect(decideRecovery(pix(), { ...settings, pixWaitMinutes: 0 }, due, proof(), false)).toEqual({ action: 'hold', reason: 'invalid_configuration' })
  })
})
