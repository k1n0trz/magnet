import { Router } from "express";
import { generateAssistantReply } from "../services/ai";
import { sendWhatsAppText } from "../services/whatsapp";
import type { Message, Store } from "../types";

interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: "text" | "audio" | "image" | "document";
  text?: { body?: string };
}

export function whatsappRouter(store: Store) {
  const router = Router();

  router.get("/webhook/:assistantId", async (req, res) => {
    const assistant = await store.getAssistant(req.params.assistantId);
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (assistant && mode === "subscribe" && token === assistant.channels.whatsapp.verifyToken && typeof challenge === "string") {
      res.status(200).send(challenge);
      return;
    }

    res.status(403).json({ error: "Invalid verify token" });
  });

  router.post("/webhook/:assistantId", async (req, res) => {
    const assistant = await store.getAssistant(req.params.assistantId);
    if (!assistant) {
      res.status(404).json({ error: "Assistant not found" });
      return;
    }

    const messages = extractMessages(req.body);
    const statuses = extractStatuses(req.body);

    for (const update of statuses) {
      const updated = await store.updateMessageStatus({
        assistantId: assistant.id,
        channelMessageId: update.messageId,
        status: update.status
      });

      if (update.status === "failed") {
        await store.addEvent({
          assistantId: assistant.id,
          contactId: updated?.contactId || "",
          conversationId: updated?.conversationId || "",
          type: "message_delivery_failed",
          payload: { channel: "whatsapp", messageId: update.messageId, error: update.error }
        });
      }
    }

    for (const inbound of messages) {
      const text = inbound.text?.body || `[${inbound.type}]`;
      const contact = await store.upsertContact({
        assistantId: assistant.id,
        name: inbound.profileName || inbound.from,
        phone: inbound.from,
        source: "WhatsApp",
        tags: ["nuevo_lead"],
        lastMessageAt: new Date(Number(inbound.timestamp) * 1000 || Date.now()).toISOString()
      });
      const conversation = await store.upsertConversation({
        assistantId: assistant.id,
        contactId: contact.id,
        lastMessage: text,
        lastMessageAt: contact.lastMessageAt,
        tags: contact.tags.length ? contact.tags : ["nuevo_lead"],
        botEnabled: true
      });
      await store.addMessage({
        assistantId: assistant.id,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: "inbound",
        sender: "customer",
        type: inbound.type || "text",
        text,
        mediaUrl: "",
        channel: "whatsapp",
        channelMessageId: inbound.id,
        status: "received",
        timestamp: contact.lastMessageAt
      });

      if (assistant.status === "active" && assistant.ai.status === "active" && conversation.botEnabled) {
        const credit = await store.consumeCredits({
          organizationId: assistant.organizationId,
          amount: 1,
          description: "AI WhatsApp response",
          metadata: { assistantId: assistant.id, conversationId: conversation.id, channel: "whatsapp" }
        });

        if (!credit) {
          await store.addEvent({
            assistantId: assistant.id,
            contactId: contact.id,
            conversationId: conversation.id,
            type: "message_credit_exhausted",
            payload: { channel: "whatsapp" }
          });
          continue;
        }

        const history = await store.listMessages(assistant.id, conversation.id);
        const triggers = await store.listTriggers(assistant.id);
        const reply = await generateAssistantReply({ assistant, inboundText: text, history, triggers });
        const sent = await sendWhatsAppText(assistant, inbound.from, reply);
        await store.addMessage({
          assistantId: assistant.id,
          conversationId: conversation.id,
          contactId: contact.id,
          direction: "outbound",
          sender: "assistant",
          type: "text",
          text: reply,
          mediaUrl: "",
          channel: "whatsapp",
          channelMessageId: sent.id,
          status: sent.failed ? "failed" : "sent",
          timestamp: new Date().toISOString()
        });
        await store.addEvent({
          assistantId: assistant.id,
          contactId: contact.id,
          conversationId: conversation.id,
          type: "ai_response_generated",
          payload: { provider: assistant.ai.modelProvider, sent }
        });
      }
    }

    res.json({ ok: true });
  });

  return router;
}

function extractMessages(payload: unknown) {
  const result: Array<WhatsAppMessage & { profileName?: string }> = [];
  const entries = asArray((payload as { entry?: unknown[] }).entry);
  for (const entry of entries) {
    const changes = asArray((entry as { changes?: unknown[] }).changes);
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> }).value || {};
      const contacts = asArray(value.contacts);
      const profileName = ((contacts[0] as { profile?: { name?: string } } | undefined)?.profile?.name) || "";
      const messages = asArray(value.messages) as WhatsAppMessage[];
      for (const message of messages) {
        result.push({ ...message, profileName });
      }
    }
  }
  return result;
}

function extractStatuses(payload: unknown) {
  const result: Array<{ messageId: string; status: Message["status"]; error?: unknown }> = [];
  const entries = asArray((payload as { entry?: unknown[] }).entry);

  for (const entry of entries) {
    const changes = asArray((entry as { changes?: unknown[] }).changes);
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> }).value || {};
      const statuses = asArray(value.statuses) as Array<Record<string, unknown>>;
      for (const item of statuses) {
        const messageId = typeof item.id === "string" ? item.id : "";
        const status = mapStatus(item.status);
        if (messageId && status) {
          result.push({ messageId, status, error: item.errors });
        }
      }
    }
  }

  return result;
}

function mapStatus(status: unknown): Message["status"] | undefined {
  if (status === "sent" || status === "delivered" || status === "read" || status === "failed") {
    return status;
  }
  return undefined;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}
