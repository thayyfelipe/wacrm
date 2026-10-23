import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPhoneHealth } from './phone-health';

const phoneId = '123456789';
const token = 'secret-test-token';

afterEach(() => vi.unstubAllGlobals());

describe('official WhatsApp phone health', () => {
  it('reads each official field using only the configured phone ID and server token', async () => {
    const fetchMock = vi.fn(async (input: URL, init: RequestInit) => {
      expect(String(input)).toContain(`/${phoneId}?fields=id%2C`);
      expect(init.headers).toEqual({ Authorization: `Bearer ${token}` });
      expect(init.cache).toBe('no-store');
      const field = input.searchParams.get('fields')?.split(',')[1];
      return Response.json({ id: phoneId, [field!]: field === 'status' ? 'CONNECTED' : field === 'quality_rating' ? 'GREEN' : 'TIER_2K' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await readPhoneHealth(phoneId, token);
    expect(result).toMatchObject({ status: 'CONNECTED', quality_rating: 'GREEN', messaging_limit: 'TIER_2K', errors: {} });
    expect(result.checked_at).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps successful indicators when the Meta limit request is denied', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
      const field = input.searchParams.get('fields')?.split(',')[1];
      if (field === 'whatsapp_business_manager_messaging_limit') {
        return Response.json({ error: { code: 10 } }, { status: 403 });
      }
      return Response.json({ id: phoneId, [field!]: field === 'status' ? 'CONNECTED' : 'YELLOW' });
    }));

    const result = await readPhoneHealth(phoneId, token);
    expect(result).toMatchObject({ status: 'CONNECTED', quality_rating: 'YELLOW', messaging_limit: null, errors: { messaging_limit: 'permission' } });
    expect(result.checked_at).toBeTruthy();
  });

  it('never invents a status, quality or limit when fields are missing or from another phone', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
      const field = input.searchParams.get('fields')?.split(',')[1];
      return Response.json({ id: field === 'quality_rating' ? 'different-phone' : phoneId,
        [field!]: field === 'status' ? 'UNKNOWN' : field === 'quality_rating' ? 'GREEN' : 'UNTIERED' });
    }));

    expect(await readPhoneHealth(phoneId, token)).toMatchObject({ status: null, quality_rating: null, messaging_limit: null, checked_at: null });
  });
});
