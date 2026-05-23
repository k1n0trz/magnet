import { createWhatsAppHandler } from "../handlers/whatsapp";
import type { Assistant, Conversation, Message, Store } from "../types";

const closingStatuses = new Set(["Calificado", "En negociacion", "En negociaciÃ³n", "Por facturar", "Pendiente de pago", "Ganado"]);
const completedTags = new Set(["brief_completo", "cerrado", "venta_generada"]);

export async function runAssistantOperationsTick(store: Store) {
  const assistants = await store.listAssistants();
  for (const assistant of assistants) {
    await maybeSendOwnerSummary(store, assistant);
    await maybeSendRemarketing(store, assistant);
  }
}

async function maybeSendOwnerSummary(store: Store, assistant: Assistant) {
  const settings = withOperationDefaults(assistant);
  if (!settings.summaryEnabled || !settings.ownerWhatsAppNumber) return;
  if (!assistant.channels.whatsapp?.enabled) return;
  if (!isDue(settings.lastSummaryAt, settings.summaryIntervalHours)) return;

  const [conversations, messages] = await Promise.all([
    store.listConversations(assistant.id),
    store.listMessages(assistant.id)
  ]);
  const since = Date.now() - settings.summaryIntervalHours * 60 * 60 * 1000;
  const recentConversations = conversations.filter((conversation) => new Date(conversation.createdAt).getTime() >= since).length;
  const closingLeads = conversations.filter((conversation) => closingStatuses.has(conversation.status)).length;
  const sales = conversations.filter((conversation) => conversation.status === "Ganado" || conversation.tags.some((tag) => tag === "venta_generada")).length;
  const inbound = messages.filter((message) => message.direction === "inbound" && new Date(message.createdAt).getTime() >= since).length;

  const body = [
    `Resumen MAGNET - ${assistant.name}`,
    `Periodo: ultimas ${settings.summaryIntervalHours} horas`,
    `Conversaciones nuevas: ${recentConversations}`,
    `Mensajes entrantes: ${inbound}`,
    `Leads en cierre: ${closingLeads}`,
    `Ventas marcadas: ${sales}`
  ].join("\n");

  const sent = await createWhatsAppHandler().sendMessage(assistant.channels.whatsapp, settings.ownerWhatsAppNumber, body);
  await store.addEvent({
    assistantId: assistant.id,
    contactId: "",
    conversationId: "",
    type: sent.error ? "owner_summary_failed" : "owner_summary_sent",
    payload: { error: sent.error, messageId: sent.messageId }
  });
  if (!sent.error) {
    await store.updateAssistant(assistant.id, {
      operations: { ...settings, lastSummaryAt: new Date().toISOString() }
    });
  }
}

async function maybeSendRemarketing(store: Store, assistant: Assistant) {
  const settings = withOperationDefaults(assistant);
  if (!settings.remarketingEnabled) return;
  if (!assistant.channels.whatsapp?.enabled) return;

  const [conversations, messages, events] = await Promise.all([
    store.listConversations(assistant.id),
    store.listMessages(assistant.id),
    store.listEvents(assistant.id)
  ]);
  const threshold = Date.now() - settings.remarketingDelayHours * 60 * 60 * 1000;

  for (const conversation of conversations) {
    if (conversation.status === "Ganado" || conversation.tags.some((tag) => completedTags.has(tag))) continue;
    if (new Date(conversation.lastMessageAt).getTime() > threshold) continue;
    if (events.some((event) => event.type === "remarketing_message_sent" && event.payload?.conversationId === conversation.id)) continue;

    const thread = messages.filter((message) => message.conversationId === conversation.id);
    if (!thread.length || !shouldRemarket(thread, conversation)) continue;

    const contactId = conversation.contactId;
    const contact = (await store.listContacts(assistant.id)).find((item) => item.id === contactId);
    if (!contact?.phone) continue;

    const body = buildRemarketingMessage(settings.remarketingMessage, settings.remarketingWebsiteUrl);
    const sent = await createWhatsAppHandler().sendMessage(assistant.channels.whatsapp, contact.phone, body);
    await store.addMessage({
      assistantId: assistant.id,
      conversationId: conversation.id,
      contactId,
      direction: "outbound",
      sender: "assistant",
      type: "text",
      text: body,
      mediaUrl: "",
      channel: "whatsapp",
      channelMessageId: sent.messageId,
      status: sent.error ? "failed" : "sent",
      timestamp: new Date().toISOString()
    });
    await store.addEvent({
      assistantId: assistant.id,
      contactId,
      conversationId: conversation.id,
      type: sent.error ? "remarketing_message_failed" : "remarketing_message_sent",
      payload: { conversationId: conversation.id, error: sent.error, messageId: sent.messageId }
    });
  }
}

function shouldRemarket(messages: Message[], conversation: Conversation) {
  const last = messages[messages.length - 1];
  if (last?.status === "failed") return false;
  if (conversation.tags.some((tag) => completedTags.has(tag))) return false;
  return !messages.some((message) => message.text.includes("https://wa.link/4kzam6"));
}

function withOperationDefaults(assistant: Assistant) {
  return {
    ownerWhatsAppNumber: assistant.operations?.ownerWhatsAppNumber || "",
    summaryEnabled: assistant.operations?.summaryEnabled ?? false,
    summaryIntervalHours: assistant.operations?.summaryIntervalHours ?? 6,
    lastSummaryAt: assistant.operations?.lastSummaryAt || "",
    remarketingEnabled: assistant.operations?.remarketingEnabled ?? false,
    remarketingDelayHours: assistant.operations?.remarketingDelayHours ?? 24,
    remarketingWebsiteUrl: assistant.operations?.remarketingWebsiteUrl || "",
    remarketingMessage: assistant.operations?.remarketingMessage || "Hola, queria retomar nuestra conversacion. Si aun te interesa, podemos avanzar con los datos de tu empresa. Tambien puedes visitar nuestro sitio web para conocer mas."
  };
}

function isDue(lastAt: string, intervalHours: number) {
  if (!lastAt) return true;
  return Date.now() - new Date(lastAt).getTime() >= Math.max(1, intervalHours) * 60 * 60 * 1000;
}

function buildRemarketingMessage(message: string, websiteUrl: string) {
  const trimmed = message.trim();
  const site = websiteUrl.trim();
  if (!site || trimmed.includes(site)) return trimmed;
  return `${trimmed}\n\nTambien puedes visitarnos en ${site} y seguir nuestras redes para conocer mas casos e ideas.`;
}
