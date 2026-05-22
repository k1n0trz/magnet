import { decryptSecret } from "../lib/crypto";
import type { ChannelHandler, ChannelSettings, ChannelInboundMessage } from "../types";

export function createInstagramHandler(): ChannelHandler {
  return {
    validateWebhook(req, settings) {
      // Instagram usa Meta Webhook, igual que WhatsApp
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === settings.verifyToken && typeof challenge === "string") {
        return challenge;
      }
      return false;
    },

    parseInbound(payload) {
      const messages: ChannelInboundMessage[] = [];
      const entries = asArray((payload as { entry?: unknown[] }).entry);

      for (const entry of entries) {
        const changes = asArray((entry as { changes?: unknown[] }).changes);
        for (const change of changes) {
          const value = (change as { value?: Record<string, unknown> }).value || {};
          const msgs = asArray(value.messages) as any[];

          for (const msg of msgs) {
            messages.push({
              messageId: msg.mid || msg.id,
              from: msg.from?.id || msg.from,
              profileName: (msg.from?.name) || "",
              timestamp: msg.timestamp ? Number(msg.timestamp) : Date.now() / 1000,
              type: msg.type || "text",
              text: msg.message || msg.text,
              mediaUrl: msg.image?.url || msg.video?.url || msg.media?.image?.url || ""
            });
          }
        }
      }

      return messages;
    },

    async sendMessage(settings, to, body) {
      const token = settings.credentials.permanentAccessTokenEncrypted
        ? decryptSecret(settings.credentials.permanentAccessTokenEncrypted)
        : "";

      if (!token) {
        return { messageId: "", error: "Missing Instagram token" };
      }

      if (process.env.MAGNET_SEND_REAL_WHATSAPP !== "true") {
        return { messageId: `mock-ig-${Date.now()}` };
      }

      const version = process.env.META_GRAPH_VERSION || "v22.0";
      try {
        const response = await fetch(`https://graph.instagram.com/${version}/me/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            recipient: { id: to },
            messaging_type: "RESPONSE",
            message: { text: body }
          })
        });

        if (!response.ok) {
          return { messageId: "", error: `Instagram API error: ${response.status}` };
        }

        const data = (await response.json()) as { message_id?: string };
        return { messageId: data.message_id || "" };
      } catch (err) {
        return { messageId: "", error: String(err) };
      }
    }
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
