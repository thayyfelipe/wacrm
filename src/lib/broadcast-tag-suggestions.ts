import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/supabase/paged-query';

export function previousAudienceTagIds(filters: readonly unknown[], availableIds: ReadonlySet<string>): string[] {
  const ids = new Set<string>();
  for (const value of filters) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const filter = value as Record<string, unknown>;
    // Only the tags explicitly chosen as the audience, never excluded tags
    // or the current tags of contacts who happened to receive a message.
    if (filter.type !== 'tags' || !Array.isArray(filter.tagIds)) continue;
    for (const id of filter.tagIds) {
      if (typeof id === 'string' && availableIds.has(id)) ids.add(id);
    }
  }
  return [...ids];
}

/** Read-only, account-scoped suggestions. No contact exclusion or tag mutation. */
export async function loadPreviousAudienceTagIds(db: SupabaseClient, accountId: string): Promise<string[]> {
  const [tags, recipients] = await Promise.all([
    fetchAllPages<{ id: string }>((from, to) => db.from('tags').select('id')
      .eq('account_id', accountId).order('id').range(from, to)),
    fetchAllPages<{ broadcasts: { audience_filter: unknown } | { audience_filter: unknown }[] | null }>((from, to) => db.from('broadcast_recipients')
      .select('id, broadcasts!inner(audience_filter, account_id)')
      .eq('broadcasts.account_id', accountId)
      .or('status.in.(sent,delivered,read,replied),whatsapp_message_id.not.is.null')
      .order('id').range(from, to)),
  ]);
  return previousAudienceTagIds(recipients.flatMap((row) => {
    const parents = Array.isArray(row.broadcasts) ? row.broadcasts : row.broadcasts ? [row.broadcasts] : [];
    return parents.map((parent) => parent.audience_filter);
  }), new Set(tags.map((tag) => tag.id)));
}
