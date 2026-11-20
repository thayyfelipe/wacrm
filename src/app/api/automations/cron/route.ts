import { timingSafeEqual } from 'node:crypto'
import { NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { expireAwaitingReplies, resumePendingExecution } from '@/lib/automations/engine'
import type { AutomationContext } from '@/lib/automations/engine'
import { claimBroadcastDelivery, markBroadcastSending, planBroadcastResume, releaseBroadcastDelivery, DELIVERY_LOCK_STALE_MS } from '@/lib/whatsapp/broadcast-resume'
import { deliverBroadcast, finalizeBroadcastStatus } from '@/lib/whatsapp/broadcast-core'

export const maxDuration = 300

async function drainScheduledBroadcasts() {
  const admin = supabaseAdmin()
  const { data: due, error } = await admin.from('broadcasts')
    .select('id, account_id')
    .in('status', ['scheduled', 'sending'])
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString())
    .or(`delivery_locked_at.is.null,delivery_locked_at.lt.${new Date(Date.now() - DELIVERY_LOCK_STALE_MS).toISOString()}`)
    .order('scheduled_at', { ascending: true }).limit(5)
  if (error) throw error
  let claimed = 0
  for (const row of due ?? []) {
    if (!await claimBroadcastDelivery(admin, row.account_id, row.id)) continue
    claimed++
    // Each invocation has a bounded pass. Pending rows remain for the next tick.
    after(async () => {
      try {
        const { plan } = await planBroadcastResume(admin, row.account_id, row.id, 'pending', 30)
        await markBroadcastSending(admin, row.id)
        await deliverBroadcast(admin, plan)
      } catch (err) {
        console.error('[broadcast-cron] delivery failed:', row.id, err)
        await finalizeBroadcastStatus(admin, row.id).catch(() => {})
      } finally {
        await releaseBroadcastDelivery(admin, row.id)
      }
    })
  }
  return claimed
}

/**
 * Drain due `automation_pending_executions` rows. Meant to be hit
 * on a schedule (Vercel Cron / external pinger) — requires a shared
 * secret via the `x-cron-secret` header to match
 * `AUTOMATION_CRON_SECRET`.
 *
 * The claim step (status = 'running') serves as a simple lock so
 * overlapping invocations don't double-process rows. Best-effort
 * only; expensive SELECT ... FOR UPDATE is avoided in favor of a
 * two-step UPDATE-by-id.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Close out wait_for_reply runs whose 24h reply window lapsed. The
  // webhook already refuses to resume them; this just settles their
  // status and explains the outcome on the log.
  const expired = await expireAwaitingReplies()
  const scheduled = await drainScheduledBroadcasts()

  const admin = supabaseAdmin()
  const { data: due, error } = await admin
    .from('automation_pending_executions')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ processed: 0, expired, scheduled })

  let processed = 0
  for (const row of due) {
    const { data: claim } = await admin
      .from('automation_pending_executions')
      .update({ status: 'running' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claim) continue

    await resumePendingExecution({
      id: row.id as string,
      automation_id: row.automation_id as string,
      // account_id is NOT NULL on automation_pending_executions
      // post-017; the engine uses it for tenant-scoped lookups.
      account_id: row.account_id as string,
      user_id: row.user_id as string,
      contact_id: (row.contact_id as string | null) ?? null,
      log_id: (row.log_id as string | null) ?? null,
      parent_step_id: (row.parent_step_id as string | null) ?? null,
      branch: (row.branch as 'yes' | 'no' | null) ?? null,
      next_step_position: row.next_step_position as number,
      context: (row.context as AutomationContext) ?? {},
    })
    processed++
  }

  return NextResponse.json({ processed, expired, scheduled })
}
