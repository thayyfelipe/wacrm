"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Activity, Clock3, MessageCircle, MessageCircleReply, MessagesSquare, RefreshCw, UserRoundCheck, UsersRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/paged-query";
import { summarizeWhatsAppActivity, type WhatsAppActivity, type WhatsAppMessageRow } from "@/lib/dashboard/whatsapp-activity";
import { Button } from "@/components/ui/button";

export default function WhatsAppDashboardPage() {
  const t = useTranslations("WhatsAppDashboard");
  const { accountId } = useAuth();
  const [activity, setActivity] = useState<WhatsAppActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!accountId) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    setActivity(null);
    setUpdatedAt(null);
    try {
      const db = createClient();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // The join limits results to the selected company, on top of the RLS
      // policies on messages and conversations. Pages avoid Supabase's 1k cap.
      const rows = await fetchAllPages<WhatsAppMessageRow>((from, to) =>
        db.from("messages")
          .select("conversation_id, sender_type, status, created_at, conversations!inner(account_id)")
          .eq("conversations.account_id", accountId)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (currentRequest !== requestId.current) return;
      setActivity(summarizeWhatsAppActivity(rows));
      setUpdatedAt(new Date());
    } catch (cause) {
      console.error("WhatsApp dashboard query failed", cause);
      if (currentRequest === requestId.current) setError(true);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    const generation = requestId;
    if (accountId) void refresh();
    return () => { generation.current++; };
  }, [accountId, refresh]);

  const metrics = [
    { key: "received", value: activity?.received, icon: MessageCircle },
    { key: "answered", value: activity?.answered, icon: MessageCircleReply },
    { key: "unanswered", value: activity?.unanswered, icon: Clock3 },
    { key: "mentions", value: undefined, icon: MessagesSquare },
    { key: "groups", value: undefined, icon: UsersRound },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">ElooFlow • WhatsApp</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">{t("title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button variant="outline" size="lg" onClick={() => void refresh()} disabled={loading || !accountId}>
          <RefreshCw className={loading ? "animate-spin" : ""} />{t("refresh")}
        </Button>
      </div>

      {error && <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">{t("loadError")}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(({ key, value, icon: Icon }) => (
          <div key={key} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">{t(key)}</p>
              <span className="rounded-2xl bg-primary/10 p-2.5 text-primary"><Icon className="size-5" /></span>
            </div>
            <p className="mt-5 text-3xl font-bold tabular-nums text-foreground">
              {loading ? "…" : value === undefined ? t("unavailable") : value.toLocaleString("pt-BR")}
            </p>
            {(key === "mentions" || key === "groups") && <p className="mt-2 text-xs text-muted-foreground">{t("groupsUnavailable")}</p>}
          </div>
        ))}
      </div>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-primary/10 p-2.5 text-primary"><Activity className="size-5" /></span>
          <div><h3 className="font-semibold text-foreground">{t("productivity")}</h3><p className="text-xs text-muted-foreground">{t("productivityNote")}</p></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ProductivityCell title={t("agentMessages")} value={activity?.agentMessages} loading={loading} />
          <ProductivityCell title={t("automaticMessages")} value={activity?.botMessages} loading={loading} />
          <ProductivityCell title={t("responseTime")} value={activity?.responseMinutes} loading={loading} suffix={t("minutes")} />
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        <UserRoundCheck className="mr-1 inline size-3.5" />{t("methodology")}
        {updatedAt && !error && <> · {t("updatedAt", { date: updatedAt.toLocaleString("pt-BR") })}</>}
      </p>
    </div>
  );
}

function ProductivityCell({ title, value, loading, suffix = "" }: { title: string; value?: number | null; loading: boolean; suffix?: string }) {
  const t = useTranslations("WhatsAppDashboard");
  return (
    <div className="rounded-2xl border border-border bg-card-2 p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
        {loading ? "…" : value == null ? t("unavailable") : `${value.toLocaleString("pt-BR")}${suffix}`}
      </p>
    </div>
  );
}
