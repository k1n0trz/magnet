import { decryptSecret } from "../lib/crypto";
import type { Assistant } from "../types";

export async function sendWhatsAppText(assistant: Assistant, to: string, body: string) {
  const whatsappChannel = assistant.channels.whatsapp;
  const token = whatsappChannel.credentials.permanentAccessTokenEncrypted
    ? decryptSecret(whatsappChannel.credentials.permanentAccessTokenEncrypted)
    : "";
  const phoneNumberId = whatsappChannel.credentials.phoneNumberId;
  const shouldSend = process.env.MAGNET_SEND_REAL_WHATSAPP === "true" && token && phoneNumberId;

  if (!shouldSend) {
    return { id: `mock-${Date.now()}`, skipped: true };
  }

  const version = process.env.META_GRAPH_VERSION || "v22.0";
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
    return { id: "", skipped: false, failed: true };
  }

  const data = await response.json() as { messages?: Array<{ id: string }> };
  return { id: data.messages?.[0]?.id || "", skipped: false };
}
