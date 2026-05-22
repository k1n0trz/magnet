import mongoose, { Schema } from "mongoose";
import { randomUUID } from "node:crypto";
import { encryptSecret, maskSecret } from "../lib/crypto";
import type {
  Assistant,
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
import { buildAssistant } from "./memoryStore";

const looseSchema = new Schema({ id: { type: String, index: true } }, { strict: false, versionKey: false, id: false });

const AssistantModel = mongoose.models.Assistant || mongoose.model("Assistant", looseSchema);
const ContactModel = mongoose.models.Contact || mongoose.model("Contact", looseSchema);
const ConversationModel = mongoose.models.Conversation || mongoose.model("Conversation", looseSchema);
const MessageModel = mongoose.models.Message || mongoose.model("Message", looseSchema);
const TriggerModel = mongoose.models.Trigger || mongoose.model("Trigger", looseSchema);
const TemplateModel = mongoose.models.Template || mongoose.model("Template", looseSchema);
const TagModel = mongoose.models.Tag || mongoose.model("Tag", looseSchema);
const ProductModel = mongoose.models.ProductService || mongoose.model("ProductService", looseSchema);
const LeadEventModel = mongoose.models.LeadEvent || mongoose.model("LeadEvent", looseSchema);
const OrganizationModel = mongoose.models.Organization || mongoose.model("Organization", looseSchema);
const UserModel = mongoose.models.User || mongoose.model("User", looseSchema);
const CreditLedgerModel = mongoose.models.CreditLedger || mongoose.model("CreditLedger", looseSchema);

const now = () => new Date().toISOString();

function mergeTags(existing: string[] = [], incoming: string[] = []) {
  return Array.from(new Set([...existing, ...incoming].filter(Boolean)));
}

export async function connectMongoStore(uri: string): Promise<Store> {
  await mongoose.connect(uri);
  return createMongoStore();
}

function clean<T>(doc: unknown): T {
  const value = doc as T & { _id?: unknown };
  delete value._id;
  return value as T;
}

function createMongoStore(): Store {
  return {
    async createOrganization(input) {
      const organization: Organization = {
        id: input.id || randomUUID(),
        name: input.name,
        ownerUserId: input.ownerUserId || "",
        messageCredits: input.messageCredits ?? 0,
        freeMessagesGranted: input.freeMessagesGranted ?? false,
        planType: input.planType || "Gratis",
        createdAt: input.createdAt || now(),
        updatedAt: now()
      };
      await OrganizationModel.create(organization);
      return organization;
    },
    async updateOrganization(id, patch) {
      const existingDoc = await OrganizationModel.findOne({ id }).lean();
      if (!existingDoc) {
        const created: Organization = {
          id,
          name: patch.name || "Workspace",
          ownerUserId: patch.ownerUserId || "",
          messageCredits: patch.messageCredits ?? 0,
          freeMessagesGranted: patch.freeMessagesGranted ?? false,
          planType: patch.planType || "Gratis",
          createdAt: patch.createdAt || now(),
          updatedAt: now()
        };
        await OrganizationModel.updateOne({ id }, { $set: created }, { upsert: true });
        return created;
      }
      const next: Organization = { ...clean<Organization>(existingDoc), ...patch, updatedAt: now() };
      await OrganizationModel.updateOne({ id }, { $set: next }, { upsert: true });
      return next;
    },
    async getOrganization(id) {
      const doc = await OrganizationModel.findOne({ id }).lean();
      return doc ? clean<Organization>(doc) : undefined;
    },
    async listOrganizations() {
      return (await OrganizationModel.find().lean()).map((doc) => clean<Organization>(doc));
    },
    async createUser(input) {
      const user: User = {
        id: input.id || randomUUID(),
        organizationId: input.organizationId,
        name: input.name,
        email: input.email.toLowerCase().trim(),
        passwordHash: input.passwordHash || "",
        role: input.role || "user",
        provider: input.provider || "email",
        googleSub: input.googleSub || "",
        emailVerified: input.emailVerified ?? false,
        createdAt: input.createdAt || now(),
        updatedAt: now(),
        lastLoginAt: input.lastLoginAt || ""
      };
      await UserModel.create(user);
      return user;
    },
    async updateUser(id, patch) {
      const existingDoc = await UserModel.findOne({ id }).lean();
      if (!existingDoc) throw new Error("User not found");
      const next: User = { ...clean<User>(existingDoc), ...patch, updatedAt: now() };
      await UserModel.updateOne({ id }, { $set: next });
      return next;
    },
    async deleteUser(id) {
      const result = await UserModel.deleteOne({ id });
      return result.deletedCount > 0;
    },
    async getUser(id) {
      const doc = await UserModel.findOne({ id }).lean();
      return doc ? clean<User>(doc) : undefined;
    },
    async getUserByEmail(email) {
      const doc = await UserModel.findOne({ email: email.toLowerCase().trim() }).lean();
      return doc ? clean<User>(doc) : undefined;
    },
    async getUserByGoogleSub(googleSub) {
      const doc = await UserModel.findOne({ googleSub }).lean();
      return doc ? clean<User>(doc) : undefined;
    },
    async listUsers() {
      return (await UserModel.find().lean()).map((doc) => clean<User>(doc));
    },
    async addCredits(input) {
      const organization = await this.getOrganization(input.organizationId);
      if (!organization) throw new Error("Organization not found");
      const balanceAfter = organization.messageCredits + input.amount;
      await OrganizationModel.updateOne({ id: input.organizationId }, { $set: { messageCredits: balanceAfter, updatedAt: now() } });
      const entry: CreditLedgerEntry = {
        id: randomUUID(),
        organizationId: input.organizationId,
        userId: input.userId || "",
        type: input.type,
        amount: input.amount,
        balanceAfter,
        description: input.description,
        metadata: input.metadata || {},
        createdAt: now()
      };
      await CreditLedgerModel.create(entry);
      return entry;
    },
    async consumeCredits(input) {
      const organization = await this.getOrganization(input.organizationId);
      if (!organization || organization.messageCredits < input.amount) return undefined;
      const balanceAfter = organization.messageCredits - input.amount;
      await OrganizationModel.updateOne({ id: input.organizationId }, { $set: { messageCredits: balanceAfter, updatedAt: now() } });
      const entry: CreditLedgerEntry = {
        id: randomUUID(),
        organizationId: input.organizationId,
        userId: "",
        type: "usage",
        amount: -Math.abs(input.amount),
        balanceAfter,
        description: input.description,
        metadata: input.metadata || {},
        createdAt: now()
      };
      await CreditLedgerModel.create(entry);
      return entry;
    },
    async listCreditLedger(organizationId) {
      const query = organizationId ? { organizationId } : {};
      return (await CreditLedgerModel.find(query).lean()).map((doc) => clean<CreditLedgerEntry>(doc));
    },
    async createAssistant(input) {
      const assistant = buildAssistant(input);
      await AssistantModel.create(assistant);
      return assistant;
    },
    async updateAssistant(id, patch) {
      const existing = clean<Assistant>(await AssistantModel.findOne({ id }).lean());
      if (!existing) throw new Error("Assistant not found");
      const channels = patch.channels ? { ...existing.channels, ...patch.channels } : existing.channels;
      if (patch.channels) {
        Object.keys(patch.channels).forEach((channel) => {
          const channelId = channel as keyof Assistant["channels"];
          const patchChannel = patch.channels?.[channelId];
          if (patchChannel?.credentials?.permanentAccessTokenEncrypted) {
            channels[channelId] = {
              ...channels[channelId],
              ...patchChannel,
              credentials: {
                ...channels[channelId].credentials,
                ...patchChannel.credentials,
                permanentAccessTokenEncrypted: encryptSecret(patchChannel.credentials.permanentAccessTokenEncrypted)
              },
              updatedAt: now()
            };
          }
        });
      }
      const next: Assistant = {
        ...existing,
        ...patch,
        ai: { ...existing.ai, ...patch.ai, assistantId: id },
        channels,
        updatedAt: now()
      };
      await AssistantModel.updateOne({ id }, { $set: next }, { upsert: true });
      return next;
    },
    async listAssistants() {
      return (await AssistantModel.find().lean()).map((doc) => clean<Assistant>(doc));
    },
    async getAssistant(id) {
      const doc = await AssistantModel.findOne({ id }).lean();
      return doc ? clean<Assistant>(doc) : undefined;
    },
    async upsertContact(input) {
      const existing = await ContactModel.findOne({ assistantId: input.assistantId, phone: input.phone }).lean();
      const current = existing ? clean<Contact>(existing) : undefined;
      const contact: Contact = {
        id: current?.id || randomUUID(),
        assistantId: input.assistantId,
        name: input.name || input.phone,
        phone: input.phone,
        email: input.email || "",
        source: input.source || "WhatsApp",
        tags: mergeTags(current?.tags, input.tags),
        leadScore: input.leadScore ?? current?.leadScore ?? 45,
        status: input.status || current?.status || "Nuevo",
        lastMessageAt: input.lastMessageAt || now(),
        createdAt: current?.createdAt || now(),
        updatedAt: now()
      };
      await ContactModel.updateOne({ assistantId: input.assistantId, phone: input.phone }, { $set: contact }, { upsert: true });
      return contact;
    },
    async listContacts(assistantId) {
      return (await ContactModel.find({ assistantId }).lean()).map((doc) => clean<Contact>(doc));
    },
    async upsertConversation(input) {
      const query = { assistantId: input.assistantId, contactId: input.contactId };
      const existingDoc = await ConversationModel.findOne(query).lean();
      const existing = existingDoc ? clean<Conversation>(existingDoc) : undefined;
      const conversation: Conversation = {
        id: input.id || existing?.id || randomUUID(),
        assistantId: input.assistantId,
        contactId: input.contactId,
        status: input.status || existing?.status || "Nuevo",
        assignedTo: input.assignedTo || existing?.assignedTo || "bot",
        botEnabled: input.botEnabled ?? existing?.botEnabled ?? true,
        lastMessage: input.lastMessage || existing?.lastMessage || "",
        lastMessageAt: input.lastMessageAt || existing?.lastMessageAt || now(),
        tags: mergeTags(existing?.tags, input.tags),
        createdAt: existing?.createdAt || now(),
        updatedAt: now()
      };
      await ConversationModel.updateOne(query, { $set: conversation }, { upsert: true });
      return conversation;
    },
    async listConversations(assistantId) {
      return (await ConversationModel.find({ assistantId }).lean()).map((doc) => clean<Conversation>(doc));
    },
    async addMessage(input) {
      const message: Message = { ...input, id: randomUUID(), createdAt: now() };
      await MessageModel.create(message);
      await ConversationModel.updateOne({ id: input.conversationId }, { $set: { lastMessage: input.text, lastMessageAt: input.timestamp, updatedAt: now() } });
      return message;
    },
    async updateMessageStatus(input) {
      const doc = await MessageModel.findOneAndUpdate(
        { assistantId: input.assistantId, channelMessageId: input.channelMessageId },
        { $set: { status: input.status, statusUpdatedAt: now() } },
        { new: true }
      ).lean();
      return doc ? clean<Message>(doc) : undefined;
    },
    async listMessages(assistantId, conversationId) {
      const query = conversationId ? { assistantId, conversationId } : { assistantId };
      return (await MessageModel.find(query).lean()).map((doc) => clean<Message>(doc));
    },
    async listTriggers(assistantId) {
      return (await TriggerModel.find({ assistantId }).lean()).map((doc) => clean<Trigger>(doc));
    },
    async upsertTrigger(input) {
      const trigger: Trigger = {
        id: input.id || randomUUID(),
        assistantId: input.assistantId,
        name: input.name,
        type: input.type || "keyword",
        conditions: input.conditions || ["contiene texto"],
        actions: input.actions || ["enviar mensaje"],
        active: input.active ?? true,
        createdAt: input.createdAt || now(),
        updatedAt: now()
      };
      await TriggerModel.updateOne({ id: trigger.id }, { $set: trigger }, { upsert: true });
      return trigger;
    },
    async deleteTrigger(id) {
      const result = await TriggerModel.deleteOne({ id });
      return result.deletedCount > 0;
    },
    async listTemplates(assistantId) {
      return (await TemplateModel.find({ assistantId }).lean()).map((doc) => clean<Template>(doc));
    },
    async upsertTemplate(input) {
      const template: Template = {
        id: input.id || randomUUID(),
        assistantId: input.assistantId,
        name: input.name,
        type: input.type || "utility",
        language: input.language || "es_CO",
        body: input.body || "Hola {{1}}, gracias por escribirnos.",
        variables: input.variables || [],
        metaTemplateId: input.metaTemplateId || "",
        status: input.status || "draft",
        createdAt: input.createdAt || now(),
        updatedAt: now()
      };
      await TemplateModel.updateOne({ id: template.id }, { $set: template }, { upsert: true });
      return template;
    },
    async deleteTemplate(id) {
      const result = await TemplateModel.deleteOne({ id });
      return result.deletedCount > 0;
    },
    async listTags(assistantId) {
      return (await TagModel.find({ assistantId }).lean()).map((doc) => clean<Tag>(doc));
    },
    async upsertTag(input) {
      const tag: Tag = {
        id: input.id || randomUUID(),
        assistantId: input.assistantId,
        name: input.name,
        color: input.color || "#25d366",
        createdAt: input.createdAt || now()
      };
      await TagModel.updateOne({ id: tag.id }, { $set: tag }, { upsert: true });
      return tag;
    },
    async deleteTag(id) {
      const result = await TagModel.deleteOne({ id });
      return result.deletedCount > 0;
    },
    async listProducts(assistantId) {
      return (await ProductModel.find({ assistantId }).lean()).map((doc) => clean<ProductService>(doc));
    },
    async upsertProduct(input) {
      const product: ProductService = {
        id: input.id || randomUUID(),
        assistantId: input.assistantId,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl || "",
        price: input.price || "",
        currency: input.currency || "COP",
        createdAt: input.createdAt || now(),
        updatedAt: now()
      };
      await ProductModel.updateOne({ id: product.id }, { $set: product }, { upsert: true });
      return product;
    },
    async deleteProduct(id) {
      const result = await ProductModel.deleteOne({ id });
      return result.deletedCount > 0;
    },
    async listEvents(assistantId) {
      return (await LeadEventModel.find({ assistantId }).lean()).map((doc) => clean<LeadEvent>(doc));
    },
    async addEvent(input) {
      const event: LeadEvent = { ...input, id: randomUUID(), createdAt: now() };
      await LeadEventModel.create(event);
      return event;
    }
  };
}
