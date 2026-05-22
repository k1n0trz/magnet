import { decryptSecret } from "../lib/crypto";
import type { ChannelHandler, ChannelSettings, ChannelInboundMessage, ChannelSendResult } from "../types";

export function createWhatsAppHandler(): ChannelHandler {
  return {
    validateWebhook(req, settings) {
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
          const contacts = asArray(value.contacts);
          const profileName = ((contacts[0] as any)?.profile?.name) || "";
          const msgs = asArray(value.messages) as any[];

          for (const msg of msgs) {
            messages.push({
              messageId: msg.id,
              from: msg.from,
              profileName,
              timestamp: Number(msg.timestamp) || Date.now() / 1000,
              type: msg.type || "text",
              text: msg.text?.body,
              mediaUrl: ""
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
      const phoneNumberId = settings.credentials.phoneNumberId;

      if (!token || !phoneNumberId) {
        return { messageId: "", error: "Missing WhatsApp credentials" };
      }

      if (process.env.MAGNET_SEND_REAL_WHATSAPP !== "true") {
        return { messageId: `mock-${Date.now()}` };
      }

      const version = process.env.META_GRAPH_VERSION || "v22.0";
      try {
        const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body }
          })
        });

        if (!response.ok) {
          return { messageId: "", error: `Meta API error: ${response.status}` };
        }

        const data = (await response.json()) as { messages?: Array<{ id: string }> };
        return { messageId: data.messages?.[0]?.id || "" };
      } catch (err) {
        return { messageId: "", error: String(err) };
      }
    }
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
