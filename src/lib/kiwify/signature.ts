import { createHmac, timingSafeEqual } from 'node:crypto'

/** Kiwify's checkout webhook uses the `signature` URL parameter. */
export function verifyKiwifySignature(
  body: unknown,
  signature: string | null,
  token: string,
  rawBody?: string,
): boolean {
  if (!signature || !/^[a-f\d]{40}$/i.test(signature) || !token) return false
  const received = Buffer.from(signature, 'hex')
  const variants = [JSON.stringify(body), ...(rawBody ? [rawBody] : [])]
  return variants.some((value) => timingSafeEqual(
    createHmac('sha1', token).update(value).digest(), received,
  ))
}

export interface ApprovedKiwifySale {
  order_id: string
  order_ref: string | null
  product_id: string
  product_name: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  amount_cents: number | null
  currency: string | null
  subscription_id: string | null
}

export interface KiwifyOrderEvent {
  event_type: 'pix_created' | 'order_approved'
  order_id: string
  order_ref: string | null
  product_id: string
  product_name: string | null
  customer_name: string | null
  customer_phone: string | null
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Only official order events with the expected payment state are actionable. */
export function parseKiwifyOrderEvent(payload: unknown): KiwifyOrderEvent | null {
  const root = object(payload)
  const kind = root.webhook_event_type
  const approved = kind === 'order_approved' && root.order_status === 'paid'
  const pix = kind === 'pix_created' && root.order_status === 'waiting_payment' && root.payment_method === 'pix'
  if (!approved && !pix) return null
  const orderId = optionalString(root.order_id)
  const product = object(root.Product)
  const productId = optionalString(product.product_id)
  if (!orderId || orderId.length > 200 || !productId) return null
  const customer = object(root.Customer)
  return {
    event_type: approved ? 'order_approved' : 'pix_created',
    order_id: orderId,
    order_ref: optionalString(root.order_ref),
    product_id: productId,
    product_name: optionalString(product.product_name),
    customer_name: optionalString(customer.full_name),
    customer_phone: optionalString(customer.mobile),
  }
}

/** Return null for test shapes or events that must not create a paid sale. */
export function parseApprovedSale(payload: unknown): ApprovedKiwifySale | null {
  const root = object(payload)
  if (root.webhook_event_type !== 'order_approved' || root.order_status !== 'paid') return null
  const product = object(root.Product)
  const orderId = optionalString(root.order_id)
  const productId = optionalString(product.product_id)
  if (!orderId || !productId) return null
  const customer = object(root.Customer)
  const commissions = object(root.Commissions)
  const amount = commissions.charge_amount
  const rawCurrency = optionalString(commissions.currency) ?? optionalString(commissions.product_base_price_currency)
  return {
    order_id: orderId,
    order_ref: optionalString(root.order_ref),
    product_id: productId,
    product_name: optionalString(product.product_name),
    customer_name: optionalString(customer.full_name),
    customer_email: optionalString(customer.email),
    customer_phone: optionalString(customer.mobile),
    amount_cents: typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 ? amount : null,
    currency: rawCurrency && /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null,
    subscription_id: optionalString(root.subscription_id),
  }
}
