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
    const error = await readMetaError(response);
    return { id: "", skipped: false, failed: true, error };
  }

  const data = await response.json() as { messages?: Array<{ id: string }> };
  return { id: data.messages?.[0]?.id || "", skipped: false };
}

async function readMetaError(response: Response) {
  try {
    const data = await response.json() as { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } };
    const error = data.error;
    if (!error?.message) return `Meta API error: ${response.status}`;
    const parts = [error.message];
    if (error.code) parts.push(`code ${error.code}`);
    if (error.error_subcode) parts.push(`subcode ${error.error_subcode}`);
    if (error.fbtrace_id) parts.push(`trace ${error.fbtrace_id}`);
    return parts.join(" | ");
  } catch {
    return `Meta API error: ${response.status}`;
  }
}
