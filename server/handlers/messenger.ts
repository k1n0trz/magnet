import { decryptSecret } from "../lib/crypto";
import type { ChannelHandler, ChannelSettings, ChannelInboundMessage } from "../types";

export function createMessengerHandler(): ChannelHandler {
  return {
    validateWebhook(req, settings) {
      // Messenger usa Meta Webhook igual
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
        const messaging = asArray((entry as { messaging?: unknown[] }).messaging);
        for (const evt of messaging) {
          const msg = (evt as any).message;
          if (!msg) continue; // Skip non-message events

          messages.push({
            messageId: msg.mid,
            from: (evt as any).sender?.id || "",
            profileName: "",
            timestamp: Date.now() / 1000,
            type: msg.attachments ? "image" : "text",
            text: msg.text,
            mediaUrl: msg.attachments?.[0]?.payload?.url || ""
          });
        }
      }

      return messages;
    },

    async sendMessage(settings, to, body) {
      const token = settings.credentials.permanentAccessTokenEncrypted
        ? decryptSecret(settings.credentials.permanentAccessTokenEncrypted)
        : "";

      if (!token) {
        return { messageId: "", error: "Missing Messenger token" };
      }

      if (process.env.MAGNET_SEND_REAL_WHATSAPP !== "true") {
        return { messageId: `mock-messenger-${Date.now()}` };
      }

      try {
        const response = await fetch("https://graph.facebook.com/v18.0/me/messages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            recipient: { id: to },
            message: { text: body }
          })
        });

        if (!response.ok) {
          return { messageId: "", error: `Messenger API error: ${response.status}` };
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
