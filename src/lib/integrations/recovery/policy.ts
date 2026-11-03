/** Shared business rules. Provider adapters must not override these decisions. */
export type RecoveryKind = 'pix' | 'cart'
export type PurchaseState = 'unknown' | 'pending' | 'paid' | 'canceled' | 'refunded' | 'disputed'
export type DispatchState = 'waiting' | 'reserved' | 'accepted' | 'ambiguous' | 'failed'

export interface PurchaseScope {
  accountId: string
  provider: string
  merchantId: string
  productId: string
  /** Stable purchase/session identifier; never a buyer name or phone number. */
  purchaseId: string
}

export interface RecoveryEvent {
  scope: PurchaseScope
  eventId: string
  /** Timestamp provided by the platform, not the webhook retry arrival time. */
  occurredAt: number
  type: 'pix_created' | 'cart_abandoned' | 'payment_pending' | 'payment_paid' | 'purchase_canceled' | 'payment_refunded' | 'payment_disputed'
}

export interface RecoveryCase {
  scope: PurchaseScope
  eventIds: string[]
  state: PurchaseState
  pixCreatedAt: number | null
  cartAbandonedAt: number | null
  dispatch: DispatchState
  /** Incremented on every new event; used by storage to reject stale send claims. */
  revision: number
}

export interface RecoverySettings {
  pixEnabled: boolean
  cartEnabled: boolean
  pixWaitMinutes: number
  cartWaitMinutes: number
}

export interface PaymentVerification {
  scope: PurchaseScope
  /** Absence of a paid webhook is never a payment verification. */
  source: 'provider_api'
  checkedAt: number
  state: PurchaseState
}

export type Decision =
  | { action: 'cancel'; reason: 'paid' | 'canceled' | 'refunded' | 'disputed' }
  | { action: 'skip'; reason: 'disabled' | 'already_attempted' | 'recent_contact' }
  | { action: 'wait'; dueAt: number }
  | { action: 'hold'; reason: 'invalid_configuration' | 'missing_correlation' | 'verification_required' }
  | { action: 'send'; kind: RecoveryKind; dueAt: number; revision: number }

export function sameScope(a: PurchaseScope, b: PurchaseScope): boolean {
  return a.accountId === b.accountId && a.provider === b.provider &&
    a.merchantId === b.merchantId && a.productId === b.productId && a.purchaseId === b.purchaseId
}

export function validScope(scope: PurchaseScope): boolean {
  return Object.values(scope).every((part) => typeof part === 'string' && part.trim().length > 0)
}

export function emptyRecoveryCase(scope: PurchaseScope): RecoveryCase {
  return { scope, eventIds: [], state: 'unknown', pixCreatedAt: null, cartAbandonedAt: null, dispatch: 'waiting', revision: 0 }
}

/** Terminal states never reopen because a delayed pending/Pix webhook arrives. */
export function applyRecoveryEvent(current: RecoveryCase, event: RecoveryEvent): RecoveryCase {
  if (!sameScope(current.scope, event.scope)) throw new Error('Escopo do evento não corresponde à compra.')
  if (!event.eventId || !Number.isSafeInteger(event.occurredAt) || event.occurredAt < 0) throw new Error('Evento inválido.')
  if (current.eventIds.includes(event.eventId)) return current
  const next = { ...current, eventIds: [...current.eventIds, event.eventId], revision: current.revision + 1 }
  const terminal: Partial<Record<RecoveryEvent['type'], PurchaseState>> = {
    payment_paid: 'paid', purchase_canceled: 'canceled', payment_refunded: 'refunded', payment_disputed: 'disputed',
  }
  // Refund/dispute retain their meaning even if an old paid webhook is replayed later.
  if (terminal[event.type]) {
    if (!['refunded', 'disputed'].includes(current.state) || ['payment_refunded', 'payment_disputed'].includes(event.type)) {
      next.state = terminal[event.type]!
    }
  } else if (current.state === 'unknown' || current.state === 'pending') {
    if (event.type === 'payment_pending' || event.type === 'pix_created') next.state = 'pending'
  }
  if (event.type === 'pix_created') next.pixCreatedAt = Math.min(current.pixCreatedAt ?? event.occurredAt, event.occurredAt)
  if (event.type === 'cart_abandoned') next.cartAbandonedAt = Math.min(current.cartAbandonedAt ?? event.occurredAt, event.occurredAt)
  return next
}

const MINUTE = 60_000
const MAX_VERIFICATION_AGE = 60_000

/** A buyer/product guard is separate from order correlation: it prevents repeated recovery contact. */
export function decideRecovery(
  current: RecoveryCase,
  settings: RecoverySettings,
  now: number,
  verification: PaymentVerification | null,
  recentlyContacted: boolean,
): Decision {
  if (['paid', 'canceled', 'refunded', 'disputed'].includes(current.state)) {
    return { action: 'cancel', reason: current.state as 'paid' | 'canceled' | 'refunded' | 'disputed' }
  }
  if (current.dispatch !== 'waiting') return { action: 'skip', reason: 'already_attempted' }
  if (!validScope(current.scope)) return { action: 'hold', reason: 'missing_correlation' }
  // Pix takes precedence over a cart event for the same checkout, even when Pix is disabled.
  // Disabling Pix must not silently enable a cart fallback for that Pix checkout.
  const kind: RecoveryKind | null = current.pixCreatedAt !== null ? 'pix' : current.cartAbandonedAt !== null ? 'cart' : null
  if (!kind || !(kind === 'pix' ? settings.pixEnabled : settings.cartEnabled)) return { action: 'skip', reason: 'disabled' }
  const delay = kind === 'pix' ? settings.pixWaitMinutes : settings.cartWaitMinutes
  if (!Number.isSafeInteger(delay) || delay < 1 || delay > 1440 || !Number.isSafeInteger(now)) return { action: 'hold', reason: 'invalid_configuration' }
  const start = kind === 'pix' ? current.pixCreatedAt! : current.cartAbandonedAt!
  const dueAt = start + delay * MINUTE
  if (now < dueAt) return { action: 'wait', dueAt }
  if (recentlyContacted) return { action: 'skip', reason: 'recent_contact' }
  if (!verification || !sameScope(current.scope, verification.scope) ||
      verification.source !== 'provider_api' ||
      !Number.isSafeInteger(verification.checkedAt) || verification.checkedAt < dueAt ||
      verification.checkedAt > now || now - verification.checkedAt > MAX_VERIFICATION_AGE ||
      verification.state === 'unknown') {
    return { action: 'hold', reason: 'verification_required' }
  }
  if (verification.state !== 'pending') return { action: 'cancel', reason: verification.state }
  return { action: 'send', kind, dueAt, revision: current.revision }
}
