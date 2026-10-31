import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { encrypt } from '@/lib/whatsapp/encryption'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  try {
    const { accountId } = await requireRole('admin')
    const { data, error } = await admin().from('meta_app_secrets').select('account_id').eq('account_id', accountId).maybeSingle()
    if (error) throw error
    return NextResponse.json({ configured: Boolean(data) })
  } catch (error) { return toErrorResponse(error) }
}

export async function PUT(request: Request) {
  try {
    const { accountId } = await requireRole('admin')
    const body = await request.json().catch(() => null)
    const secret = body?.secret
    if (typeof secret !== 'string' || !secret.trim() || secret.length > 1024 || secret.includes(',')) {
      return NextResponse.json({ error: 'Informe um App Secret válido.' }, { status: 400 })
    }
    const { error } = await admin().from('meta_app_secrets').upsert({ account_id: accountId, encrypted_secret: encrypt(secret.trim()), updated_at: new Date().toISOString() })
    if (error) throw error
    return NextResponse.json({ configured: true })
  } catch (error) { return toErrorResponse(error) }
}

export async function DELETE() {
  try {
    const { accountId } = await requireRole('admin')
    const { error } = await admin().from('meta_app_secrets').delete().eq('account_id', accountId)
    if (error) throw error
    return NextResponse.json({ configured: false })
  } catch (error) { return toErrorResponse(error) }
}
