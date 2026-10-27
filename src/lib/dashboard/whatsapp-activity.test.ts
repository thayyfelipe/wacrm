import { describe, expect, it } from "vitest";
import { summarizeWhatsAppActivity } from "./whatsapp-activity";

describe("summarizeWhatsAppActivity", () => {
  it("counts real replies, pending conversations and excludes failed sends", () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 27, 10, minute)).toISOString();
    expect(summarizeWhatsAppActivity([
      { conversation_id: "a", sender_type: "agent", status: "sent", created_at: at(10) },
      { conversation_id: "a", sender_type: "customer", status: "sent", created_at: at(0) },
      { conversation_id: "b", sender_type: "customer", status: "sent", created_at: at(2) },
      { conversation_id: "b", sender_type: "agent", status: "failed", created_at: at(3) },
      { conversation_id: "b", sender_type: "agent", status: "sending", created_at: at(4) },
      { conversation_id: "a", sender_type: "customer", status: "sent", created_at: at(20) },
      { conversation_id: "a", sender_type: "bot", status: "sent", created_at: at(25) },
    ])).toEqual({
      received: 3, answered: 1, unanswered: 1, agentMessages: 1,
      botMessages: 1, responseMinutes: 8,
    });
  });
});
