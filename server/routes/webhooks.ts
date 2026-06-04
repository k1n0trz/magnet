import { Router, type Request, type Response } from "express";
import { generateAssistantReply } from "../services/ai";
import { sendWhatsAppAudio, transcribeWhatsAppAudio } from "../services/audio";
import { notifyNewConversation } from "../services/notifications";
import type { HandlerRegistry } from "../handlers";
import type { ChannelType, Message, Store } from "../types";

const temporarilyUnavailableChannels = new Set<ChannelType>(["instagram", "messenger", "wordpress"]);

export function webhooksRouter(store: Store, handlers: HandlerRegistry) {
  const router = Router();

  router.get("/:assistantId", verifyWebhook);
  router.get("/:assistantId/:channel", verifyWebhook);

  router.post("/:assistantId", receiveWebhook);
  router.post("/:assistantId/:channel", receiveWebhook);

  async function verifyWebhook(req: Request, res: Response) {
    const assistantId = String(req.params.assistantId);
    const channel = channelFromRequest(req);
    const assistant = await store.getAssistant(assistantId);

    if (!assistant) {
      res.status(404).json({ error: "Assistant not found" });
      return;
    }

    if (temporarilyUnavailableChannels.has(channel)) {
      res.status(423).json({ error: "Disponible proximamente" });
      return;
    }

    const settings = assistant.channels[channel];
    if (!settings || !settings.enabled) {
      res.status(404).json({ error: "Channel not configured or disabled" });
      return;
    }

    try {
      const handler = handlers.get(channel);
      const valid = handler.validateWebhook(req, settings);

      if (valid === false) {
        res.status(403).json({ error: "Invalid webhook credentials" });
        return;
      }

      if (typeof valid === "string") {
        res.status(200).send(valid);
        return;
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  }

  async function receiveWebhook(req: Request, res: Response) {
    const assistantId = String(req.params.assistantId);
    const channel = channelFromRequest(req);

    try {
      const assistant = await store.getAssistant(assistantId);
      if (!assistant) {
        res.status(404).json({ error: "Assistant not found" });
        return;
      }

      if (temporarilyUnavailableChannels.has(channel)) {
        res.status(423).json({ error: "Disponible proximamente" });
        return;
      }

      const settings = assistant.channels[channel];
      if (!settings || !settings.enabled) {
        res.status(404).json({ error: "Channel not configured or disabled" });
        return;
      }

      const handler = handlers.get(channel);
      const messages = handler.parseInbound(req.body);
      const statusUpdates = channel === "whatsapp" ? extractWhatsAppStatuses(req.body) : [];

      for (const update of statusUpdates) {
        const updated = await store.updateMessageStatus({
          assistantId: assistant.id,
          channelMessageId: update.messageId,
          status: update.status,
          ...errorSummary(update.error)
        });

        if (update.status === "failed") {
          const error = errorSummary(update.error);
          await store.addEvent({
            assistantId: assistant.id,
            contactId: updated?.contactId || "",
            conversationId: updated?.conversationId || "",
            type: "message_delivery_failed",
            payload: { channel, messageId: update.messageId, error: error.error, errorCode: error.errorCode, rawError: update.error }
          });
        }
      }

      for (const inbound of messages) {
        const inboundMediaUrl = inbound.mediaUrl || (inbound.mediaId ? `/api/media/whatsapp/${assistant.id}/${encodeURIComponent(inbound.mediaId)}` : "");
        const inboundText = inbound.type === "audio" && inbound.mediaId && assistant.ai.transcribeIncomingAudio
          ? (await transcribeWhatsAppAudio(settings, inbound.mediaId)) || ""
          : inbound.text || "";
        const conversationText = inboundText || `[${inbound.type}]`;
        const contact = await store.upsertContact({
          assistantId: assistant.id,
          name: inbound.profileName || inbound.from,
          phone: inbound.from,
          source: inbound.referral ? "Meta Ads" : channel.toUpperCase(),
          tags: inbound.referral ? ["nuevo_lead", "meta_ads"] : ["nuevo_lead"],
          referral: inbound.referral,
          lastMessageAt: new Date(inbound.timestamp * 1000).toISOString()
        });
        const existingConversation = (await store.listConversations(assistant.id)).find((item) => item.contactId === contact.id);
        const isNewConversation = !existingConversation;

        const conversation = await store.upsertConversation({
          assistantId: assistant.id,
          contactId: contact.id,
          lastMessage: conversationText,
          lastMessageAt: contact.lastMessageAt,
          tags: contact.tags.length ? contact.tags : ["nuevo_lead"],
          referral: inbound.referral,
          botEnabled: true
        });

        const inboundMessage = await store.addMessage({
          assistantId: assistant.id,
          conversationId: conversation.id,
          contactId: contact.id,
          direction: "inbound",
          sender: "customer",
          type: inbound.type,
          text: inboundText,
          mediaUrl: inboundMediaUrl,
          mediaId: inbound.mediaId || "",
          mediaMimeType: inbound.mediaMimeType || "",
          referral: inbound.referral,
          channel,
          channelMessageId: inbound.messageId,
          status: "received",
          timestamp: new Date(inbound.timestamp * 1000).toISOString()
        });

        if (isNewConversation) {
          await notifyNewConversation(store, assistant, conversation, contact, inboundMessage);
        }

        if (assistant.status === "active" && assistant.ai.status === "active" && conversation.botEnabled) {
          const credit = isNewConversation
            ? await store.consumeCredits({
                organizationId: assistant.organizationId,
                amount: 1,
                description: "AI conversation",
                metadata: { assistantId: assistant.id, conversationId: conversation.id, channel }
              })
            : { id: "already-charged" };

          if (!credit) {
            await store.addEvent({
              assistantId: assistant.id,
              contactId: contact.id,
              conversationId: conversation.id,
              type: "conversation_credit_exhausted",
              payload: { channel }
            });
            continue;
          }

          const history = await store.listMessages(assistant.id, conversation.id);
          const triggers = await store.listTriggers(assistant.id);
          const reply = await generateAssistantReply({
            assistant,
            inboundText: conversationText,
            history,
            triggers
          });

          const shouldReplyWithAudio = inbound.type === "audio" && assistant.ai.audioEnabled;
          const sent = shouldReplyWithAudio
            ? await sendWhatsAppAudio(assistant, inbound.from, reply)
            : await handler.sendMessage(settings, inbound.from, reply);

          await store.addMessage({
            assistantId: assistant.id,
            conversationId: conversation.id,
            contactId: contact.id,
            direction: "outbound",
            sender: "assistant",
            type: shouldReplyWithAudio ? "audio" : "text",
            text: reply,
            mediaUrl: "",
            channel,
            channelMessageId: sent.messageId,
            status: sent.error ? "failed" : "sent",
            error: sent.error || "",
            timestamp: new Date().toISOString()
          });

          await store.addEvent({
            assistantId: assistant.id,
            contactId: contact.id,
            conversationId: conversation.id,
            type: "ai_response_generated",
            payload: {
              channel,
              provider: assistant.ai.modelProvider,
              messageId: sent.messageId,
              error: sent.error
            }
          });
        }
      }

      res.json({ ok: true });
    } catch (err) {
      console.error(`Webhook error for ${channel}:`, err);
      res.status(500).json({ error: String(err) });
    }
  }

  return router;
}

function channelFromRequest(req: Request) {
  return String(req.params.channel || "whatsapp") as ChannelType;
}

function extractWhatsAppStatuses(payload: unknown) {
  const updates: Array<{ messageId: string; status: Message["status"]; error?: unknown }> = [];
  const entries = asArray((payload as { entry?: unknown[] }).entry);

  for (const entry of entries) {
    const changes = asArray((entry as { changes?: unknown[] }).changes);
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> }).value || {};
      const statuses = asArray(value.statuses) as Array<Record<string, unknown>>;
      for (const item of statuses) {
        const id = typeof item.id === "string" ? item.id : "";
        const status = mapWhatsAppStatus(item.status);
        if (id && status) {
          updates.push({ messageId: id, status, error: item.errors });
        }
      }
    }
  }

  return updates;
}

function mapWhatsAppStatus(status: unknown): Message["status"] | undefined {
  if (status === "sent" || status === "delivered" || status === "read" || status === "failed") {
    return status;
  }
  return undefined;
}

function errorSummary(error: unknown) {
  const first = Array.isArray(error) ? error[0] : error;
  if (!first || typeof first !== "object") return {};
  const item = first as { message?: unknown; title?: unknown; code?: unknown; error_code?: unknown; error_data?: { details?: unknown }; fbtrace_id?: unknown };
  const message = String(item.message || item.title || item.error_data?.details || "").trim();
  const code = String(item.code || item.error_code || "").trim();
  const trace = String(item.fbtrace_id || "").trim();
  const detail = [message, code ? `code ${code}` : "", trace ? `trace ${trace}` : ""].filter(Boolean).join(" | ");
  return {
    ...(detail ? { error: detail } : {}),
    ...(code ? { errorCode: code } : {})
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
