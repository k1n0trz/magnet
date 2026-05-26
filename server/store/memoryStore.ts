import { v4 as uuid } from "uuid";
import { encryptSecret, randomToken } from "../lib/crypto";
import type {
  Assistant,
  ChannelSettings,
  ChannelType,
  Contact,
  Conversation,
  CreditLedgerEntry,
  LeadEvent,
  Message,
  Organization,
  ProductService,
  Store,
  Tag,
  Template,
  Trigger,
  User
} from "../types";

const now = () => new Date().toISOString();

function mergeTags(existing: string[] = [], incoming: string[] = []) {
  return Array.from(new Set([...existing, ...incoming].filter(Boolean)));
}

function webhookUrl(assistantId: string, channel: ChannelType = "whatsapp") {
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:4000";
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/${assistantId}/${channel}`;
}

function defaultPrompt(name: string) {
  return [
    `Eres ${name}, un asistente comercial de WhatsApp Business.`,
    "Responde con claridad, tono amable y foco en convertir leads.",
    "Pide solo los datos necesarios, confirma intención de compra y nunca inventes políticas."
  ].join("\n");
}

function buildChannels(
  assistantId: string,
  input?: Partial<Record<ChannelType, Partial<ChannelSettings>>>
): Record<ChannelType, ChannelSettings> {
  const whatsappInput = input?.whatsapp || {};
  const token = typeof whatsappInput === "object" && "credentials" in whatsappInput
    ? whatsappInput.credentials?.permanentAccessTokenEncrypted
    : "";

  return {
    whatsapp: {
      channel: "whatsapp",
      enabled: true,
      webhookUrl: whatsappInput.webhookUrl || webhookUrl(assistantId, "whatsapp"),
      webhookSecret: whatsappInput.webhookSecret || randomToken(24),
      verifyToken: whatsappInput.verifyToken || randomToken(24),
      credentials: {
        permanentAccessTokenEncrypted: token ? encryptSecret(token) : "",
        phoneNumberId: whatsappInput.credentials?.phoneNumberId || "",
        whatsappBusinessAccountId: whatsappInput.credentials?.whatsappBusinessAccountId || "",
        metaAppId: whatsappInput.credentials?.metaAppId || ""
      },
      createdAt: whatsappInput.createdAt || now(),
      updatedAt: whatsappInput.updatedAt || now()
    },
    instagram: {
      channel: "instagram",
      enabled: false,
      webhookUrl: webhookUrl(assistantId, "instagram"),
      webhookSecret: randomToken(24),
      verifyToken: randomToken(24),
      credentials: {},
      createdAt: now(),
      updatedAt: now()
    },
    messenger: {
      channel: "messenger",
      enabled: false,
      webhookUrl: webhookUrl(assistantId, "messenger"),
      webhookSecret: randomToken(24),
      verifyToken: randomToken(24),
      credentials: {},
      createdAt: now(),
      updatedAt: now()
    },
    wordpress: {
      channel: "wordpress",
      enabled: false,
      webhookUrl: webhookUrl(assistantId, "wordpress"),
      webhookSecret: randomToken(24),
      verifyToken: randomToken(24),
      credentials: {},
      createdAt: now(),
      updatedAt: now()
    },
    telegram: {
      channel: "telegram",
      enabled: false,
      webhookUrl: webhookUrl(assistantId, "telegram"),
      webhookSecret: randomToken(24),
      verifyToken: randomToken(24),
      credentials: {},
      createdAt: now(),
      updatedAt: now()
    },
    sms: {
      channel: "sms",
      enabled: false,
      webhookUrl: webhookUrl(assistantId, "sms"),
      webhookSecret: randomToken(24),
      verifyToken: randomToken(24),
      credentials: {},
      createdAt: now(),
      updatedAt: now()
    }
  };
}

export function buildAssistant(input: Partial<Assistant>): Assistant {
  const id = input.id || uuid();
  const createdAt = input.createdAt || now();

  return {
    id,
    organizationId: input.organizationId || "seed-org",
    name: input.name || "Seller Comfama",
    countryCode: input.countryCode || "CO +57",
    phone: input.phone || "3138851960",
    status: input.status || "active",
    welcomeMessageId: input.welcomeMessageId || "",
    referenceAssistantId: input.referenceAssistantId || "",
    prompt: input.prompt || defaultPrompt(input.name || "Seller Comfama"),
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    ai: {
      assistantId: id,
      status: input.ai?.status || "active",
      responseDelaySeconds: input.ai?.responseDelaySeconds ?? 30,
      textResponseProbability: input.ai?.textResponseProbability ?? 80,
      audioResponseProbability: input.ai?.audioResponseProbability ?? 20,
      modelProvider: input.ai?.modelProvider || defaultModelProvider(),
      modelName: input.ai?.modelName || defaultModelName(),
      temperature: input.ai?.temperature ?? 0.6,
      maxTokens: input.ai?.maxTokens ?? 700,
      personality: input.ai?.personality || "Consultivo, directo y orientado a venta",
      tone: input.ai?.tone || "Amable",
      formalityLevel: input.ai?.formalityLevel || "Profesional cercano",
      systemRules: input.ai?.systemRules || "No prometas disponibilidad, precios o entregas sin confirmación.",
      forbiddenPhrases: input.ai?.forbiddenPhrases || ["no puedo ayudarte", "soy solo un bot"],
      importantKeywords: input.ai?.importantKeywords || ["precio", "pago", "comprar", "asesor"],
      mainLanguage: input.ai?.mainLanguage || "es",
      allowedLanguages: input.ai?.allowedLanguages || ["es", "en"],
      audioEnabled: input.ai?.audioEnabled ?? false,
      voice: input.ai?.voice || "alloy",
      voiceSpeed: input.ai?.voiceSpeed ?? 1,
      transcribeIncomingAudio: input.ai?.transcribeIncomingAudio ?? true
    },
    operations: {
      ownerWhatsAppNumber: input.operations?.ownerWhatsAppNumber || "",
      summaryEnabled: input.operations?.summaryEnabled ?? false,
      summaryIntervalHours: input.operations?.summaryIntervalHours ?? 6,
      lastSummaryAt: input.operations?.lastSummaryAt || "",
      newConversationAlertsEnabled: input.operations?.newConversationAlertsEnabled ?? true,
      remarketingEnabled: input.operations?.remarketingEnabled ?? false,
      remarketingDelayHours: input.operations?.remarketingDelayHours ?? 24,
      remarketingWebsiteUrl: input.operations?.remarketingWebsiteUrl || "",
      remarketingMessage: input.operations?.remarketingMessage || "Hola, queria retomar nuestra conversacion. Si aun te interesa, podemos avanzar con los datos de tu empresa. Tambien puedes visitar nuestro sitio web para conocer mas."
    },
    channels: buildChannels(id, input.channels)
  };
}

function defaultModelProvider(): Assistant["ai"]["modelProvider"] {
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "local";
}

function defaultModelName() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_MODEL || "gpt-4o-mini";
  return "magnet-local";
}

export function createMemoryStore(seed = false): Store {
  const assistants: Assistant[] = [];
  const contacts: Contact[] = [];
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  const triggers: Trigger[] = [];
  const templates: Template[] = [];
  const tags: Tag[] = [];
  const products: ProductService[] = [];
  const events: LeadEvent[] = [];
  const organizations: Organization[] = [];
  const users: User[] = [];
  const creditLedger: CreditLedgerEntry[] = [];

  const store: Store = {
    async createOrganization(input) {
      const organization: Organization = {
        id: input.id || uuid(),
        name: input.name,
        ownerUserId: input.ownerUserId || "",
        messageCredits: input.messageCredits ?? 0,
        freeMessagesGranted: input.freeMessagesGranted ?? false,
        planType: input.planType || "Gratis",
        createdAt: now(),
        updatedAt: now()
      };
      organizations.push(organization);
      return organization;
    },
    async updateOrganization(id, patch) {
      const organization = organizations.find((item) => item.id === id);
      if (!organization) throw new Error("Organization not found");
      Object.assign(organization, patch, { updatedAt: now() });
      return organization;
    },
    async getOrganization(id) {
      return organizations.find((organization) => organization.id === id);
    },
    async listOrganizations() {
      return organizations;
    },
    async createUser(input) {
      const email = input.email.toLowerCase().trim();
      const user: User = {
        id: uuid(),
        organizationId: input.organizationId,
        name: input.name,
        email,
        phone: input.phone || "",
        avatarUrl: input.avatarUrl || "",
        companyName: input.companyName || "",
        taxId: input.taxId || "",
        theme: input.theme || "light",
        passwordHash: input.passwordHash || "",
        role: input.role || "user",
        provider: input.provider || "email",
        googleSub: input.googleSub || "",
        emailVerified: input.emailVerified ?? false,
        createdAt: now(),
        updatedAt: now(),
        lastLoginAt: input.lastLoginAt || ""
      };
      users.push(user);
      return user;
    },
    async updateUser(id, patch) {
      const user = users.find((item) => item.id === id);
      if (!user) throw new Error("User not found");
      Object.assign(user, patch, { updatedAt: now() });
      return user;
    },
    async deleteUser(id) {
      const index = users.findIndex((item) => item.id === id);
      if (index === -1) return false;
      users.splice(index, 1);
      return true;
    },
    async getUser(id) {
      return users.find((user) => user.id === id);
    },
    async getUserByEmail(email) {
      return users.find((user) => user.email === email.toLowerCase().trim());
    },
    async getUserByGoogleSub(googleSub) {
      return users.find((user) => user.googleSub === googleSub);
    },
    async listUsers() {
      return users;
    },
    async addCredits(input) {
      const organization = organizations.find((item) => item.id === input.organizationId);
      if (!organization) throw new Error("Organization not found");
      organization.messageCredits += input.amount;
      organization.updatedAt = now();
      const entry: CreditLedgerEntry = {
        id: uuid(),
        organizationId: input.organizationId,
        userId: input.userId || "",
        type: input.type,
        amount: input.amount,
        balanceAfter: organization.messageCredits,
        description: input.description,
        metadata: input.metadata || {},
        createdAt: now()
      };
      creditLedger.push(entry);
      return entry;
    },
    async consumeCredits(input) {
      const organization = organizations.find((item) => item.id === input.organizationId);
      if (!organization || organization.messageCredits < input.amount) return undefined;
      organization.messageCredits -= input.amount;
      organization.updatedAt = now();
      const entry: CreditLedgerEntry = {
        id: uuid(),
        organizationId: input.organizationId,
        userId: "",
        type: "usage",
        amount: -Math.abs(input.amount),
        balanceAfter: organization.messageCredits,
        description: input.description,
        metadata: input.metadata || {},
        createdAt: now()
      };
      creditLedger.push(entry);
      return entry;
    },
    async listCreditLedger(organizationId) {
      return creditLedger.filter((entry) => !organizationId || entry.organizationId === organizationId);
    },
    async createAssistant(input) {
      const assistant = buildAssistant(input);
      assistants.push(assistant);
      return assistant;
    },
    async updateAssistant(id, patch) {
      const assistant = assistants.find((item) => item.id === id);
      if (!assistant) throw new Error("Assistant not found");
      Object.assign(assistant, patch, { updatedAt: now() });
      assistant.ai = { ...assistant.ai, ...patch.ai, assistantId: id };
      assistant.operations = { ...assistant.operations, ...patch.operations };
      if (patch.channels) {
        Object.keys(patch.channels).forEach((channel) => {
          const patchChannel = patch.channels![channel as ChannelType];
          if (patchChannel) {
            const existing = assistant.channels[channel as ChannelType];
            if (existing && patchChannel.credentials?.permanentAccessTokenEncrypted) {
              patchChannel.credentials.permanentAccessTokenEncrypted = encryptSecret(
                patchChannel.credentials.permanentAccessTokenEncrypted
              );
            }
            assistant.channels[channel as ChannelType] = {
              ...existing,
              ...patchChannel,
              updatedAt: now()
            };
          }
        });
      }
      return assistant;
    },
    async listAssistants() {
      return assistants;
    },
    async getAssistant(id) {
      return assistants.find((assistant) => assistant.id === id);
    },
    async upsertContact(input) {
      const existing = contacts.find((contact) => contact.assistantId === input.assistantId && contact.phone === input.phone);
      if (existing) {
        Object.assign(existing, input, {
          tags: mergeTags(existing.tags, input.tags),
          updatedAt: now(),
          lastMessageAt: input.lastMessageAt || now()
        });
        return existing;
      }
      const contact: Contact = {
        id: uuid(),
        assistantId: input.assistantId,
        name: input.name || input.phone,
        phone: input.phone,
        email: input.email || "",
        source: input.source || "WhatsApp",
        tags: input.tags || [],
        referral: input.referral,
        leadScore: input.leadScore ?? 45,
        status: input.status || "Nuevo",
        lastMessageAt: input.lastMessageAt || now(),
        createdAt: now(),
        updatedAt: now()
      };
      contacts.push(contact);
      return contact;
    },
    async updateContact(id, patch) {
      const contact = contacts.find((item) => item.id === id);
      if (!contact) throw new Error("Contact not found");
      Object.assign(contact, patch, { updatedAt: now() });
      return contact;
    },
    async listContacts(assistantId) {
      return contacts.filter((contact) => contact.assistantId === assistantId);
    },
    async upsertConversation(input) {
      const existing = conversations.find((conversation) => conversation.assistantId === input.assistantId && conversation.contactId === input.contactId);
      if (existing) {
        Object.assign(existing, input, { tags: mergeTags(existing.tags, input.tags), updatedAt: now() });
        return existing;
      }
      const conversation: Conversation = {
        id: uuid(),
        assistantId: input.assistantId,
        contactId: input.contactId,
        status: input.status || "Nuevo",
        assignedTo: input.assignedTo || "bot",
        botEnabled: input.botEnabled ?? true,
        lastMessage: input.lastMessage || "",
        lastMessageAt: input.lastMessageAt || now(),
        tags: input.tags || [],
        referral: input.referral,
        createdAt: now(),
        updatedAt: now()
      };
      conversations.push(conversation);
      return conversation;
    },
    async updateConversation(id, patch) {
      const conversation = conversations.find((item) => item.id === id);
      if (!conversation) throw new Error("Conversation not found");
      Object.assign(conversation, patch, { updatedAt: now() });
      return conversation;
    },
    async listConversations(assistantId) {
      return conversations.filter((conversation) => conversation.assistantId === assistantId);
    },
    async addMessage(input) {
      const message: Message = { ...input, id: uuid(), createdAt: now() };
      messages.push(message);
      const conversation = conversations.find((item) => item.id === input.conversationId);
      if (conversation) {
        conversation.lastMessage = input.text;
        conversation.lastMessageAt = input.timestamp;
        conversation.updatedAt = now();
      }
      return message;
    },
    async updateMessageStatus(input) {
      const message = messages.find((item) => item.assistantId === input.assistantId && item.channelMessageId === input.channelMessageId);
      if (!message) return undefined;
      message.status = input.status;
      return message;
    },
    async listMessages(assistantId, conversationId) {
      return messages.filter((message) => message.assistantId === assistantId && (!conversationId || message.conversationId === conversationId));
    },
    async listTriggers(assistantId) {
      return triggers.filter((trigger) => trigger.assistantId === assistantId);
    },
    async upsertTrigger(input) {
      const existing = input.id ? triggers.find((trigger) => trigger.id === input.id) : undefined;
      if (existing) {
        Object.assign(existing, input, { updatedAt: now() });
        return existing;
      }
      const trigger: Trigger = {
        id: uuid(),
        assistantId: input.assistantId,
        name: input.name,
        type: input.type || "keyword",
        conditions: input.conditions || ["contiene texto"],
        actions: input.actions || ["enviar mensaje"],
        active: input.active ?? true,
        createdAt: now(),
        updatedAt: now()
      };
      triggers.push(trigger);
      return trigger;
    },
    async deleteTrigger(id) {
      const index = triggers.findIndex((trigger) => trigger.id === id);
      if (index === -1) return false;
      triggers.splice(index, 1);
      return true;
    },
    async listTemplates(assistantId) {
      return templates.filter((template) => template.assistantId === assistantId);
    },
    async upsertTemplate(input) {
      const existing = input.id ? templates.find((template) => template.id === input.id) : undefined;
      if (existing) {
        Object.assign(existing, input, { updatedAt: now() });
        return existing;
      }
      const template: Template = {
        id: uuid(),
        assistantId: input.assistantId,
        name: input.name,
        type: input.type || "utility",
        language: input.language || "es_CO",
        body: input.body || "Hola {{1}}, gracias por escribirnos.",
        variables: input.variables || ["nombre"],
        metaTemplateId: input.metaTemplateId || "",
        status: input.status || "draft",
        createdAt: now(),
        updatedAt: now()
      };
      templates.push(template);
      return template;
    },
    async deleteTemplate(id) {
      const index = templates.findIndex((template) => template.id === id);
      if (index === -1) return false;
      templates.splice(index, 1);
      return true;
    },
    async listTags(assistantId) {
      return tags.filter((tag) => tag.assistantId === assistantId);
    },
    async upsertTag(input) {
      const existing = input.id ? tags.find((tag) => tag.id === input.id) : undefined;
      if (existing) return Object.assign(existing, input);
      const tag: Tag = {
        id: uuid(),
        assistantId: input.assistantId,
        name: input.name,
        color: input.color || "#25d366",
        createdAt: now()
      };
      tags.push(tag);
      return tag;
    },
    async deleteTag(id) {
      const index = tags.findIndex((tag) => tag.id === id);
      if (index === -1) return false;
      tags.splice(index, 1);
      return true;
    },
    async listProducts(assistantId) {
      return products.filter((product) => product.assistantId === assistantId);
    },
    async upsertProduct(input) {
      const existing = input.id ? products.find((product) => product.id === input.id) : undefined;
      if (existing) {
        Object.assign(existing, input, { updatedAt: now() });
        return existing;
      }
      const product: ProductService = {
        id: uuid(),
        assistantId: input.assistantId,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl || "",
        price: input.price || "",
        currency: input.currency || "COP",
        createdAt: now(),
        updatedAt: now()
      };
      products.push(product);
      return product;
    },
    async deleteProduct(id) {
      const index = products.findIndex((product) => product.id === id);
      if (index === -1) return false;
      products.splice(index, 1);
      return true;
    },
    async listEvents(assistantId) {
      return events.filter((event) => event.assistantId === assistantId);
    },
    async addEvent(input) {
      const event: LeadEvent = { ...input, id: uuid(), createdAt: now() };
      events.push(event);
      return event;
    }
  };

  if (seed) {
    void seedStore(store);
  }

  return store;
}

async function seedStore(store: Store) {
  await store.createOrganization({
    id: "seed-org",
    name: "MAGNET Starter",
    ownerUserId: "",
    messageCredits: 100,
    freeMessagesGranted: true,
    planType: "Gratis"
  });
  const assistant = await store.createAssistant({ name: "Seller Comfama", countryCode: "CO +57", phone: "3138851960" });
  await store.createAssistant({ name: "Uva Women's Care", countryCode: "CO +57", phone: "3206419792", status: "active" });
  await store.createAssistant({ name: "Copa Ecuador", countryCode: "EC +593", phone: "967543688", status: "inactive" });
  const tagHot = await store.upsertTag({ assistantId: assistant.id, name: "caliente", color: "#ef7b2d" });
  await store.upsertTag({ assistantId: assistant.id, name: "lista_para_compra", color: "#8b5cf6" });
  await Promise.all([
    "cliente_solicita_medios_de_pago",
    "comprobante_pago",
    "datos_recibidos",
    "interesado_producto",
    "link_pago_tarjeta_de_credito"
  ].map((name) => store.upsertTrigger({
    assistantId: assistant.id,
    name,
    type: name.includes("pago") ? "intent" : "keyword",
    conditions: ["contiene texto", "estado del lead"],
    actions: ["enviar mensaje", "asignar etiqueta"],
    active: true
  })));
  await store.upsertTemplate({
    assistantId: assistant.id,
    name: "bienvenida_ventas",
    type: "utility",
    language: "es_CO",
    body: "Hola {{1}}, soy el asistente de Seller Comfama. ¿Qué producto te interesa?",
    status: "approved"
  });
  await store.upsertProduct({
    assistantId: assistant.id,
    name: "Plan mensual",
    description: "Acompañamiento mensual para gestionar conversaciones, calificar leads y acelerar cierres desde WhatsApp.",
    price: "199000",
    currency: "COP",
    imageUrl: ""
  });
  for (const item of [
    ["Juan David", "573001112233", "Hola, quiero comprar", "Nuevo"],
    ["María Gómez", "573004445566", "Ya envié mis datos", "Calificado"],
    ["Pedro Silva", "573007778899", "¿Tienen medios de pago?", "En negociación"]
  ] as const) {
    const contact = await store.upsertContact({
      assistantId: assistant.id,
      name: item[0],
      phone: item[1],
      tags: item[0] === "Pedro Silva" ? [tagHot.name] : [],
      status: item[3]
    });
    const conversation = await store.upsertConversation({
      assistantId: assistant.id,
      contactId: contact.id,
      status: item[3],
      lastMessage: item[2],
      tags: contact.tags,
      botEnabled: item[0] !== "María Gómez"
    });
    await store.addMessage({
      assistantId: assistant.id,
      conversationId: conversation.id,
      contactId: contact.id,
      direction: "inbound",
      sender: "customer",
      type: "text",
      text: item[2],
      mediaUrl: "",
      channel: "whatsapp",
      channelMessageId: `seed-${contact.id}`,
      status: "received",
      timestamp: now()
    });
  }
}
