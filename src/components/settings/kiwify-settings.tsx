'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Integration {
  id: string
  name: string
  product_id: string
  enabled: boolean
}
interface Sale {
  id: string
  order_ref: string | null
  product_name: string | null
  customer_name: string | null
  customer_email: string | null
  amount_cents: number | null
  currency: string | null
  received_at: string
}
interface KiwifyEvent {
  id: string
  event_type: string
  order_id: string | null
  product_name: string | null
  order_status: string | null
  product_matched: boolean
  received_at: string
}

export function KiwifySettings() {
  const { canEditSettings } = useAuth()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [events, setEvents] = useState<KiwifyEvent[]>([])
  const [eventsPage, setEventsPage] = useState(1)
  const [eventsTotal, setEventsTotal] = useState(0)
  const [name, setName] = useState('')
  const [productId, setProductId] = useState('')
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadEvents = useCallback(async (page: number) => {
    const response = await fetch(`/api/integrations/kiwify/events?page=${page}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('Falha ao carregar eventos da Kiwify')
    const result = await response.json()
    setEvents(result.events)
    setEventsTotal(result.pagination.total)
  }, [])

  const refresh = useCallback(async () => {
    const [integrationResponse, salesResponse] = await Promise.all([
      fetch('/api/integrations/kiwify', { cache: 'no-store' }),
      fetch('/api/integrations/kiwify/sales', { cache: 'no-store' }),
    ])
    if (integrationResponse.ok) {
      setIntegrations((await integrationResponse.json()).integrations)
      setLoadError(null)
    } else {
      const payload = await integrationResponse.json().catch(() => ({}))
      setLoadError(payload.error || 'Falha ao carregar as conexões da Kiwify')
    }
    if (salesResponse.ok) setSales((await salesResponse.json()).sales)
  }, [])

  useEffect(() => { void refresh().catch(() => toast.error('Falha ao carregar Kiwify')) }, [refresh])
  useEffect(() => { void loadEvents(eventsPage).catch(() => toast.error('Falha ao carregar eventos da Kiwify')) }, [eventsPage, loadEvents])

  async function create() {
    setBusy(true)
    try {
      const response = await fetch('/api/integrations/kiwify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, product_id: productId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Falha ao criar conexão')
      setName('')
      setProductId('')
      await refresh()
      toast.success('URL criada. Cadastre-a no webhook da Kiwify e depois informe o token.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao criar conexão') }
    finally { setBusy(false) }
  }

  async function saveToken(id: string) {
    setBusy(true)
    try {
      const response = await fetch(`/api/integrations/kiwify/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokens[id] }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Falha ao ativar conexão')
      setTokens((current) => ({ ...current, [id]: '' }))
      await refresh()
      toast.success('Conexão ativa')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao ativar conexão') }
    finally { setBusy(false) }
  }

  async function deactivate(id: string) {
    setBusy(true)
    try {
      const response = await fetch(`/api/integrations/kiwify/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Falha ao desativar conexão')
      await refresh()
      toast.success('Conexão desativada')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao desativar conexão') }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <div>
      <h2 className="text-xl font-semibold text-foreground">Kiwify</h2>
      <p className="mt-1 text-sm text-muted-foreground">Receba as compras aprovadas dos seus produtos nesta conta do ElooFlow.</p>
    </div>
    {loadError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">{loadError}</p>}
    {canEditSettings && <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-semibold text-foreground">Conectar um produto</h3>
      <p className="text-sm text-muted-foreground">Encontre o ID na URL de edição do produto na Kiwify. Crie uma conexão por produto.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input aria-label="Nome do produto" placeholder="Nome do produto" value={name} onChange={(event) => setName(event.target.value)} />
        <Input aria-label="ID do produto na Kiwify" placeholder="ID do produto na Kiwify" value={productId} onChange={(event) => setProductId(event.target.value)} />
      </div>
      <Button disabled={busy || !name.trim() || !productId.trim()} onClick={() => void create()}>Gerar URL do webhook</Button>
    </section>}
    {integrations.map((integration) => {
      const url = typeof window === 'undefined' ? '' : `${window.location.origin}/api/integrations/kiwify/webhook/${integration.id}`
      return <section key={integration.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex flex-wrap justify-between gap-3">
          <div><h3 className="font-semibold text-foreground">{integration.name}</h3><p className="text-xs text-muted-foreground">Produto: {integration.product_id}</p></div>
          <span className="text-sm text-muted-foreground">{integration.enabled ? 'Ativa' : 'Inativa'}</span>
        </div>
        <div className="flex gap-2"><Input readOnly aria-label="URL do webhook" value={url} /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(url)}>Copiar</Button></div>
        {canEditSettings && <div className="flex flex-wrap gap-2">
          <Input className="min-w-52 flex-1" type="password" autoComplete="off" aria-label="Token do webhook da Kiwify" placeholder="Token do webhook da Kiwify" value={tokens[integration.id] ?? ''} onChange={(event) => setTokens((current) => ({ ...current, [integration.id]: event.target.value }))} />
          <Button disabled={busy || !(tokens[integration.id]?.trim())} onClick={() => void saveToken(integration.id)}>{integration.enabled ? 'Atualizar token' : 'Ativar conexão'}</Button>
          {integration.enabled && <Button variant="outline" disabled={busy} onClick={() => void deactivate(integration.id)}>Desativar</Button>}
        </div>}
      </section>
    })}
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-foreground">Eventos recebidos</h3><Button variant="outline" onClick={() => void loadEvents(eventsPage).catch(() => toast.error('Falha ao atualizar eventos'))}>Atualizar</Button></div>
      {events.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhum evento recebido.</p> : <div className="mt-3 space-y-2">{events.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm"><span>{event.event_type} · {event.product_matched ? (event.product_name || 'Produto configurado') : 'Produto não corresponde (possível teste)'} · {event.order_status || 'Sem status'}{event.order_id ? ` · ${event.order_id}` : ''}</span><span className="text-muted-foreground">{new Date(event.received_at).toLocaleString('pt-BR')}</span></div>)}</div>}
      {eventsTotal > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm text-muted-foreground"><span>Exibindo {(eventsPage - 1) * 10 + 1}–{Math.min(eventsPage * 10, eventsTotal)} de {eventsTotal} eventos</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={eventsPage === 1} onClick={() => setEventsPage((page) => page - 1)}>Anterior</Button><span>Página {eventsPage} de {Math.ceil(eventsTotal / 10)}</span><Button variant="outline" size="sm" disabled={eventsPage >= Math.ceil(eventsTotal / 10)} onClick={() => setEventsPage((page) => page + 1)}>Próxima</Button></div></div>}
    </section>
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold text-foreground">Compras aprovadas</h3>
      {sales.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhuma compra recebida.</p> : <div className="mt-3 space-y-3">
        {sales.map((sale) => <div key={sale.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
          <div><p className="font-medium text-foreground">{sale.product_name || 'Produto'}</p><p className="text-muted-foreground">{sale.customer_name || sale.customer_email || 'Comprador indisponível'} · {sale.order_ref || 'Pedido sem referência'}</p></div>
          <div className="text-right"><p className="font-medium text-foreground">{sale.amount_cents != null && sale.currency ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: sale.currency }).format(sale.amount_cents / 100) : 'Valor indisponível'}</p><p className="text-muted-foreground">{new Date(sale.received_at).toLocaleString('pt-BR')}</p></div>
        </div>)}
      </div>}
    </section>
  </div>
}
