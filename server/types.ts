export type AssistantStatus = "active" | "inactive";
export type AIStatus = "active" | "sleeping" | "inactive";
export type TriggerType = "logic" | "keyword" | "intent" | "event";
export type UserRole = "user" | "admin" | "superadmin";
export type AuthProvider = "email" | "google";
export type LeadStatus =
  | "Nuevo"
  | "Por contactar"
  | "Contactado"
  | "Calificado"
  | "En negociación"
  | "Por facturar"
  | "Pendiente de pago"
  | "Ganado"
  | "Perdido"
  | "Recontactar"
  | "No responde"
  | "Spam";

// Multi-channel support
export type ChannelType = "whatsapp" | "instagram" | "messenger" | "wordpress" | "telegram" | "sms";

export interface ChannelCredentials {
  [key: string]: string;
}

export interface ChannelSettings {
  channel: ChannelType;
  enabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  verifyToken: string;
  credentials: ChannelCredentials;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelInboundMessage {
  messageId: string;
  from: string;
  profileName?: string;
  timestamp: number;
  type: "text" | "audio" | "image" | "document";
  text?: string;
  mediaUrl?: string;
}

export interface ChannelSendResult {
  messageId: string;
  failed?: boolean;
  error?: string;
}

export interface ChannelHandler {
  validateWebhook(
    req: { query: Record<string, any>; body: unknown; headers?: Record<string, any> },
    settings: ChannelSettings
  ): boolean | string;
  parseInbound(payload: unknown): ChannelInboundMessage[];
  sendMessage(settings: ChannelSettings, to: string, body: string): Promise<ChannelSendResult>;
}

export interface AssistantAISettings {
  assistantId: string;
  status: AIStatus;
  responseDelaySeconds: number;
  textResponseProbability: number;
  audioResponseProbability: number;
  modelProvider: "local" | "openai" | "deepseek" | "deepinfra";
  modelName: string;
  temperature: number;
  maxTokens: number;
  personality: string;
  tone: string;
  formalityLevel: string;
  systemRules: string;
  forbiddenPhrases: string[];
  importantKeywords: string[];
  mainLanguage: string;
  allowedLanguages: string[];
  audioEnabled: boolean;
  voice: string;
  voiceSpeed: number;
  transcribeIncomingAudio: boolean;
}

export interface Assistant {
  id: string;
  organizationId: string;
  name: string;
  countryCode: string;
  phone: string;
  status: AssistantStatus;
  welcomeMessageId: string;
  referenceAssistantId: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  ai: AssistantAISettings;
  channels: Record<ChannelType, ChannelSettings>;
}

export interface Organization {
  id: string;
  name: string;
  ownerUserId: string;
  messageCredits: number;
  freeMessagesGranted: boolean;
  planType: "Gratis" | "Básico" | "Profesional" | "Avanzado" | "Enterprise";
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  provider: AuthProvider;
  googleSub: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface MessagePackage {
  id: string;
  name: string;
  messages: number;
  priceCop: number;
  currency: "COP";
}

export interface CreditLedgerEntry {
  id: string;
  organizationId: string;
  userId: string;
  type: "grant" | "purchase" | "usage" | "adjustment";
  amount: number;
  balanceAfter: number;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Contact {
  id: string;
  assistantId: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  tags: string[];
  leadScore: number;
  status: LeadStatus;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  assistantId: string;
  contactId: string;
  status: LeadStatus;
  assignedTo: "bot" | "human";
  botEnabled: boolean;
  lastMessage: string;
  lastMessageAt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  assistantId: string;
  conversationId: string;
  contactId: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "assistant" | "human";
  type: "text" | "audio" | "image" | "document" | "note";
  text: string;
  mediaUrl: string;
  channel: ChannelType;
  channelMessageId: string;
  status: "received" | "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  createdAt: string;
}

export interface Trigger {
  id: string;
  assistantId: string;
  name: string;
  type: TriggerType;
  conditions: string[];
  actions: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  assistantId: string;
  name: string;
  type: "text" | "marketing" | "utility" | "authentication";
  language: string;
  body: string;
  variables: string[];
  metaTemplateId: string;
  status: "draft" | "approved" | "rejected" | "paused";
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  assistantId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface ProductService {
  id: string;
  assistantId: string;
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  currency: "COP" | "USD" | "EUR" | "MXN";
  createdAt: string;
  updatedAt: string;
}

export interface LeadEvent {
  id: string;
  assistantId: string;
  contactId: string;
  conversationId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Store {
  createOrganization(input: Partial<Organization> & { name: string; ownerUserId?: string }): Promise<Organization>;
  updateOrganization(id: string, patch: Partial<Organization>): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  listOrganizations(): Promise<Organization[]>;
  createUser(input: Partial<User> & { email: string; name: string; organizationId: string }): Promise<User>;
  updateUser(id: string, patch: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleSub(googleSub: string): Promise<User | undefined>;
  listUsers(): Promise<User[]>;
  addCredits(input: { organizationId: string; userId?: string; amount: number; type: CreditLedgerEntry["type"]; description: string; metadata?: Record<string, unknown> }): Promise<CreditLedgerEntry>;
  consumeCredits(input: { organizationId: string; amount: number; description: string; metadata?: Record<string, unknown> }): Promise<CreditLedgerEntry | undefined>;
  listCreditLedger(organizationId?: string): Promise<CreditLedgerEntry[]>;
  createAssistant(input: Partial<Assistant>): Promise<Assistant>;
  updateAssistant(id: string, patch: Partial<Assistant>): Promise<Assistant>;
  listAssistants(): Promise<Assistant[]>;
  getAssistant(id: string): Promise<Assistant | undefined>;
  upsertContact(input: Partial<Contact> & { assistantId: string; phone: string }): Promise<Contact>;
  listContacts(assistantId: string): Promise<Contact[]>;
  upsertConversation(input: Partial<Conversation> & { assistantId: string; contactId: string }): Promise<Conversation>;
  listConversations(assistantId: string): Promise<Conversation[]>;
  addMessage(input: Omit<Message, "id" | "createdAt">): Promise<Message>;
  updateMessageStatus(input: { assistantId: string; channelMessageId: string; status: Message["status"] }): Promise<Message | undefined>;
  listMessages(assistantId: string, conversationId?: string): Promise<Message[]>;
  listTriggers(assistantId: string): Promise<Trigger[]>;
  upsertTrigger(input: Partial<Trigger> & { assistantId: string; name: string }): Promise<Trigger>;
  deleteTrigger(id: string): Promise<boolean>;
  listTemplates(assistantId: string): Promise<Template[]>;
  upsertTemplate(input: Partial<Template> & { assistantId: string; name: string }): Promise<Template>;
  deleteTemplate(id: string): Promise<boolean>;
  listTags(assistantId: string): Promise<Tag[]>;
  upsertTag(input: Partial<Tag> & { assistantId: string; name: string }): Promise<Tag>;
  deleteTag(id: string): Promise<boolean>;
  listProducts(assistantId: string): Promise<ProductService[]>;
  upsertProduct(input: Partial<ProductService> & { assistantId: string; name: string; description: string }): Promise<ProductService>;
  deleteProduct(id: string): Promise<boolean>;
  listEvents(assistantId: string): Promise<LeadEvent[]>;
  addEvent(input: Omit<LeadEvent, "id" | "createdAt">): Promise<LeadEvent>;
}
