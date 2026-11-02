'use client'

import type { SettingsSection } from './settings-sections'

function BrandMark({ brand }: { brand: 'kiwify' | 'zouti' }) {
  const kiwify = brand === 'kiwify'
  const maskId = `${brand}-brand-mask`
  return <svg aria-hidden="true" viewBox={kiwify ? '0 0 674 455' : '0 0 2048 882'} className={kiwify ? 'h-32 w-48 text-primary dark:text-white' : 'h-20 w-44 text-primary dark:text-white'}>
    <defs>
      {kiwify && <filter id="kiwify-background-removal" colorInterpolationFilters="sRGB">
        {/* Green logo differs sharply from the pale green baked into the source PNG. */}
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -2 2 0 0 -0.2" />
      </filter>}
      <mask id={maskId} maskContentUnits="userSpaceOnUse" maskUnits="userSpaceOnUse" style={{ maskType: 'alpha' }} x="0" y="0" width={kiwify ? 674 : 2048} height={kiwify ? 455 : 882}>
        <image href={kiwify ? '/brand/kiwify.png' : '/brand/zouti.png'} width={kiwify ? 674 : 2048} height={kiwify ? 455 : 882} filter={kiwify ? 'url(#kiwify-background-removal)' : undefined} />
      </mask>
    </defs>
    <rect width="100%" height="100%" fill="currentColor" mask={`url(#${maskId})`} />
  </svg>
}

export function IntegrationsPanel({ onSelect }: { onSelect: (section: SettingsSection) => void }) {
  return <section className="space-y-5">
    <div>
      <h2 className="text-xl font-semibold text-foreground">Integrações</h2>
      <p className="mt-1 text-sm text-muted-foreground">Escolha a plataforma para configurar produtos, eventos e mensagens.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <button type="button" onClick={() => onSelect('kiwify')} className="overflow-hidden rounded-3xl border border-border bg-card text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <div className="flex h-32 items-center justify-center bg-background dark:bg-primary">
          <BrandMark brand="kiwify" />
        </div>
        <div className="p-4"><span className="font-semibold">Kiwify</span><p className="mt-1 text-sm text-muted-foreground">Configurar conexão</p></div>
      </button>
      <button type="button" onClick={() => onSelect('zouti')} className="overflow-hidden rounded-3xl border border-border bg-card text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <div className="flex h-32 items-center justify-center bg-background dark:bg-primary">
          <BrandMark brand="zouti" />
        </div>
        <div className="p-4"><span className="font-semibold">Zouti</span><p className="mt-1 text-sm text-muted-foreground">Configurar conexão</p></div>
      </button>
    </div>
  </section>
}
