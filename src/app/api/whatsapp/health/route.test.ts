import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  decrypt: vi.fn(),
  readPhoneHealth: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: (error: { status?: number }) => Response.json({ error: 'Falha' }, { status: error.status ?? 500 }),
}));
vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: mocks.decrypt }));
vi.mock('@/lib/whatsapp/phone-health', () => ({ readPhoneHealth: mocks.readPhoneHealth }));

import { GET } from './route';

const accountId = 'owned-account';
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentAccount.mockResolvedValue({ accountId, supabase: { from } });
  mocks.decrypt.mockReturnValue('server-only-token');
  mocks.readPhoneHealth.mockResolvedValue({ status: 'CONNECTED', quality_rating: 'GREEN', messaging_limit: null, checked_at: '2026-10-23T00:00:00Z', errors: {} });
  maybeSingle.mockResolvedValue({ data: { phone_number_id: '123', access_token: 'encrypted' }, error: null });
});

describe('GET /api/whatsapp/health', () => {
  it('scopes the token lookup to the authenticated account and never returns the token', async () => {
    const response = await GET();
    expect(from).toHaveBeenCalledWith('whatsapp_config');
    expect(eq).toHaveBeenCalledWith('account_id', accountId);
    expect(mocks.readPhoneHealth).toHaveBeenCalledWith('123', 'server-only-token');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ status: 'CONNECTED', messaging_limit: null });
    expect(JSON.stringify(await GET().then(r => r.json()))).not.toContain('token');
  });

  it('does not consult Meta without an existing phone configuration', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await GET();
    expect(mocks.readPhoneHealth).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ status: null, quality_rating: null, messaging_limit: null, checked_at: null });
  });

  it('rejects an unauthenticated caller before reading configuration', async () => {
    mocks.getCurrentAccount.mockRejectedValue({ status: 401 });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});
