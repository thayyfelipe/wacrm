import { MetaApiError } from './meta-api';

// Keep this read-only endpoint independent from the existing send/registration
// client. The portfolio limit field replaces the legacy messaging_limit_tier.
const PHONE_URL = 'https://graph.facebook.com/v26.0';

export type PhoneHealth = {
  status: string | null;
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | null;
  messaging_limit: string | null;
  checked_at: string | null;
  errors: Partial<Record<'status' | 'quality_rating' | 'messaging_limit', 'auth' | 'permission' | 'unavailable'>>;
};

type Field = 'status' | 'quality_rating' | 'whatsapp_business_manager_messaging_limit';

async function readField(phoneNumberId: string, accessToken: string, field: Field): Promise<unknown> {
  const url = new URL(`${PHONE_URL}/${encodeURIComponent(phoneNumberId)}`);
  url.searchParams.set('fields', `id,${field}`);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as {
      error?: { code?: number; error_subcode?: number };
    };
    throw new MetaApiError('Não foi possível consultar a Meta.', {
      httpStatus: response.status,
      code: payload.error?.code,
      subcode: payload.error?.error_subcode,
    });
  }
  const payload = await response.json() as Record<string, unknown>;
  // A successful response for a different object must not be used as
  // evidence about the phone number configured for this account.
  if (payload.id !== phoneNumberId) return null;
  return payload[field];
}

function reason(error: unknown): 'auth' | 'permission' | 'unavailable' {
  if (error instanceof MetaApiError) {
    if (error.code === 190 || error.httpStatus === 401) return 'auth';
    if (error.code === 10 || error.code === 200 || error.httpStatus === 403) return 'permission';
  }
  return 'unavailable';
}

export async function readPhoneHealth(phoneNumberId: string, accessToken: string): Promise<PhoneHealth> {
  const fields: Field[] = ['status', 'quality_rating', 'whatsapp_business_manager_messaging_limit'];
  const results = await Promise.allSettled(fields.map((field) => readField(phoneNumberId, accessToken, field)));
  const errors: PhoneHealth['errors'] = {};
  const values: unknown[] = results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const key = index === 2 ? 'messaging_limit' : fields[index] as 'status' | 'quality_rating';
    errors[key] = reason(result.reason);
    return null;
  });

  const status = values[0] === 'CONNECTED' || values[0] === 'DISCONNECTED' || values[0] === 'PENDING'
    ? values[0] : null;
  const quality = values[1] === 'GREEN' || values[1] === 'YELLOW' || values[1] === 'RED'
    ? values[1] : null;
  // Only a tier explicitly returned by Meta can be displayed. The UI
  // formats this official code; it never substitutes a guessed tier.
  const tier = typeof values[2] === 'string' &&
    (/^TIER_\d+(K|M)?$/.test(values[2]) || values[2] === 'TIER_UNLIMITED')
    ? values[2] : null;

  return {
    status,
    quality_rating: quality,
    messaging_limit: tier,
    checked_at: status || quality || tier ? new Date().toISOString() : null,
    errors,
  };
}
