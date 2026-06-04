import { createWhatsAppHandler } from "../handlers/whatsapp";
import type { Assistant, Contact, Conversation, Message, Organization, Store, User } from "../types";

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

export async function notifyNewUserRegistration(store: Store, user: User, organization: Organization) {
  const admins = (await store.listUsers()).filter((item) => ["admin", "superadmin"].includes(item.role));
  const assistant = await notificationAssistant(store);
  const body = [
    "Nuevo usuario en MAGNET",
    `Nombre: ${user.name}`,
    `Correo: ${user.email}`,
    `Organizacion: ${organization.name}`,
    `Plan: ${organization.planType || "Gratis"}`
  ].join("\n");

  for (const admin of admins) {
    if (admin.phone && assistant?.channels.whatsapp?.enabled) {
      try {
        const sent = await createWhatsAppHandler().sendMessage(assistant.channels.whatsapp, admin.phone, body);
        await store.addEvent({
          assistantId: assistant.id,
          contactId: "",
          conversationId: "",
          type: sent.error ? "new_user_whatsapp_alert_failed" : "new_user_whatsapp_alert_sent",
          payload: { userId: user.id, email: user.email, phone: admin.phone, messageId: sent.messageId, error: sent.error }
        });
      } catch (error) {
        await store.addEvent({
          assistantId: assistant.id,
          contactId: "",
          conversationId: "",
          type: "new_user_whatsapp_alert_failed",
          payload: { userId: user.id, email: user.email, phone: admin.phone, error: String(error) }
        });
      }
    }

    if (admin.email) {
      const result = await sendEmail(admin.email, "Nuevo usuario en MAGNET", body);
      if (assistant) {
        await store.addEvent({
          assistantId: assistant.id,
          contactId: "",
          conversationId: "",
          type: result.sent ? "new_user_email_alert_sent" : "new_user_email_alert_pending",
          payload: { userId: user.id, email: user.email, adminEmail: admin.email, error: result.error }
        });
      }
    }
  }
}

async function notificationAssistant(store: Store) {
  const preferredId = process.env.MAGNET_LEGACY_ASSISTANT_ID || "";
  const preferred = preferredId ? await store.getAssistant(preferredId) : undefined;
  if (preferred?.channels.whatsapp?.enabled) return preferred;
  return (await store.listAssistants()).find((assistant) => assistant.channels.whatsapp?.enabled);
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
