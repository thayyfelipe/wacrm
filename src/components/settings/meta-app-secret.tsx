'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function MetaAppSecret({ accountId }: { accountId: string }) {
  const [configured, setConfigured] = useState(false)
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/whatsapp/app-secret', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível consultar o App Secret.')
      const payload = await response.json()
      if (active) setConfigured(payload.configured)
    }).catch(() => { if (active) toast.error('Não foi possível consultar o App Secret.') })
    return () => { active = false }
  }, [accountId])

  async function save() {
    setBusy(true)
    try {
      const response = await fetch('/api/whatsapp/app-secret', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) })
      if (!response.ok) throw new Error((await response.json()).error || 'Falha ao salvar App Secret.')
      setConfigured(true)
      setSecret('')
      toast.success('App Secret salvo para esta conta.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao salvar App Secret.') }
    finally { setBusy(false) }
  }

  return <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
    <h3 className="font-semibold">App Secret da Meta</h3>
    <p className="text-sm text-muted-foreground">{configured ? 'Configurado para esta conta. Informe um novo segredo somente para substituí-lo.' : 'Informe o App Secret do aplicativo Meta deste cliente. Ele não será exibido novamente.'}</p>
    <div className="flex flex-wrap gap-2"><Input type="password" autoComplete="new-password" aria-label="App Secret da Meta" placeholder="App Secret" value={secret} onChange={(event) => setSecret(event.target.value)} className="min-w-48 flex-1" />
      <Button disabled={busy || !secret.trim()} onClick={() => void save()}>{configured ? 'Atualizar segredo' : 'Salvar segredo'}</Button></div>
  </div>
}
