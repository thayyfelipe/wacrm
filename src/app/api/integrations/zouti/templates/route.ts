import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { validPixTemplateBody } from '@/lib/zouti/pix-send'

/** Account-scoped list for choosing a Meta-approved message. */
export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const { data, error } = await ctx.supabase.from('message_templates')
      .select('name, language, body_text')
      .eq('account_id', ctx.accountId).eq('status', 'APPROVED').eq('language', 'pt_BR')
      .order('name', { ascending: true })
    if (error) return NextResponse.json({ error: 'Falha ao consultar modelos aprovados.' }, { status: 500 })
    return NextResponse.json({ templates: (data ?? []).map((row) => ({
      name: row.name,
      compatible_with_pix: validPixTemplateBody(row.body_text),
    })) })
  } catch (error) { return toErrorResponse(error) }
}
