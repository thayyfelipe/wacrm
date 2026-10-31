import { createClient } from '@supabase/supabase-js'
import { decrypt } from './encryption'
import { signatureMatches, verifyMetaWebhookSignature } from './webhook-signature'

type Entry = { id?: string; changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }

/** Never trust the payload's account routing until its HMAC and asset ownership both match. */
export async function verifyAccountWebhookSignature(raw: string, signature: string | null, entries: Entry[]): Promise<boolean> {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature) || !Array.isArray(entries) || !entries.length) return false
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const phoneIds = [...new Set(entries.flatMap((e) => (e.changes ?? []).map((c) => c.value?.metadata?.phone_number_id).filter((id): id is string => Boolean(id))))]
  const wabaIds = [...new Set(entries.map((e) => e.id).filter((id): id is string => Boolean(id)))]
  if (!phoneIds.length && !wabaIds.length) return false
  if ([...phoneIds, ...wabaIds].some((id) => !/^\d{1,30}$/.test(id))) return false
  const filters = [phoneIds.length ? `phone_number_id.in.(${phoneIds.join(',')})` : null, wabaIds.length ? `waba_id.in.(${wabaIds.join(',')})` : null].filter(Boolean).join(',')
  const { data: configs, error: configError } = await db.from('whatsapp_config').select('account_id, phone_number_id, waba_id').or(filters)
  if (configError) throw configError
  const owners = new Set<string>()
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const phoneId = change.value?.metadata?.phone_number_id
      const matching = (configs ?? []).filter((row) => phoneId ? row.phone_number_id === phoneId && (!row.waba_id || row.waba_id === entry.id) : row.waba_id === entry.id)
      if (matching.length !== 1) return false
      owners.add(matching[0].account_id)
    }
  }
  if (owners.size !== 1) return false
  const accountId = [...owners][0]
  const { data: saved, error } = await db.from('meta_app_secrets').select('encrypted_secret').eq('account_id', accountId).maybeSingle()
  if (error) throw error
  if (saved) return signatureMatches(raw, signature, decrypt(saved.encrypted_secret))
  // Existing accounts keep working until their App Secret is entered in the panel.
  return verifyMetaWebhookSignature(raw, signature)
}
