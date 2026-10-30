'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Integration { id: string; name: string; product_id: string | null; enabled: boolean }
interface Event { id: string; event_type: string; object_name: string; product_name: string | null; product_matched: boolean; status: string | null; received_at: string }

export function ZoutiSettings() {
  const { canEditSettings } = useAuth()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [name, setName] = useState('')
  const [productId, setProductId] = useState('')
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [i, e] = await Promise.all([
      fetch('/api/integrations/zouti', { cache: 'no-store' }),
      fetch('/api/integrations/zouti/events', { cache: 'no-store' }),
    ])
    if (i.ok) { setIntegrations((await i.json()).integrations); setError(null) }
    else setError((await i.json().catch(() => ({}))).error || 'Falha ao carregar conexões da Zouti.')
    if (e.ok) setEvents((await e.json()).events)
  }, [])

  useEffect(() => { void refresh().catch(() => toast.error('Falha ao carregar Zouti')) }, [refresh])

  async function create() {
    setBusy(true)
    try {
      const r = await fetch('/api/integrations/zouti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, product_id: productId }) })
      const payload = await r.json()
      if (!r.ok) throw new Error(payload.error || 'Falha ao criar conexão.')
      setName(''); setProductId(''); await refresh()
      toast.success('URL criada. Configure o webhook na Zouti e depois informe o segredo.')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Falha ao criar conexão.') }
    finally { setBusy(false) }
  }

  async function activate(id: string) {
    setBusy(true)
    try {
      const r = await fetch(`/api/integrations/zouti/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: secrets[id] }) })
      const payload = await r.json()
      if (!r.ok) throw new Error(payload.error || 'Falha ao ativar conexão.')
      setSecrets((current) => ({ ...current, [id]: '' })); await refresh()
      toast.success('Conexão ativa. Faça um teste assinado pela Zouti.')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Falha ao ativar conexão.') }
    finally { setBusy(false) }
  }

  async function deactivate(id: string) {
    setBusy(true)
    try {
      const r = await fetch(`/api/integrations/zouti/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Falha ao desativar conexão.')
      await refresh(); toast.success('Conexão desativada.')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Falha ao desativar conexão.') }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <div><h2 className="text-xl font-semibold text-foreground">Zouti</h2>
      <p className="mt-1 text-sm text-muted-foreground">Receba e confira eventos dos seus produtos. Esta etapa não envia mensagens pelo WhatsApp.</p></div>
    {error && <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">{error}</p>}
    {canEditSettings && <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <h3 className="font-semibold">Conectar webhook da Zouti</h3>
      <p className="text-sm text-muted-foreground">Uma conexão por webhook. Informe o ID do produto para registrar somente eventos dele; deixe vazio se o webhook receber todos os produtos da conta.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input aria-label="Nome da conexão" placeholder="Nome da conexão" value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="ID do produto na Zouti" placeholder="ID do produto (opcional)" value={productId} onChange={(e) => setProductId(e.target.value)} />
      </div>
      <Button disabled={busy || !name.trim()} onClick={() => void create()}>Gerar URL do webhook</Button>
    </section>}
    {integrations.map((integration) => {
      const url = typeof window === 'undefined' ? '' : `${window.location.origin}/api/integrations/zouti/webhook/${integration.id}`
      return <section key={integration.id} className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex justify-between gap-3"><div><h3 className="font-semibold">{integration.name}</h3><p className="text-xs text-muted-foreground">Produto: {integration.product_id || 'Todos os produtos'}</p></div><span className="text-sm text-muted-foreground">{integration.enabled ? 'Ativa' : 'Inativa'}</span></div>
        <div className="flex gap-2"><Input readOnly aria-label="URL do webhook" value={url} /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(url)}>Copiar</Button></div>
        <p className="text-xs text-muted-foreground">Na Zouti, o prefixo https:// já é preenchido: cole somente o restante da URL.</p>
        {canEditSettings && <div className="flex flex-wrap gap-2">
          <Input className="min-w-52 flex-1" type="password" autoComplete="off" aria-label="Segredo do webhook da Zouti" placeholder="Segredo do webhook da Zouti" value={secrets[integration.id] ?? ''} onChange={(e) => setSecrets((current) => ({ ...current, [integration.id]: e.target.value }))} />
          <Button disabled={busy || !secrets[integration.id]?.trim()} onClick={() => void activate(integration.id)}>{integration.enabled ? 'Atualizar segredo' : 'Ativar conexão'}</Button>
          {integration.enabled && <Button variant="outline" disabled={busy} onClick={() => void deactivate(integration.id)}>Desativar</Button>}
        </div>}
      </section>
    })}
    <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Eventos recebidos</h3><Button variant="outline" onClick={() => void refresh()}>Atualizar</Button></div>
      {events.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhum evento recebido.</p> : <div className="mt-3 space-y-2">{events.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm"><span>{event.event_type} · {event.product_matched ? (event.product_name || event.object_name) : 'Produto não corresponde (possível teste)'} · {event.status || 'Sem status'}</span><span className="text-muted-foreground">{new Date(event.received_at).toLocaleString('pt-BR')}</span></div>)}</div>}
    </section>
  </div>
}
