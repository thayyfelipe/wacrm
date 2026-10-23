'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PhoneHealth } from '@/lib/whatsapp/phone-health';

const unavailable = { status: null, quality_rating: null, messaging_limit: null, checked_at: null, errors: {} } satisfies PhoneHealth;

function displayLimit(tier: string | null): string | null {
  if (!tier) return null;
  if (tier === 'TIER_UNLIMITED') return 'Ilimitado';
  const match = /^TIER_(\d+)(K|M)?$/.exec(tier);
  if (!match) return null;
  const size = Number(match[1]) * (match[2] === 'K' ? 1_000 : match[2] === 'M' ? 1_000_000 : 1);
  return new Intl.NumberFormat('pt-BR').format(size);
}

export function WhatsAppHealth({ accountId, configured }: { accountId: string; configured: boolean }) {
  const t = useTranslations('Settings.whatsapp.health');
  const [data, setData] = useState<PhoneHealth>(unavailable);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    setData(unavailable);
    try {
      const response = await fetch('/api/whatsapp/health', { cache: 'no-store', signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(t('requestFailed'));
      if (signal?.aborted) return;
      setData(payload as PhoneHealth);
      if (payload.error) setError(payload.error);
      else if (!payload.checked_at) {
        const reasons = Object.values(payload.errors ?? {});
        setError(reasons.includes('auth') ? t('authError') : reasons.includes('permission') ? t('permissionError') : t('requestFailed'));
      } else if (Object.values(payload.errors ?? {}).includes('auth')) {
        setError(t('authError'));
      } else if (Object.values(payload.errors ?? {}).includes('permission')) {
        setError(t('partialPermission'));
      }
    } catch {
      if (signal?.aborted) return;
      setData(unavailable);
      setError(t('requestFailed'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!configured) {
      return;
    }
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [accountId, configured, refresh]);

  const statusLabels: Record<string, string> = {
    CONNECTED: t('connected'),
    DISCONNECTED: t('disconnected'),
    PENDING: t('pending'),
  };
  const status = data.status ? statusLabels[data.status] : null;
  const quality = data.quality_rating === 'GREEN' ? t('high')
    : data.quality_rating === 'YELLOW' ? t('medium')
      : data.quality_rating === 'RED' ? t('low') : null;
  const qualityColor = data.quality_rating === 'GREEN' ? 'text-emerald-600 dark:text-emerald-400'
    : data.quality_rating === 'YELLOW' ? 'text-amber-700 dark:text-amber-400'
      : data.quality_rating === 'RED' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-foreground"><Activity className="size-5 text-primary" />{t('title')}</CardTitle>
        <Button variant="outline" size="sm" className="border-border bg-transparent text-foreground" onClick={() => void refresh()} disabled={!configured || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {t('refresh')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/40 p-4"><p className="text-xs text-muted-foreground">{t('status')}</p><p className="mt-2 font-semibold text-foreground">{status ?? t('unavailable')}</p></div>
          <div className="rounded-lg border border-border bg-muted/40 p-4"><p className="text-xs text-muted-foreground">{t('quality')}</p><p className={`mt-2 font-semibold ${qualityColor}`}>{quality ?? t('unavailable')}</p></div>
          <div className="rounded-lg border border-border bg-muted/40 p-4"><p className="text-xs text-muted-foreground">{t('limit')}</p><p className="mt-2 font-semibold text-foreground">{displayLimit(data.messaging_limit) ?? t('unavailable')}</p><p className="text-xs text-muted-foreground">{t('limitDescription')}</p></div>
        </div>
        <p className="text-xs text-muted-foreground">{t('lastChecked')}: {data.checked_at ? new Date(data.checked_at).toLocaleString('pt-BR') : t('unavailable')}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">{t('source')}</p>
      </CardContent>
    </Card>
  );
}
