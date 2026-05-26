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
            const media = mediaFromMessage(msg);
            messages.push({
              messageId: msg.id,
              from: msg.from,
              profileName,
              timestamp: Number(msg.timestamp) || Date.now() / 1000,
              type: msg.type || "text",
              text: msg.text?.body,
              mediaUrl: media.url,
              mediaId: media.id,
              mediaMimeType: media.mimeType,
              referral: normalizeReferral(msg.referral)
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
          const error = await readMetaError(response);
          return { messageId: "", error: `Meta API error: ${response.status}${error ? ` - ${error}` : ""}` };
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

function mediaFromMessage(msg: any) {
  const media = msg.audio || msg.image || msg.document || msg.video || msg.sticker || {};
  return {
    id: typeof media.id === "string" ? media.id : "",
    url: typeof media.url === "string" ? media.url : "",
    mimeType: typeof media.mime_type === "string" ? media.mime_type : ""
  };
}

function normalizeReferral(referral: any) {
  if (!referral || typeof referral !== "object") return undefined;
  return {
    sourceType: String(referral.source_type || ""),
    sourceId: String(referral.source_id || ""),
    sourceUrl: String(referral.source_url || ""),
    headline: String(referral.headline || ""),
    body: String(referral.body || ""),
    mediaType: String(referral.media_type || ""),
    imageUrl: String(referral.image_url || ""),
    videoUrl: String(referral.video_url || ""),
    thumbnailUrl: String(referral.thumbnail_url || "")
  };
}

async function readMetaError(response: Response) {
  try {
    const data = await response.json() as { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } };
    const error = data.error;
    if (!error?.message) return "";
    const parts = [error.message];
    if (error.code) parts.push(`code ${error.code}`);
    if (error.error_subcode) parts.push(`subcode ${error.error_subcode}`);
    if (error.fbtrace_id) parts.push(`trace ${error.fbtrace_id}`);
    return parts.join(" | ");
  } catch {
    return "";
  }
}
