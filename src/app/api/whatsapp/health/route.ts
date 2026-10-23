import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { decrypt } from '@/lib/whatsapp/encryption';
import { readPhoneHealth, type PhoneHealth } from '@/lib/whatsapp/phone-health';

export const dynamic = 'force-dynamic';

const empty: PhoneHealth = {
  status: null,
  quality_rating: null,
  messaging_limit: null,
  checked_at: null,
  errors: {},
};

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { data, error } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.phone_number_id || !data.access_token) {
      return NextResponse.json({ ...empty, error: 'Configure o número do WhatsApp para consultar a Meta.' });
    }
    let token: string;
    try {
      token = decrypt(data.access_token);
    } catch {
      return NextResponse.json({ ...empty, error: 'Não foi possível ler o token salvo. Verifique a configuração do WhatsApp.' });
    }
    const result = await readPhoneHealth(data.phone_number_id, token);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
