import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { decryptSecret } from "../lib/crypto";
import { isValidReferenceAssistantId } from "../lib/validation";
import { generateAssistantReply } from "../services/ai";
import { fetchWhatsAppMedia } from "../services/audio";
import { notifyNewUserRegistration } from "../services/notifications";
import { sendWhatsAppText } from "../services/whatsapp";
import { buildContactsWorkbook } from "../services/xlsx";
import type { Assistant, ChannelSettings, ChannelType, LeadStatus, MessagePackage, Store, User } from "../types";

interface RuntimeStatus {
  persistence: "memory" | "mongo";
  realWhatsAppEnabled: boolean;
}

const conversationPackages = [
  { id: "conversations-500", name: "500 conversaciones", messages: 500, priceUsd: 20 },
  { id: "conversations-1000", name: "1000 conversaciones", messages: 1000, priceUsd: 35 },
  { id: "conversations-2000", name: "2000 conversaciones", messages: 2000, priceUsd: 60 }
] as const;
const temporarilyUnavailableChannels = new Set<ChannelType>(["instagram", "messenger", "wordpress"]);

function messagePackages(): MessagePackage[] {
  const usdToCop = Number(process.env.MERCADO_PAGO_USD_TO_COP || 4000);
  const rate = Number.isFinite(usdToCop) && usdToCop > 0 ? usdToCop : 4000;
  return conversationPackages.map((item) => ({
    ...item,
    priceCop: Math.round(item.priceUsd * rate),
    currency: "COP" as const
  }));
}

const leadStatusesSchema = [
  "Nuevo",
  "Por contactar",
  "Contactado",
  "Calificado",
  "En negociación",
  "Por facturar",
  "Pendiente de pago",
  "Ganado",
  "Perdido",
  "Recontactar",
  "No responde",
  "Spam"
] as [LeadStatus, ...LeadStatus[]];

