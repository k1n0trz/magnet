import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { decryptSecret } from "../lib/crypto";
import { isValidReferenceAssistantId } from "../lib/validation";
import { generateAssistantReply } from "../services/ai";
import { sendWhatsAppText } from "../services/whatsapp";
import type { Assistant, ChannelSettings, MessagePackage, Store, User } from "../types";

interface RuntimeStatus {
  persistence: "memory" | "mongo";
  realWhatsAppEnabled: boolean;
}

const messagePackages: MessagePackage[] = [
  { id: "messages-500", name: "500 mensajes", messages: 500, priceCop: 29900, currency: "COP" },
  { id: "messages-1000", name: "1000 mensajes", messages: 1000, priceCop: 49900, currency: "COP" },
  { id: "messages-2000", name: "2000 mensajes", messages: 2000, priceCop: 89900, currency: "COP" },
  { id: "messages-5000", name: "5000 mensajes", messages: 5000, priceCop: 199900, currency: "COP" }
];

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
    } else {
      await store.updateUser(user.id, {
        provider: user.provider === "email" ? user.provider : "google",
        googleSub: user.googleSub || profile.sub,
        emailVerified: true,
        lastLoginAt: new Date().toISOString()
      });
    }

    res.json({ token: signToken(user), user: publicUser(user), organization: await store.getOrganization(user.organizationId) });
  });

  router.get("/billing/packages", (_req, res) => {
    res.json({ packages: messagePackages, mercadoPagoConfigured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN) });
  });

  router.post("/billing/checkout", requireAuth(store), async (req, res) => {
    const schema = z.object({ packageId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const selectedPackage = messagePackages.find((item) => item.id === parsed.data.packageId);
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: [{
          id: selectedPackage.id,
          title: `MAGNET - ${selectedPackage.name}`,
          description: `${selectedPackage.messages} mensajes para respuestas automaticas de IA`,
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
    // Mercado Pago confirmation and crediting will be enabled once production credentials are available.
    res.status(202).json({ ok: true });
  });

  router.get("/me", requireAuth(store), async (req, res) => {
    const user = req.user!;
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
      packages: messagePackages,
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
  };

  if (payload.aud !== clientId || !payload.sub || !payload.email || payload.email_verified !== "true") {
    return undefined;
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split("@")[0]
  };
}
