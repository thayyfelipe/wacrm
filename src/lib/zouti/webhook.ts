import { createHmac, timingSafeEqual } from 'node:crypto'

const WINDOW_MS = 5 * 60 * 1000

/** Zouti signs the exact request bytes, not a re-serialized JSON object. */
export function verifyZoutiSignature(
  rawBody: Buffer,
  signature: string | null,
  secret: string,
  now = Date.now(),
): boolean {
  if (!secret || !signature) return false
  const match = /^t=(\d{13}),v1=([0-9a-f]{64})$/i.exec(signature)
  if (!match) return false
  const timestamp = Number(match[1])
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > WINDOW_MS) return false
  const received = Buffer.from(match[2], 'hex')
  const expected = createHmac('sha256', secret).update(rawBody).digest()
  return timingSafeEqual(received, expected)
}

export interface ZoutiEvent {
  event_id: string
  event_type: string
  object_id: string
  object_name: string
  delivery_id: string | null
  product_id: string | null
  product_name: string | null
  product_matched: boolean
  status: string | null
  customer_name: string | null
  customer_phone: string | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function optional(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.length <= 300 ? value.trim() : null
}

function header(headers: Headers, name: string): string | null {
  return optional(headers.get(name))
}

/** Select only minimal fields for the event log. No Pix code or document is saved. */
export function parseZoutiEvent(body: unknown, headers: Headers, expectedProductId: string | null): ZoutiEvent | null {
  const root = record(body)
  const eventId = header(headers, 'x-zouti-event-id')
  const eventType = header(headers, 'x-zouti-event-type')
  const objectId = header(headers, 'x-zouti-object-id')
  const objectName = header(headers, 'x-zouti-object-name')
  if (!eventId || !eventType || !objectId || !objectName || objectId !== root.id) return null
  if (!/^[A-Z_]{3,70}$/.test(eventType) || !['Order', 'Payment', 'Subscription', 'AbandonedCart', 'SmartInstallment', 'RefundRequest'].includes(objectName)) return null
  const items = Array.isArray(root.items) ? root.items : Array.isArray(root.line_items) ? root.line_items : Array.isArray(root.products) ? root.products : []
  const products = items.map(record)
  const chosen = expectedProductId
    ? products.find((item) => item.product_id === expectedProductId)
    : products[0]
  const matched = !expectedProductId || Boolean(chosen)
  // Payment/Subscription events can refer to the order via order_id.
  // Their products must still be verified against the configured product.
  const payment = record(root.payment)
  if (eventType === 'PIX_CREATED' &&
      (objectName !== 'Order' || root.status !== 'AWAITING_PAYMENT' || payment.method !== 'PIX')) return null
  const customer = record(root.customer)
  return {
    event_id: eventId,
    event_type: eventType,
    object_id: objectId,
    object_name: objectName,
    delivery_id: header(headers, 'x-zouti-webhook-delivery-id'),
    product_id: matched ? optional(chosen?.product_id) : null,
    product_name: matched ? optional(chosen?.name) : null,
    product_matched: matched,
    status: optional(root.status),
    customer_name: matched ? optional(customer.name) : null,
    customer_phone: matched ? optional(customer.phone) : null,
  }
}
