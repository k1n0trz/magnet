import { createWhatsAppHandler } from "../handlers/whatsapp";
import type { Assistant, Contact, Conversation, Message, Store } from "../types";

export async function notifyNewConversation(store: Store, assistant: Assistant, conversation: Conversation, contact: Contact, inbound: Message) {
  if (assistant.operations?.newConversationAlertsEnabled === false) return;

  const organization = await store.getOrganization(assistant.organizationId);
  const owner = organization?.ownerUserId ? await store.getUser(organization.ownerUserId) : undefined;
  const body = [
    `Nueva conversación en MAGNET - ${assistant.name}`,
    `Lead: ${contact.name || contact.phone}`,
    `Teléfono: ${contact.phone}`,
    `Mensaje: ${inbound.text || `[${inbound.type}]`}`,
    contact.referral?.headline ? `Origen: ${contact.referral.headline}` : `Origen: ${contact.source}`
  ].join("\n");

  if (owner?.phone) {
    const sent = await createWhatsAppHandler().sendMessage(assistant.channels.whatsapp, owner.phone, body);
    await store.addEvent({
      assistantId: assistant.id,
      contactId: contact.id,
      conversationId: conversation.id,
      type: sent.error ? "new_conversation_whatsapp_alert_failed" : "new_conversation_whatsapp_alert_sent",
      payload: { phone: owner.phone, messageId: sent.messageId, error: sent.error }
    });
  }

  if (owner?.email) {
    const result = await sendEmail(owner.email, `Nueva conversación en ${assistant.name}`, body);
    await store.addEvent({
      assistantId: assistant.id,
      contactId: contact.id,
      conversationId: conversation.id,
      type: result.sent ? "new_conversation_email_alert_sent" : "new_conversation_email_alert_pending",
      payload: { email: owner.email, error: result.error }
    });
  }
}

async function sendEmail(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAGNET_EMAIL_FROM || "Magnet <notificaciones@magnetcloud.app>";
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY is not configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to, subject, text })
    });

    if (!response.ok) return { sent: false, error: `Email provider returned ${response.status}` };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: String(error) };
  }
}
