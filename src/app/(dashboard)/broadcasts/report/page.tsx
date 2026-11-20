'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Loader2, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchAllPages } from '@/lib/supabase/paged-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Broadcast, Tag } from '@/types';

const STATUS_LABELS: Record<Broadcast['status'], string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  sending: 'Enviando',
  sent: 'Concluído',
  failed: 'Falhou',
};

const PAGE_SIZE = 25;
const number = (value: number | null | undefined) =>
  (value ?? 0).toLocaleString('pt-BR');
const date = (value: string) => new Date(value).toLocaleString('pt-BR');
const rate = (value: number, total: number) =>
  total ? `${Math.round((value / total) * 100)}%` : '—';

function csvCell(value: string | number) {
  const text = String(value);
  // Spreadsheet programs interpret cells beginning with these characters as formulas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export default function BroadcastReportPage() {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [template, setTemplate] = useState('');
  const [tagId, setTagId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [rows, tagRows] = await Promise.all([
        fetchAllPages<Broadcast>((start, end) =>
          supabase
            .from('broadcasts')
            .select('*')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(start, end)
        ),
        fetchAllPages<Tag>((start, end) =>
          supabase
            .from('tags')
            .select('id,name,color,user_id,created_at')
            .order('name')
            .order('id')
            .range(start, end)
        ),
      ]);
      setBroadcasts(rows);
      setTags(tagRows);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar o relatório.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const templates = useMemo(
    () =>
      [
        ...new Set(broadcasts.map((b) => b.template_name).filter(Boolean)),
      ].sort(),
    [broadcasts]
  );
  const filtered = useMemo(
    () =>
      broadcasts.filter((b) => {
        const created = new Date(b.created_at).getTime();
        if (from && created < new Date(`${from}T00:00:00`).getTime())
          return false;
        if (to && created > new Date(`${to}T23:59:59.999`).getTime())
          return false;
        if (status && b.status !== status) return false;
        if (template && b.template_name !== template) return false;
        if (
          tagId &&
          !(
            Array.isArray(b.audience_filter?.tagIds) &&
            b.audience_filter.tagIds.includes(tagId)
          )
        )
          return false;
        if (
          search &&
          !b.name
            .toLocaleLowerCase('pt-BR')
            .includes(search.trim().toLocaleLowerCase('pt-BR'))
        )
          return false;
        return true;
      }),
    [broadcasts, from, to, status, template, tagId, search]
  );

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, b) => {
          acc.recipients += b.total_recipients ?? 0;
          acc.sent += b.sent_count ?? 0;
          acc.delivered += b.delivered_count ?? 0;
          acc.read += b.read_count ?? 0;
          acc.replied += b.replied_count ?? 0;
          acc.failed += b.failed_count ?? 0;
          return acc;
        },
        { recipients: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 }
      ),
    [filtered]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(
    (Math.min(page, pages) - 1) * PAGE_SIZE,
    Math.min(page, pages) * PAGE_SIZE
  );
  const update = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  function exportCsv() {
    const header = [
      'Disparo',
      'Criado em',
      'Modelo',
      'Status',
      'Destinatários',
      'Enviados',
      'Entregues',
      'Lidos',
      'Responderam',
      'Falhas',
      'Taxa de entrega',
      'Taxa de leitura',
      'Taxa de resposta',
    ];
    const rows = filtered.map((b) => [
      b.name,
      date(b.created_at),
      b.template_name,
      STATUS_LABELS[b.status],
      b.total_recipients ?? 0,
      b.sent_count ?? 0,
      b.delivered_count ?? 0,
      b.read_count ?? 0,
      b.replied_count ?? 0,
      b.failed_count ?? 0,
      rate(b.delivered_count ?? 0, b.sent_count ?? 0),
      rate(b.read_count ?? 0, b.sent_count ?? 0),
      rate(b.replied_count ?? 0, b.sent_count ?? 0),
    ]);
    const content =
      '\uFEFF' +
      [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(
      new Blob([content], { type: 'text/csv;charset=utf-8' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatorio-disparos-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Voltar aos disparos"
            onClick={() => router.push('/broadcasts')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Relatório geral de disparos</h1>
            <p className="text-muted-foreground text-sm">
              Resultados consolidados dos disparos da conta.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={loading || !filtered.length}
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="border-border bg-card grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="text-muted-foreground space-y-1 text-xs">
          De (criação)
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => update(setFrom)(e.target.value)}
          />
        </label>
        <label className="text-muted-foreground space-y-1 text-xs">
          Até (criação)
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => update(setTo)(e.target.value)}
          />
        </label>
        <label className="text-muted-foreground space-y-1 text-xs">
          Status
          <select
            className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm"
            value={status}
            onChange={(e) => update(setStatus)(e.target.value)}
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-muted-foreground space-y-1 text-xs">
          Modelo
          <select
            className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm"
            value={template}
            onChange={(e) => update(setTemplate)(e.target.value)}
          >
            <option value="">Todos</option>
            {templates.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-muted-foreground space-y-1 text-xs">
          Tag selecionada no público
          <select
            className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm"
            value={tagId}
            onChange={(e) => update(setTagId)(e.target.value)}
          >
            <option value="">Todas</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-muted-foreground space-y-1 text-xs">
          Nome do disparo
          <Input
            value={search}
            placeholder="Buscar nome ou lote"
            onChange={(e) => update(setSearch)(e.target.value)}
          />
        </label>
      </div>
      {tagId && (
        <p className="text-muted-foreground text-xs">
          O filtro de tag considera a seleção do público salva no disparo.
          Disparos por CSV e por outras regras não entram nesse filtro.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="border-destructive text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      )}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {(
              [
                ['Disparos', filtered.length],
                ['Destinatários', totals.recipients],
                ['Enviados', totals.sent],
                ['Entregues', totals.delivered],
                ['Lidos', totals.read],
                ['Responderam', totals.replied],
                ['Falhas', totals.failed],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="border-border bg-card rounded-xl border p-4"
              >
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {number(value)}
                </p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            Entrega: {rate(totals.delivered, totals.sent)} · Leitura:{' '}
            {rate(totals.read, totals.sent)} · Resposta:{' '}
            {rate(totals.replied, totals.sent)}. As taxas usam mensagens
            enviadas como base; os estágios são cumulativos. Os totais somam
            cada disparo: um contato em duas campanhas conta duas vezes.
          </p>
          <div className="border-border bg-card overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-border bg-muted/30 text-muted-foreground border-b text-xs">
                <tr>
                  {[
                    'Disparo',
                    'Criado em',
                    'Modelo',
                    'Status',
                    'Destinatários',
                    'Enviados',
                    'Entregues',
                    'Lidos',
                    'Respostas',
                    'Falhas',
                  ].map((label) => (
                    <th key={label} className="px-3 py-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => (
                  <tr
                    key={b.id}
                    className="border-border hover:bg-muted/50 cursor-pointer border-b last:border-0"
                    onClick={() => router.push(`/broadcasts/${b.id}`)}
                  >
                    <td className="px-3 py-3 font-medium">{b.name}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {date(b.created_at)}
                    </td>
                    <td className="px-3 py-3">{b.template_name}</td>
                    <td className="px-3 py-3">
                      {STATUS_LABELS[b.status] ?? b.status}
                    </td>
                    {[
                      b.total_recipients,
                      b.sent_count,
                      b.delivered_count,
                      b.read_count,
                      b.replied_count,
                      b.failed_count,
                    ].map((count, index) => (
                      <td key={index} className="px-3 py-3 tabular-nums">
                        {number(count)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="text-muted-foreground p-8 text-center text-sm">
                Nenhum disparo encontrado para estes filtros.
              </p>
            )}
          </div>
          <div className="text-muted-foreground flex items-center justify-between text-sm">
            <span>
              {number(filtered.length)} disparos · {PAGE_SIZE} por página
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span>
                Página {Math.min(page, pages)} de {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
