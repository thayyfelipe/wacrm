import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase.from('kiwify_sales')
      .select('id, order_ref, product_name, customer_name, customer_email, amount_cents, currency, received_at')
      .eq('account_id', ctx.accountId)
      .order('received_at', { ascending: false })
      .limit(100)
    if (error) return NextResponse.json({ error: 'Falha ao carregar vendas' }, { status: 500 })
    return NextResponse.json({ sales: data })
  } catch (error) { return toErrorResponse(error) }
}
