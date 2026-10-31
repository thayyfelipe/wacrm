import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadPreviousAudienceTagIds, previousAudienceTagIds } from './broadcast-tag-suggestions';

describe('previous audience tag suggestions', () => {
  it('suggests only tags explicitly used as audience, not recipient tags or excluded tags', () => {
    expect(previousAudienceTagIds([
      { type: 'tags', tagIds: ['lote1', 'lote2'], excludeTagIds: ['blocked'] },
      { type: 'tags', tagIds: ['lote2', 'deleted'] },
      { type: 'all', tagIds: ['other'] },
      { type: 'csv', excludeTagIds: ['blocked'] },
      null, 'malformed', { type: 'tags', tagIds: [123] },
    ], new Set(['lote1', 'lote2', 'blocked', 'other']))).toEqual(['lote1', 'lote2']);
  });

  it('does not create a global contact exclusion when there is no tag history', () => {
    expect(previousAudienceTagIds([{ type: 'all' }, { type: 'csv' }], new Set(['blocked']))).toEqual([]);
  });

  it('paginates history and explicitly scopes both queries to the current account', async () => {
    const history = Array.from({ length: 2501 }, (_, i) => ({ broadcasts: { audience_filter: { type: 'tags', tagIds: [i === 2500 ? 'last-page' : 'first-page'] } } }));
    const scopes: string[] = [];
    const db = { from(table: string) {
      let start = 0, end = 0;
      const query = {
        select() { return query; },
        eq(column: string, value: string) { scopes.push(`${table}:${column}:${value}`); return query; },
        or(value: string) { expect(value).toBe('status.in.(sent,delivered,read,replied),whatsapp_message_id.not.is.null'); return query; },
        order() { return query; },
        range(from: number, to: number) { start = from; end = to; return query; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: (table === 'tags' ? [{ id: 'first-page' }, { id: 'last-page' }] : history).slice(start, end + 1), error: null })); },
      };
      return query;
    } } as unknown as SupabaseClient;
    expect(await loadPreviousAudienceTagIds(db, 'account-A')).toEqual(['first-page', 'last-page']);
    expect(scopes).toContain('tags:account_id:account-A');
    expect(scopes.filter((scope) => scope === 'broadcast_recipients:broadcasts.account_id:account-A').length).toBeGreaterThan(1);
  });
});
