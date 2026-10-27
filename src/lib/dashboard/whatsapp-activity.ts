export interface WhatsAppMessageRow {
  conversation_id: string;
  sender_type: string;
  status: string;
  created_at: string;
}

export interface WhatsAppActivity {
  received: number;
  answered: number;
  unanswered: number;
  agentMessages: number;
  botMessages: number;
  responseMinutes: number | null;
}

/** Activity in a rolling 24-hour window, from messages visible to the account. */
export function summarizeWhatsAppActivity(rows: WhatsAppMessageRow[]): WhatsAppActivity {
  const ordered = [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const pending = new Map<string, number>();
  const answered = new Set<string>();
  const responseTimes: number[] = [];
  let received = 0;
  let agentMessages = 0;
  let botMessages = 0;

  for (const row of ordered) {
    const timestamp = Date.parse(row.created_at);
    if (row.sender_type === "customer") {
      received++;
      if (!pending.has(row.conversation_id)) pending.set(row.conversation_id, timestamp);
      continue;
    }
    if (row.status === "failed") continue;
    if (row.sender_type === "agent") agentMessages++;
    if (row.sender_type === "bot") botMessages++;
    if (row.sender_type !== "agent" && row.sender_type !== "bot") continue;
    const firstInbound = pending.get(row.conversation_id);
    if (firstInbound !== undefined) {
      answered.add(row.conversation_id);
      responseTimes.push(Math.max(0, (timestamp - firstInbound) / 60000));
      pending.delete(row.conversation_id);
    }
  }

  return {
    received,
    answered: answered.size,
    unanswered: pending.size,
    agentMessages,
    botMessages,
    responseMinutes: responseTimes.length
      ? Math.round(responseTimes.reduce((sum, minutes) => sum + minutes, 0) / responseTimes.length)
      : null,
  };
}
