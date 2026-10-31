'use client'

import Image from 'next/image'
import type { SettingsSection } from './settings-sections'

export function IntegrationsPanel({ onSelect }: { onSelect: (section: SettingsSection) => void }) {
  return <section className="space-y-5">
    <div>
      <h2 className="text-xl font-semibold text-foreground">Integrações</h2>
      <p className="mt-1 text-sm text-muted-foreground">Escolha a plataforma para configurar produtos, eventos e mensagens.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <button type="button" onClick={() => onSelect('kiwify')} className="overflow-hidden rounded-3xl border border-border bg-card text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <div className="relative h-32 bg-[#eaf9ef]">
          <Image src="/brand/kiwify.png" alt="Kiwify" fill sizes="(max-width: 640px) 100vw, 360px" className="object-contain" />
        </div>
        <div className="p-4"><span className="font-semibold">Kiwify</span><p className="mt-1 text-sm text-muted-foreground">Configurar conexão</p></div>
      </button>
      <button type="button" onClick={() => onSelect('zouti')} className="overflow-hidden rounded-3xl border border-border bg-card text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <div className="relative flex h-32 items-center justify-center bg-[#101820]">
          <Image src="/brand/zouti.png" alt="Zouti" width={150} height={65} className="h-16 w-auto object-contain brightness-0 invert" />
        </div>
        <div className="p-4"><span className="font-semibold">Zouti</span><p className="mt-1 text-sm text-muted-foreground">Configurar conexão</p></div>
      </button>
    </div>
  </section>
}
