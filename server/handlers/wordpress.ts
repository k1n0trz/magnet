import { createHmac } from "crypto";
import type { ChannelHandler, ChannelSettings, ChannelInboundMessage } from "../types";

export function createWordPressHandler(): ChannelHandler {
  return {
    validateWebhook(req, settings) {
      // WordPress: validar HMAC signature en header X-Magnet-Signature
      const signature = req.headers?.["x-magnet-signature"] as string;
      if (!signature) return false;

      const bodyStr = JSON.stringify(req.body);
      const secret = settings.webhookSecret;
      const expected = "sha256=" + createHmac("sha256", secret).update(bodyStr).digest("hex");

      return signature === expected;
    },

    parseInbound(payload) {
      // WordPress payload: { source: "contact_form_7", form_id, name, email, message, timestamp }
      const msg = payload as any;

      return [
        {
          messageId: `wp-${msg.timestamp || Date.now()}`,
          from: msg.email || "unknown",
          profileName: msg.name || "WordPress Contact",
          timestamp: msg.timestamp ? Number(msg.timestamp) / 1000 : Date.now() / 1000,
          type: "text",
          text: msg.message || msg.body || "",
          mediaUrl: ""
        }
      ];
    },

    async sendMessage(settings, to, body) {
      // WordPress: por ahora solo simulamos
      // En producción: enviar email o integrar con WP REST API
      return { messageId: `wp-email-${Date.now()}` };
    }
  };
}