export function apiRouter(store: Store, runtime: RuntimeStatus) {
  const router = Router();

  router.get("/health", (_req, res) => res.json({
    ok: true,
    name: "MAGNET",
    persistence: runtime.persistence,
    realWhatsAppEnabled: runtime.realWhatsAppEnabled
  }));

  router.get("/public-config", (_req, res) => res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || ""
  }));

  router.get("/media/whatsapp/:assistantId/:mediaId", requireAuth(store), async (req, res) => {
    const assistant = await store.getAssistant(String(req.params.assistantId));
    if (!assistant || !canAccessAssistant(req.user!, assistant.organizationId)) {
      res.status(404).json({ error: "Assistant not found" });
      return;
    }
    const media = await fetchWhatsAppMedia(assistant.channels.whatsapp, String(req.params.mediaId));
    if (!media) {
      res.status(404).json({ error: "Media not found" });
      return;
    }
    res.setHeader("Content-Type", media.mimeType);
    res.send(media.buffer);
  });

  router.post("/auth/register", async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      organizationName: z.string().min(2).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    const existing = await store.getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const organization = await store.createOrganization({
      name: parsed.data.organizationName || `${parsed.data.name} Workspace`,
      messageCredits: 0,
      freeMessagesGranted: false,
      planType: "Gratis"
    });
    const user = await store.createUser({
      organizationId: organization.id,
      name: parsed.data.name,
      email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      role: initialRoleFor(email),
      provider: "email",
      emailVerified: false,
      lastLoginAt: new Date().toISOString()
    });
    await store.updateOrganization(organization.id, { ownerUserId: user.id, freeMessagesGranted: true });
    await store.addCredits({
      organizationId: organization.id,
      userId: user.id,
      amount: 100,
      type: "grant",
      description: "Free trial messages on first registration",
      metadata: { source: "signup" }
    });
    void notifyNewUserRegistration(store, user, await store.getOrganization(organization.id) || organization);

    res.status(201).json({ token: signToken(user), user: publicUser(user), organization: await store.getOrganization(organization.id) });
  });

  router.post("/auth/login", async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const user = await store.getUserByEmail(parsed.data.email);
    if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await store.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
    res.json({ token: signToken(user), user: publicUser(user), organization: await store.getOrganization(user.organizationId) });
  });

  router.post("/auth/google", async (req, res) => {
    const schema = z.object({ credential: z.string().min(20), organizationName: z.string().min(2).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const profile = await verifyGoogleCredential(parsed.data.credential);
    if (!profile) {
      res.status(401).json({ error: "Invalid Google credential" });
      return;
    }

    let user = await store.getUserByGoogleSub(profile.sub);
    user = user || await store.getUserByEmail(profile.email);

    if (!user) {
      const organization = await store.createOrganization({
        name: parsed.data.organizationName || `${profile.name} Workspace`,
        messageCredits: 0,
        freeMessagesGranted: false,
        planType: "Gratis"
      });
      user = await store.createUser({
        organizationId: organization.id,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.picture,
        role: initialRoleFor(profile.email),
        provider: "google",
        googleSub: profile.sub,
        emailVerified: true,
        lastLoginAt: new Date().toISOString()
      });
      await store.updateOrganization(organization.id, { ownerUserId: user.id, freeMessagesGranted: true });
      await store.addCredits({
        organizationId: organization.id,
        userId: user.id,
        amount: 100,
        type: "grant",
        description: "Free trial messages on first Google registration",
        metadata: { source: "google_signup" }
      });
      void notifyNewUserRegistration(store, user, await store.getOrganization(organization.id) || organization);
    } else {
      await store.updateUser(user.id, {
        provider: user.provider === "email" ? user.provider : "google",
        googleSub: user.googleSub || profile.sub,
        avatarUrl: user.avatarUrl || profile.picture,
        emailVerified: true,
        lastLoginAt: new Date().toISOString()
      });
    }

    res.json({ token: signToken(user), user: publicUser(user), organization: await store.getOrganization(user.organizationId) });
  });

  router.get("/billing/packages", (_req, res) => {
    res.json({ packages: messagePackages(), mercadoPagoConfigured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN) });
  });

  router.post("/billing/checkout", requireAuth(store), async (req, res) => {
    const schema = z.object({ packageId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const selectedPackage = messagePackages().find((item) => item.id === parsed.data.packageId);
    if (!selectedPackage) {
      res.status(404).json({ error: "Message package not found" });
      return;
    }

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      res.status(503).json({ error: "Mercado Pago is not configured yet" });
      return;
    }

    const user = req.user!;
    const appBaseUrl = (process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": randomUUID()
      },
      body: JSON.stringify({
        items: [{
          id: selectedPackage.id,
          title: `MAGNET - ${selectedPackage.name}`,
          description: `${selectedPackage.messages} conversaciones para respuestas automaticas de IA`,
          quantity: 1,
          currency_id: selectedPackage.currency,
          unit_price: selectedPackage.priceCop
        }],
        payer: {
          name: user.name,
          email: user.email
        },
        external_reference: JSON.stringify({
          organizationId: user.organizationId,
          userId: user.id,
          packageId: selectedPackage.id
        }),
        metadata: {
          organization_id: user.organizationId,
          user_id: user.id,
          package_id: selectedPackage.id,
          conversations: selectedPackage.messages,
          price_usd: selectedPackage.priceUsd
        },
        back_urls: {
          success: `${appBaseUrl}/?billing=success`,
          pending: `${appBaseUrl}/?billing=pending`,
          failure: `${appBaseUrl}/?billing=failure`
        },
        notification_url: `${appBaseUrl}/api/billing/mercadopago/webhook`,
        auto_return: "approved",
        statement_descriptor: "MAGNET"
      })
    });

    const payload = await preferenceResponse.json() as { id?: string; init_point?: string; sandbox_init_point?: string; message?: string };
    if (!preferenceResponse.ok || !payload.init_point) {
      res.status(502).json({ error: payload.message || "Mercado Pago preference could not be created" });
      return;
    }

    res.status(201).json({
      preferenceId: payload.id,
      initPoint: payload.init_point,
      sandboxInitPoint: payload.sandbox_init_point
    });
  });

  router.post("/billing/mercadopago/webhook", async (req, res) => {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      res.status(503).json({ error: "Mercado Pago is not configured" });
      return;
    }

    if (!isValidMercadoPagoSignature(req)) {
      res.status(401).json({ error: "Invalid Mercado Pago signature" });
      return;
    }

    const notification = req.body as {
      type?: string;
      topic?: string;
      data?: { id?: string | number };
      resource?: string;
    };
    const topic = String(notification.type || notification.topic || req.query.type || req.query.topic || "");
    const paymentId = String(notification.data?.id || req.query["data.id"] || req.query.id || "");

    if (topic && topic !== "payment") {
      res.status(200).json({ ok: true, ignored: topic });
      return;
    }
    if (!paymentId) {
      res.status(202).json({ ok: true, pending: "missing_payment_id" });
      return;
    }

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    });

    const payment = await paymentResponse.json() as {
      id?: string | number;
      status?: string;
      external_reference?: string;
      transaction_amount?: number;
      currency_id?: string;
    };

    if (!paymentResponse.ok) {
      res.status(502).json({ error: "Mercado Pago payment could not be verified" });
      return;
    }
    if (payment.status !== "approved") {
      res.status(202).json({ ok: true, status: payment.status || "unknown" });
      return;
    }

    const reference = parseMercadoPagoReference(payment.external_reference);
    const selectedPackage = messagePackages().find((item) => item.id === reference.packageId);
    if (!reference.organizationId || !selectedPackage) {
      res.status(202).json({ ok: true, pending: "unknown_reference" });
      return;
    }

    const existingLedger = await store.listCreditLedger(reference.organizationId);
    const alreadyCredited = existingLedger.some((entry) => entry.type === "purchase" && String(entry.metadata.paymentId || "") === paymentId);
    if (!alreadyCredited) {
      await store.addCredits({
        organizationId: reference.organizationId,
        userId: reference.userId,
        amount: selectedPackage.messages,
        type: "purchase",
        description: `Compra Mercado Pago - ${selectedPackage.name}`,
        metadata: {
          paymentId,
          packageId: selectedPackage.id,
          priceUsd: selectedPackage.priceUsd,
          priceCop: selectedPackage.priceCop,
          transactionAmount: payment.transaction_amount,
          currency: payment.currency_id || selectedPackage.currency
        }
      });
    }

    res.status(200).json({ ok: true, credited: !alreadyCredited });
  });

  router.get("/me", requireAuth(store), async (req, res) => {
    const user = req.user!;
    res.json({
      user: publicUser(user),
      organization: await store.getOrganization(user.organizationId),
      ledger: await store.listCreditLedger(user.organizationId)
    });
  });

  router.patch("/me", requireAuth(store), async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).optional(),
      phone: z.string().max(32).optional(),
      companyName: z.string().max(120).optional(),
      taxId: z.string().max(60).optional(),
      theme: z.enum(["dark", "light"]).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const user = await store.updateUser(req.user!.id, parsed.data);
    res.json({
      user: publicUser(user),
      organization: await store.getOrganization(user.organizationId),
      ledger: await store.listCreditLedger(user.organizationId)
    });
  });

  router.get("/admin/overview", requireAuth(store), requireAdmin, async (_req, res) => {
    const [users, organizations, assistants, ledger] = await Promise.all([
      store.listUsers(),
      store.listOrganizations(),
      store.listAssistants(),
      store.listCreditLedger()
    ]);

    res.json({
      totals: {
        users: users.length,
        organizations: organizations.length,
        assistants: assistants.length,
        creditsAvailable: organizations.reduce((sum, organization) => sum + organization.messageCredits, 0)
      },
      packages: messagePackages(),
      users: users.map(publicUser),
      organizations,
      assistants,
      ledger: ledger.slice(-50).reverse()
    });
  });

  router.get("/bootstrap", requireAuth(store), async (req, res) => {
    const allAssistants = await store.listAssistants();
    const assistants = allAssistants.filter((assistant) => assistant.organizationId === req.user!.organizationId);
    const assistantId = String(req.query.assistantId || assistants[0]?.id || "");
    const activeAssistant = assistants.find((assistant) => assistant.id === assistantId) || assistants[0];

    if (!activeAssistant) {
      res.json({ assistants: [], activeAssistant: null, contacts: [], conversations: [], messages: [], triggers: [], templates: [], tags: [], products: [], events: [] });
      return;
    }

    res.json({
      assistants,
      activeAssistant,
      contacts: await store.listContacts(activeAssistant.id),
      conversations: await store.listConversations(activeAssistant.id),
      messages: await store.listMessages(activeAssistant.id),
      triggers: await store.listTriggers(activeAssistant.id),
      templates: await store.listTemplates(activeAssistant.id),
      tags: await store.listTags(activeAssistant.id),
      products: await store.listProducts(activeAssistant.id),
      events: await store.listEvents(activeAssistant.id)
    });
  });

  router.post("/assistants", requireAuth(store), async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      countryCode: z.string().min(2),
      phone: z.string().min(5)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const assistant = await store.createAssistant({ ...parsed.data, organizationId: req.user!.organizationId });
    await store.upsertTrigger({
      assistantId: assistant.id,
      name: "interesado_producto",
      type: "intent",
      conditions: ["intención detectada"],
      actions: ["notificar humano", "asignar etiqueta"],
      active: true
    });
    res.status(201).json(assistant);
  });

  router.patch("/assistants/:assistantId", requireAuth(store), async (req, res) => {
    const assistantId = String(req.params.assistantId);
    if (typeof req.body.referenceAssistantId === "string" && !isValidReferenceAssistantId(req.body.referenceAssistantId)) {
      res.status(400).json({ error: "El formato del identificador es incorrecto" });
      return;
    }
    const current = await store.getAssistant(assistantId);
    if (!current || !canAccessAssistant(req.user!, current.organizationId)) {
      res.status(404).json({ error: "Assistant not found" });
      return;
    }
    const validation = await validateWhatsAppChannelPatch(current, req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const blockedChannel = findTemporarilyUnavailableChannel(req.body);
    if (blockedChannel) {
      res.status(400).json({ error: `${channelLabel(blockedChannel)}: Disponible próximamente` });
      return;
    }
    const assistant = await store.updateAssistant(assistantId, req.body);
    res.json(assistant);
  });

  router.post("/assistants/:assistantId/messages", requireAuth(store), async (req, res) => {
    const assistantId = String(req.params.assistantId);
    const assistant = await store.getAssistant(assistantId);
    if (!assistant || !canAccessAssistant(req.user!, assistant.organizationId)) {
      res.status(404).json({ error: "Assistant not found" });
      return;
    }
    const contact = await store.upsertContact({
      assistantId: assistant.id,
      name: req.body.name || req.body.to,
      phone: req.body.to,
      source: "Manual"
    });
    const conversation = await store.upsertConversation({
      assistantId: assistant.id,
      contactId: contact.id,
      assignedTo: "human",
      botEnabled: req.body.botEnabled ?? false,
      lastMessage: req.body.text,
      lastMessageAt: new Date().toISOString(),
      tags: contact.tags
    });
    const sent = await sendWhatsAppText(assistant, contact.phone, String(req.body.text || ""));
    const message = await store.addMessage({
      assistantId: assistant.id,
      conversationId: conversation.id,
      contactId: contact.id,
      direction: "outbound",
      sender: "human",
      type: "text",
      text: req.body.text,
      mediaUrl: "",
      channel: "whatsapp",
      channelMessageId: sent.id,
      status: sent.failed ? "failed" : "sent",
      error: sent.error || "",
      timestamp: new Date().toISOString()
    });
    if (sent.failed) {
      await store.addEvent({
        assistantId: assistant.id,
        contactId: contact.id,
        conversationId: conversation.id,
        type: "manual_message_failed",
        payload: { channel: "whatsapp" }
      });
    }
    res.status(201).json(message);
  });

  router.patch("/assistants/:assistantId/conversations/:conversationId", requireAuth(store), async (req, res) => {
    const schema = z.object({
      status: z.enum(leadStatusesSchema).optional(),
      tags: z.array(z.string().min(1)).optional(),
      assignedTo: z.enum(["bot", "human"]).optional(),
      botEnabled: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const assistant = await store.getAssistant(String(req.params.assistantId));
    if (!assistant || !canAccessAssistant(req.user!, assistant.organizationId)) {
      res.status(404).json({ error: "Assistant not found" });
      return;
    }
    const conversation = (await store.listConversations(assistant.id)).find((item) => item.id === String(req.params.conversationId));
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const updatedConversation = await store.updateConversation(conversation.id, parsed.data);
    const contactPatch = {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.tags ? { tags: parsed.data.tags } : {})
    };
    const updatedContact = Object.keys(contactPatch).length
      ? await store.updateContact(conversation.contactId, contactPatch)
      : undefined;
    res.json({ conversation: updatedConversation, contact: updatedContact });
  });

  router.get("/assistants/:assistantId/contacts/export", requireAuth(store), async (req, res) => {
    const assistant = await store.getAssistant(String(req.params.assistantId));
    if (!assistant || !canAccessAssistant(req.user!, assistant.organizationId)) {
      res.status(404).json({ error: "Assistant not found" });
      return;
    }
    const contacts = filterContacts(await store.listContacts(assistant.id), {
      tag: String(req.query.tag || ""),
      from: String(req.query.from || ""),
      to: String(req.query.to || "")
    });
    const rows = [
      ["Nombre", "Telefono", "Email", "Fuente", "Estado", "Etiquetas", "Score", "Ultimo mensaje", "Anuncio"],
      ...contacts.map((contact) => [
        contact.name,
        contact.phone,
        contact.email,
        contact.source,
        contact.status,
        contact.tags.join(", "),
        String(contact.leadScore),
        contact.lastMessageAt,
        contact.referral?.headline || ""
      ])
    ];
    const workbook = buildContactsWorkbook(rows);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="magnet-contactos-${assistant.id}.xlsx"`);
    res.send(workbook);
  });

  router.post("/assistants/:assistantId/simulate", requireAuth(store), async (req, res) => {
    const assistantId = String(req.params.assistantId);
    const assistant = await store.getAssistant(assistantId);
    if (!assistant || !canAccessAssistant(req.user!, assistant.organizationId)) {
      res.status(404).json({ error: "Assistant not found" });
      return;
    }
    const reply = await generateAssistantReply({
      assistant,
      inboundText: String(req.body.text || ""),
      history: [],
      triggers: await store.listTriggers(assistant.id),
      products: await store.listProducts(assistant.id)
    });
    res.json({ reply });
  });

  router.post("/assistants/:assistantId/triggers", requireAuth(store), async (req, res) => {
    res.status(201).json(await store.upsertTrigger({ ...req.body, assistantId: req.params.assistantId }));
  });

  router.delete("/assistants/:assistantId/triggers/:id", requireAuth(store), async (req, res) => {
    await requireAssistantAccess(req, res, store);
    if (res.headersSent) return;
    res.json({ ok: await store.deleteTrigger(String(req.params.id)) });
  });

  router.post("/assistants/:assistantId/templates", requireAuth(store), async (req, res) => {
    res.status(201).json(await store.upsertTemplate({ ...req.body, assistantId: req.params.assistantId }));
  });

  router.delete("/assistants/:assistantId/templates/:id", requireAuth(store), async (req, res) => {
    await requireAssistantAccess(req, res, store);
    if (res.headersSent) return;
    res.json({ ok: await store.deleteTemplate(String(req.params.id)) });
  });

  router.post("/assistants/:assistantId/tags", requireAuth(store), async (req, res) => {
    res.status(201).json(await store.upsertTag({ ...req.body, assistantId: req.params.assistantId }));
  });

  router.delete("/assistants/:assistantId/tags/:id", requireAuth(store), async (req, res) => {
    await requireAssistantAccess(req, res, store);
    if (res.headersSent) return;
    res.json({ ok: await store.deleteTag(String(req.params.id)) });
  });

  router.post("/assistants/:assistantId/products", requireAuth(store), async (req, res) => {
    const schema = z.object({
      id: z.string().optional(),
      name: z.string().min(2),
      description: z.string().min(3),
      imageUrl: z.string().optional(),
      price: z.string().optional(),
      currency: z.enum(["COP", "USD", "EUR", "MXN"]).default("COP")
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await requireAssistantAccess(req, res, store);
    if (res.headersSent) return;
    res.status(201).json(await store.upsertProduct({ ...parsed.data, assistantId: String(req.params.assistantId) }));
  });

  router.delete("/assistants/:assistantId/products/:id", requireAuth(store), async (req, res) => {
    await requireAssistantAccess(req, res, store);
    if (res.headersSent) return;
    res.json({ ok: await store.deleteProduct(String(req.params.id)) });
  });

  router.post("/admin/users", requireAuth(store), requireAdmin, async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8).optional(),
      role: z.enum(["user", "admin", "superadmin"]).default("user"),
      organizationName: z.string().min(2).optional(),
      planType: z.enum(["Gratis", "Básico", "Profesional", "Avanzado", "Enterprise"]).default("Gratis"),
      messageCredits: z.number().int().min(0).default(100)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const email = parsed.data.email.toLowerCase().trim();
    if (await store.getUserByEmail(email)) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const organization = await store.createOrganization({
      name: parsed.data.organizationName || `${parsed.data.name} Workspace`,
      messageCredits: parsed.data.messageCredits,
      freeMessagesGranted: parsed.data.messageCredits >= 100,
      planType: parsed.data.planType
    });
    const user = await store.createUser({
      organizationId: organization.id,
      name: parsed.data.name,
      email,
      passwordHash: parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : "",
      role: parsed.data.role,
      provider: "email",
      emailVerified: Boolean(parsed.data.password),
      lastLoginAt: ""
    });
    await store.updateOrganization(organization.id, { ownerUserId: user.id });
    res.status(201).json({ user: publicUser(user), organization: await store.getOrganization(organization.id) });
  });

  router.patch("/admin/users/:id", requireAuth(store), requireAdmin, async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      role: z.enum(["user", "admin", "superadmin"]).optional(),
      password: z.string().min(8).optional(),
      planType: z.enum(["Gratis", "Básico", "Profesional", "Avanzado", "Enterprise"]).optional(),
      messageCredits: z.number().int().min(0).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = await store.getUser(String(req.params.id));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const { planType, messageCredits, password, ...userPatch } = parsed.data;
    const nextUser = await store.updateUser(user.id, {
      ...userPatch,
      ...(password ? { passwordHash: await bcrypt.hash(password, 12), provider: "email", emailVerified: true } : {})
    });
    if (planType || typeof messageCredits === "number") {
      await store.updateOrganization(user.organizationId, {
        ...(planType ? { planType } : {}),
        ...(typeof messageCredits === "number" ? { messageCredits } : {})
      });
    }
    res.json({ user: publicUser(nextUser), organization: await store.getOrganization(user.organizationId) });
  });

  router.delete("/admin/users/:id", requireAuth(store), requireAdmin, async (req, res) => {
    if (req.user!.id === req.params.id) {
      res.status(400).json({ error: "No puedes eliminar tu propio usuario desde este panel" });
      return;
    }
    res.json({ ok: await store.deleteUser(String(req.params.id)) });
  });

  return router;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

function signToken(user: User) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
    process.env.JWT_SECRET || "magnet-local-jwt-secret",
    { expiresIn: "8h" }
  );
}

function publicUser(user: User) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    avatarUrl: user.avatarUrl || "",
    companyName: user.companyName || "",
    taxId: user.taxId || "",
    theme: user.theme || "light",
    role: user.role,
    provider: user.provider,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

function initialRoleFor(email: string) {
  const adminEmails = (process.env.MAGNET_ADMIN_EMAILS || "kinotrance@gmail.com")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase()) ? "superadmin" : "user";
}

function filterContacts(contacts: Awaited<ReturnType<Store["listContacts"]>>, filters: { tag: string; from: string; to: string }) {
  const fromTime = filters.from ? new Date(`${filters.from}T00:00:00.000Z`).getTime() : 0;
  const toTime = filters.to ? new Date(`${filters.to}T23:59:59.999Z`).getTime() : Number.POSITIVE_INFINITY;
  return contacts.filter((contact) => {
    const time = new Date(contact.lastMessageAt || contact.createdAt).getTime();
    if (filters.tag && !contact.tags.includes(filters.tag)) return false;
    if (Number.isFinite(fromTime) && time < fromTime) return false;
    if (Number.isFinite(toTime) && time > toTime) return false;
    return true;
  });
}

function requireAuth(store: Store) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || "magnet-local-jwt-secret") as { sub?: string };
      const user = payload.sub ? await store.getUser(payload.sub) : undefined;
      if (!user) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: "Invalid session" });
    }
  };
}

function optionalAuth(store: Store) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      next();
      return;
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || "magnet-local-jwt-secret") as { sub?: string };
      req.user = payload.sub ? await store.getUser(payload.sub) : undefined;
    } catch {
      req.user = undefined;
    }
    next();
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isAdmin(req.user)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

function isAdmin(user: User) {
  return ["admin", "superadmin"].includes(user.role);
}

function findTemporarilyUnavailableChannel(patch: Partial<Assistant>) {
  const channels = (patch.channels || {}) as Partial<Assistant["channels"]>;
  for (const channel of temporarilyUnavailableChannels) {
    if (channels[channel]?.enabled) return channel;
  }
  return "";
}

function channelLabel(channel: ChannelType) {
  if (channel === "instagram") return "Instagram";
  if (channel === "messenger") return "Messenger";
  if (channel === "wordpress") return "WordPress";
  return channel;
}

function parseMercadoPagoReference(value: unknown) {
  if (typeof value !== "string") return { organizationId: "", userId: "", packageId: "" };
  try {
    const parsed = JSON.parse(value) as { organizationId?: unknown; userId?: unknown; packageId?: unknown };
    return {
      organizationId: typeof parsed.organizationId === "string" ? parsed.organizationId : "",
      userId: typeof parsed.userId === "string" ? parsed.userId : "",
      packageId: typeof parsed.packageId === "string" ? parsed.packageId : ""
    };
  } catch {
    return { organizationId: "", userId: "", packageId: "" };
  }
}

function isValidMercadoPagoSignature(req: Request) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return true;

  const signatureHeader = String(req.headers["x-signature"] || "");
  const requestId = String(req.headers["x-request-id"] || "");
  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((part) => part.split("=", 2).map((value) => value.trim()))
      .filter((part): part is [string, string] => part.length === 2 && Boolean(part[0]) && Boolean(part[1]))
  );
  const ts = parts.ts || "";
  const hash = parts.v1 || "";
  if (!requestId || !ts || !hash) return false;

  const body = req.body as { data?: { id?: string | number } };
  const dataId = String(req.query["data.id"] || body.data?.id || "").toLowerCase();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  return safeEqual(hash, expected);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function validateWhatsAppChannelPatch(current: Assistant, patch: Partial<Assistant>) {
  const incoming = patch.channels?.whatsapp;
  if (!incoming) return { ok: true };

  const channel: ChannelSettings = {
    ...current.channels.whatsapp,
    ...incoming,
    credentials: {
      ...current.channels.whatsapp.credentials,
      ...incoming.credentials
    }
  };

  const tokenValue = channel.credentials.permanentAccessTokenEncrypted || "";
  const phoneNumberId = channel.credentials.phoneNumberId || "";
  const touchedCredentials = Boolean(tokenValue || phoneNumberId);

  if (!channel.enabled || !touchedCredentials) return { ok: true };
  if (!tokenValue || !phoneNumberId) {
    return { ok: false, error: "Para activar WhatsApp necesitas guardar el ID numero de telefono y un token de acceso de Meta." };
  }

  let token = "";
  try {
    token = decryptSecret(tokenValue);
  } catch {
    return { ok: false, error: "No se pudo leer el token de WhatsApp guardado. Pega nuevamente el token de acceso de Meta." };
  }

  const version = process.env.META_GRAPH_VERSION || "v22.0";
  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.ok) return { ok: true };

    const error = await readMetaValidationError(response);
    return {
      ok: false,
      error: `No se pudo validar WhatsApp con Meta. Revisa que el token pertenezca al mismo WABA y phone_number_id. Meta respondio ${response.status}${error ? `: ${error}` : "."}`
    };
  } catch {
    return { ok: false, error: "No se pudo conectar con Meta para validar WhatsApp. Intenta guardar nuevamente en unos segundos." };
  }
}

async function readMetaValidationError(response: globalThis.Response) {
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

function canAccessAssistant(user: User, organizationId: string) {
  return isAdmin(user) || user.organizationId === organizationId;
}

async function requireAssistantAccess(req: Request, res: Response, store: Store) {
  const assistant = await store.getAssistant(String(req.params.assistantId));
  if (!assistant || !req.user || !canAccessAssistant(req.user, assistant.organizationId)) {
    res.status(404).json({ error: "Assistant not found" });
  }
}

async function verifyGoogleCredential(credential: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return undefined;

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) return undefined;
  const payload = await response.json() as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string;
    name?: string;
    picture?: string;
  };

  if (payload.aud !== clientId || !payload.sub || !payload.email || payload.email_verified !== "true") {
    return undefined;
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split("@")[0],
    picture: payload.picture || ""
  };
}
