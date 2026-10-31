'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const ZOUTI_EVENTS = [
  { value: 'PIX_CREATED', label: 'Pix criado' },
  { value: 'ABANDONED_CART', label: 'Carrinho abandonado' },
  { value: 'ORDER_CREATED', label: 'Pedido criado' },
  { value: 'ORDER_UPDATED', label: 'Pedido atualizado' },
  { value: 'ORDER_PAID', label: 'Pedido pago' },
  { value: 'BOLETO_CREATED', label: 'Boleto criado' },
  { value: 'SUBSCRIPTION_CREATED', label: 'Assinatura criada' },
] as const

interface ApprovedTemplate { name: string; compatible_with_pix: boolean }

interface Integration { id: string; name: string; product_id: string | null; enabled: boolean; pix_automation_enabled: boolean; pix_template_name: string | null }
interface Event { id: string; event_type: string; object_name: string; product_name: string | null; product_matched: boolean; status: string | null; received_at: string; pix_send_status: string | null; pix_send_error: string | null }

export function ZoutiSettings() {
  const { canEditSettings } = useAuth()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [name, setName] = useState('')
  const [productId, setProductId] = useState('')
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [pixTemplates, setPixTemplates] = useState<Record<string, string>>({})
  const [selectedEvents, setSelectedEvents] = useState<Record<string, string>>({})
  const [approvedTemplates, setApprovedTemplates] = useState<ApprovedTemplate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [i, e, m] = await Promise.all([
      fetch('/api/integrations/zouti', { cache: 'no-store' }),
      fetch('/api/integrations/zouti/events', { cache: 'no-store' }),
      fetch('/api/integrations/zouti/templates', { cache: 'no-store' }),
    ])
    if (i.ok) { setIntegrations((await i.json()).integrations); setError(null) }
    else setError((await i.json().catch(() => ({}))).error || 'Falha ao carregar conexões da Zouti.')
    if (e.ok) setEvents((await e.json()).events)
    if (m.ok) setApprovedTemplates((await m.json()).templates)
    else setError('Falha ao carregar modelos aprovados. Atualize a página para tentar novamente.')
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

  async function setPix(integration: Integration, enabled: boolean) {
    setBusy(true)
    try {
      const r = await fetch(`/api/integrations/zouti/${integration.id}/pix`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, event_type: 'PIX_CREATED', template_name: pixTemplates[integration.id] ?? integration.pix_template_name }),
      })
      const payload = await r.json()
      if (!r.ok) throw new Error(payload.error || 'Falha ao salvar envio de Pix.')
      await refresh()
      toast.success(enabled ? 'Modelo de Pix salvo para novos eventos.' : 'Envio de Pix desativado.')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Falha ao salvar envio de Pix.') }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <div><h2 className="text-xl font-semibold text-foreground">Zouti</h2>
      <p className="mt-1 text-sm text-muted-foreground">Receba os eventos dos produtos e configure o envio do modelo de Pix criado.</p></div>
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
      const eventType = selectedEvents[integration.id] ?? 'PIX_CREATED'
      const templateName = pixTemplates[integration.id] ?? integration.pix_template_name ?? ''
      const templateReady = approvedTemplates.some((template) => template.name === templateName && template.compatible_with_pix)
      return <section key={integration.id} className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex justify-between gap-3"><div><h3 className="font-semibold">{integration.name}</h3><p className="text-xs text-muted-foreground">Produto: {integration.product_id || 'Todos os produtos'}</p></div><span className="text-sm text-muted-foreground">{integration.enabled ? 'Ativa' : 'Inativa'}</span></div>
        <div className="flex gap-2"><Input readOnly aria-label="URL do webhook" value={url} /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(url)}>Copiar</Button></div>
        <p className="text-xs text-muted-foreground">Na Zouti, o prefixo https:// já é preenchido: cole somente o restante da URL.</p>
        {canEditSettings && <div className="flex flex-wrap gap-2">
          <Input className="min-w-52 flex-1" type="password" autoComplete="off" aria-label="Segredo do webhook da Zouti" placeholder="Segredo do webhook da Zouti" value={secrets[integration.id] ?? ''} onChange={(e) => setSecrets((current) => ({ ...current, [integration.id]: e.target.value }))} />
          <Button disabled={busy || !secrets[integration.id]?.trim()} onClick={() => void activate(integration.id)}>{integration.enabled ? 'Atualizar segredo' : 'Ativar conexão'}</Button>
          {integration.enabled && <Button variant="outline" disabled={busy} onClick={() => void deactivate(integration.id)}>Desativar</Button>}
        </div>}
        <div className="space-y-4 rounded-2xl border border-border p-4">
          <p className="font-medium">Mensagens por evento</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm"><span className="text-muted-foreground">1. Evento da Zouti</span>
              <Select value={eventType} onValueChange={(value) => { if (value) setSelectedEvents((current) => ({ ...current, [integration.id]: value })) }}>
                <SelectTrigger aria-label="Evento da Zouti" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{ZOUTI_EVENTS.map((event) => <SelectItem key={event.value} value={event.value}>{event.label}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            {eventType === 'PIX_CREATED' && <label className="space-y-1.5 text-sm"><span className="text-muted-foreground">2. Modelo aprovado para WhatsApp</span>
              <Select value={templateName || null} onValueChange={(value) => { if (value) setPixTemplates((current) => ({ ...current, [integration.id]: value })) }} disabled={!canEditSettings}>
                <SelectTrigger aria-label="Modelo aprovado" className="w-full"><SelectValue placeholder="Escolha um modelo aprovado" /></SelectTrigger>
                <SelectContent>{approvedTemplates.map((template) => <SelectItem key={template.name} value={template.name} disabled={!template.compatible_with_pix}>{template.name}{!template.compatible_with_pix ? ' · variáveis incompatíveis' : ''}</SelectItem>)}</SelectContent>
              </Select>
            </label>}
          </div>
          {eventType === 'PIX_CREATED' ? <>
            <p className="text-xs text-muted-foreground">Pix criado · {integration.pix_automation_enabled ? 'envio ativo' : 'envio desativado'}. Variáveis exigidas: nome do comprador e nome do produto. Apenas novos eventos são enviados; falhas não geram reenvio automático.</p>
            {approvedTemplates.length === 0 && <p className="text-xs text-muted-foreground">Nenhum modelo pt_BR aprovado nesta conta. Confira os modelos do WhatsApp.</p>}
            {canEditSettings && <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !integration.enabled || !integration.product_id || !templateReady} onClick={() => void setPix(integration, true)}>{integration.pix_automation_enabled ? 'Salvar modelo' : 'Salvar e ativar envio'}</Button>
              {integration.pix_automation_enabled && <Button variant="outline" disabled={busy} onClick={() => void setPix(integration, false)}>Desativar envio</Button>}
            </div>}
          </> : <p className="text-sm text-muted-foreground">O envio automático para este evento ainda não está disponível. A conexão continua registrando os eventos recebidos.</p>}
        </div>
      </section>
    })}
    <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Eventos recebidos</h3><Button variant="outline" onClick={() => void refresh()}>Atualizar</Button></div>
      {events.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhum evento recebido.</p> : <div className="mt-3 space-y-2">{events.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm"><span>{event.event_type} · {event.product_matched ? (event.product_name || event.object_name) : 'Produto não corresponde (possível teste)'} · {event.status || 'Sem status'}{event.pix_send_status && event.pix_send_status !== 'skipped' ? ` · Pix: ${{ pending: 'aguardando', processing: 'processando', sent: 'enviado', failed: 'falhou' }[event.pix_send_status] || event.pix_send_status}` : ''}{event.pix_send_error ? ` · ${event.pix_send_error}` : ''}</span><span className="text-muted-foreground">{new Date(event.received_at).toLocaleString('pt-BR')}</span></div>)}</div>}
    </section>
  </div>
}
