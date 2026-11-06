"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CONVERSATION_SELECT, normalizeConversations } from "@/lib/inbox/conversations";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { ContactSidebar } from "@/components/inbox/contact-sidebar";
import type { Conversation, Message } from "@/types";

export default function TrackingPage() {
  const { accountId } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    createClient().from("conversations").select(CONVERSATION_SELECT).eq("account_id", accountId)
      .order("last_message_at", { ascending: false }).limit(100)
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) setError("Não foi possível carregar as conversas.");
        else setConversations(normalizeConversations(data ?? []));
      });
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    if (!selected || !accountId) return;
    let cancelled = false;
    createClient().from("messages").select("*")
      .eq("conversation_id", selected.id).order("created_at", { ascending: false }).limit(100)
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) setError("Não foi possível carregar as mensagens.");
        else setMessages(((data ?? []) as Message[]).reverse());
      });
    return () => { cancelled = true; };
  }, [selected, accountId]);

  const visible = conversations.filter((conversation) => {
    const contact = conversation.contact;
    return `${contact?.name ?? ''} ${contact ? contactHandle(contact) : ''}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-0 flex-col gap-4">
      <div><h1 className="text-2xl font-semibold">Rastreamento</h1><p className="text-sm text-muted-foreground">Conversas e dados de origem recebidos para esta conta.</p></div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="w-64 shrink-0 overflow-y-auto border-r border-border sm:w-72">
          <div className="sticky top-0 bg-card p-3"><input aria-label="Buscar conversa" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou número" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
          {visible.map((conversation) => <button key={conversation.id} type="button" onClick={() => { setSelected(conversation); setMessages([]); }} className={`block w-full border-b border-border px-3 py-3 text-left hover:bg-muted ${selected?.id === conversation.id ? 'bg-muted' : ''}`}>
            <strong className="block truncate text-sm">{conversation.contact?.name || (conversation.contact ? contactHandle(conversation.contact) : 'Contato')}</strong>
            <span className="block truncate text-xs text-muted-foreground">{conversation.last_message_text || 'Sem prévia'}</span>
          </button>)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? <><div className="flex items-center justify-between border-b border-border p-3"><strong className="truncate">{selected.contact?.name || 'Conversa'}</strong><Link href={`/inbox?c=${selected.id}`} className="text-xs text-primary">Abrir na Caixa de entrada</Link></div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-background p-4">{messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${message.sender_type === 'customer' ? 'bg-card' : 'ml-auto bg-primary text-primary-foreground'}`}>{message.content_text || `[${message.content_type}]`}</div>)}</div></> : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Selecione uma conversa</div>}
        </div>
        <div className="hidden w-70 shrink-0 lg:block"><ContactSidebar contact={selected?.contact ?? null} conversationId={selected?.id ?? null} tracking /></div>
      </div>
      {selected && <div className="h-[45vh] lg:hidden"><ContactSidebar contact={selected.contact ?? null} conversationId={selected.id} tracking /></div>}
    </div>
  );
}
