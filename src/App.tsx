import {
  Activity,
  AlertTriangle,
  AudioLines,
  BarChart3,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Clipboard,
  Copy,
  CreditCard,
  Edit3,
  Filter,
  Flame,
  Gauge,
  Image,
  Inbox,
  Home,
  Menu,
  MessageCircle,
  Paperclip,
  Play,
  Plus,
  Puzzle,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Save,
  Sparkles,
  Tags,
  Target,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Users,
  X,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
        };
      };
    };
  }
}

type LeadStatus =
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

type ChannelType = "whatsapp" | "instagram" | "messenger" | "wordpress" | "telegram" | "sms";
type VisibleChannelType = "whatsapp" | "instagram" | "messenger" | "wordpress";

interface ChannelSettings {
  channel: ChannelType;
  enabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  verifyToken: string;
  credentials: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface Assistant {
  id: string;
  name: string;
  countryCode: string;
  phone: string;
  status: "active" | "inactive";
  welcomeMessageId: string;
  referenceAssistantId: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  ai: {
    status: "active" | "sleeping" | "inactive";
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
  };
  channels: Record<ChannelType, ChannelSettings>;
  whatsapp?: ChannelSettings; // Backward compat
}

interface Contact {
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
}

interface Conversation {
  id: string;
  assistantId: string;
  contactId: string;
  status: LeadStatus;
  assignedTo: "bot" | "human";
  botEnabled: boolean;
  lastMessage: string;
  lastMessageAt: string;
  tags: string[];
}

interface Message {
  id: string;
  assistantId?: string;
  conversationId: string;
  contactId: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "assistant" | "human";
  text: string;
  status: string;
  timestamp: string;
  channel?: ChannelType;
}

interface Trigger {
  id: string;
  name: string;
  type: string;
  conditions: string[];
  actions: string[];
  active: boolean;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  type: string;
  language: string;
  body: string;
  status: string;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface ProductService {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  currency: "COP" | "USD" | "EUR" | "MXN";
}

interface AccountUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: "user" | "admin" | "superadmin";
  provider: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string;
}

interface Organization {
  id: string;
  name: string;
  ownerUserId: string;
  messageCredits: number;
  freeMessagesGranted: boolean;
  planType?: "Gratis" | "Básico" | "Profesional" | "Avanzado" | "Enterprise";
}

interface CreditLedgerEntry {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

interface MessagePackage {
  id: string;
  name: string;
  messages: number;
  priceCop: number;
  currency: "COP";
}

interface AccountState {
  user: AccountUser;
  organization: Organization;
  ledger: CreditLedgerEntry[];
}

interface BillingState {
  packages: MessagePackage[];
  mercadoPagoConfigured: boolean;
}

interface AdminOverview {
  totals: {
    users: number;
    organizations: number;
    assistants: number;
    creditsAvailable: number;
  };
  packages: MessagePackage[];
  users: AccountUser[];
  organizations: Organization[];
  ledger: CreditLedgerEntry[];
}

interface Bootstrap {
  assistants: Assistant[];
  activeAssistant: Assistant | null;
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  triggers: Trigger[];
  templates: Template[];
  tags: TagItem[];
  products: ProductService[];
}

const navItems = [
  ["Inicio", Home],
  ["Asistentes", Bot],
  ["Descripción", Gauge],
  ["Chat", MessageCircle],
  ["Entrenamiento", Sparkles],
  ["Plantillas", Clipboard],
  ["Disparadores", Zap],
  ["Recarga / Créditos", CreditCard],
  ["Logros / Métricas", BarChart3],
  ["Ajustes", Settings],
  ["Contactos", Users],
  ["Etiquetas", Tags]
] as const;

const leadStatuses: LeadStatus[] = [
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
];

const visibleChannelTypes: VisibleChannelType[] = ["whatsapp", "instagram", "messenger", "wordpress"];
const channelMeta: Record<VisibleChannelType, { label: string; shortLabel: string; icon: string; description: string }> = {
  whatsapp: { label: "WhatsApp", shortLabel: "WhatsApp", icon: "/img/icon-whatsapp.png", description: "Mensajes de WhatsApp Cloud API" },
  instagram: { label: "Instagram", shortLabel: "Instagram", icon: "/img/instagram.png", description: "Mensajes directos de Instagram" },
  messenger: { label: "Messenger", shortLabel: "Messenger", icon: "/img/messenger.png", description: "Mensajes de Facebook Messenger" },
  wordpress: { label: "Web / WordPress", shortLabel: "Web", icon: "/img/crm-api.png", description: "Formularios web, WordPress o WooCommerce" }
};

function normalizeChannelSettings(channelId: VisibleChannelType, channel?: ChannelSettings): ChannelSettings {
  return {
    channel: (channel?.channel || channelId) as ChannelType,
    enabled: Boolean(channel?.enabled),
    webhookUrl: channel?.webhookUrl || "",
    webhookSecret: channel?.webhookSecret || "",
    verifyToken: channel?.verifyToken || "",
    credentials: channel?.credentials || {},
    createdAt: channel?.createdAt || "",
    updatedAt: channel?.updatedAt || ""
  };
}

type AuthMode = "login" | "register";

function LogoMark({ className = "magnet-logo-img" }: { className?: string }) {
  return <img className={className} src="/img/brand/logo-amplio-magnet-blanco.png" alt="MAGNET" />;
}

function LegacyLandingPage() {
  const goToDemo = () => {
    window.location.href = window.location.hostname === "app.magnetcloud.app" ? "/register" : "https://app.magnetcloud.app/register";
  };

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-logo" href="/"><LogoMark /></a>
        <nav className="landing-menu" aria-label="Navegacion principal">
          <a href="#producto">Producto</a>
          <a href="#soluciones">Soluciones</a>
          <a href="#integraciones">Integraciones</a>
          <a href="#precios">Precios</a>
          <a href="#recursos">Recursos</a>
        </nav>
        <button className="landing-demo" onClick={goToDemo}>Probar gratis</button>
      </header>

      <main>
        <section className="landing-hero" id="producto">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={17} /> Plataforma de ventas con IA</div>
            <h1>Convierte tus leads en <span>ventas</span> con <span>IA</span></h1>
            <p>Centraliza WhatsApp, Messenger e Instagram, automatiza conversaciones y cierralas mas rapido con inteligencia artificial.</p>
            <div className="hero-actions">
              <button className="landing-demo big" onClick={goToDemo}><MessageCircle size={20} /> Probar gratis</button>
              <button className="landing-secondary"><Play size={18} /> Ver como funciona</button>
            </div>
            <div className="social-proof">
              <div className="avatars"><i>J</i><i>A</i><i>M</i></div>
              <strong>★★★★★</strong>
              <span>Equipos que ya venden mas con Magnet</span>
            </div>
          </div>

          <div className="product-mockup" aria-label="Vista previa del inbox Magnet">
            <div className="mockup-top"><LogoMark /><div><Search size={14} /> Buscar conversaciones...</div><i>U</i></div>
            <div className="mockup-body">
              <aside>
                {[[Inbox, "Inbox"], [Users, "Contactos"], [MessageCircle, "Conversaciones"], [Zap, "Automatizaciones"], [SlidersHorizontal, "Pipelines"], [BarChart3, "Reportes"], [Settings, "Ajustes"]].map(([Icon, label]) => (
                  <span className={label === "Inbox" ? "active" : ""} key={label as string}>{typeof Icon !== "string" && <Icon size={15} />} {label as string}</span>
                ))}
              </aside>
              <section>
                <h3>Inbox</h3>
                <div className="mock-tabs"><b>Todas 12</b><span>No leidas 3</span><span>Menciones</span></div>
                {[
                  ["WhatsApp", "Carla Martinez", "Hola, tienen disponibilidad para hoy?", "2"],
                  ["Messenger", "Juan Perez", "Quiero mas informacion sobre el plan.", ""],
                  ["Instagram", "Mariana Gomez", "Perfecto, agendemos una llamada.", ""],
                  ["WhatsApp", "Andres Lopez", "Me pueden enviar el catalogo?", ""]
                ].map((row) => (
                  <div className="mock-chat" key={row[1]}>
                    <i className={row[0].toLowerCase()}>{row[0][0]}</i>
                    <div><strong>{row[1]}</strong><p>{row[2]}</p></div>
                    {row[3] && <b>{row[3]}</b>}
                  </div>
                ))}
              </section>
              <aside className="pipeline-card">
                <h3>Pipeline</h3>
                <span>Leads <b>128</b></span>
                <span className="active">Calificados <b>64</b></span>
                <span>Propuesta <b>28</b></span>
                <span>Negociacion <b>18</b></span>
                <span>Cerrados <b>36</b></span>
                <div className="conversion"><small>Conversion</small><strong>32%</strong><em>↑ 24% vs mes anterior</em><svg viewBox="0 0 160 70"><path d="M4 58 C24 38 34 62 52 40 S82 18 100 30 S128 50 156 8" /></svg></div>
              </aside>
            </div>
          </div>
        </section>

        <section className="feature-cards" id="soluciones">
          {[
            [MessageCircle, "Inbox unificado", "Todas tus conversaciones de WhatsApp, Messenger e Instagram en un solo lugar."],
            [Bot, "Automatizacion con IA", "Responde, califica y da seguimiento automaticamente para que tu equipo se enfoque en cerrar."],
            [BarChart3, "Mas conversiones", "Pipelines visuales, recordatorios y reportes para vender mas cada dia."]
          ].map(([Icon, title, text]) => (
            <article key={title as string}><div>{typeof Icon !== "string" && <Icon size={34} />}</div><h3>{title as string}</h3><p>{text as string}</p></article>
          ))}
        </section>

        <section className="how-it-works">
          <h2>Como funciona</h2>
          <div className="steps">
            {[
              [Inbox, "Conecta tus canales", "Integra WhatsApp, Messenger e Instagram en minutos."],
              [Bot, "Automatiza con IA", "La IA conversa, califica y asigna leads automaticamente."],
              [BarChart3, "Cierra mas ventas", "Tu equipo sigue el pipeline y convierte mas cada dia."]
            ].map(([Icon, title, text], index) => (
              <article key={title as string}><b>{index + 1}</b><div>{typeof Icon !== "string" && <Icon size={43} />}</div><h3>{title as string}</h3><p>{text as string}</p></article>
            ))}
          </div>
        </section>

        <section className="integrations" id="integraciones">
          <h2>Integraciones que te conectan</h2>
          <div>
            {[
              ["wa", "WhatsApp", "Conecta tu numero"],
              ["ms", "Messenger", "Responde desde un solo inbox"],
              ["ig", "Instagram", "Mensajes y comentarios en un solo lugar"],
              ["crm", "CRM / API", "Conecta tu CRM y herramientas"]
            ].map(([kind, title, text]) => (
              <article key={title}><i className={kind}>{kind === "crm" ? <Puzzle size={42} /> : title[0]}</i><span><strong>{title}</strong><small>{text}</small></span></article>
            ))}
          </div>
        </section>

        <section className="landing-prices" id="precios">
          <h2>Precios simples por mensajes</h2>
          <div>
            {[
              ["100", "gratis", "Primer registro"],
              ["500", "$29.900", "Paquete inicial"],
              ["1000", "$49.900", "Crecimiento"],
              ["5000", "$199.900", "Alto volumen"]
            ].map(([count, price, label]) => <article key={count}><strong>{count}</strong><span>{price}</span><small>{label}</small></article>)}
          </div>
        </section>

        <section className="cta-band">
          <div>
            <h2>Haz que cada <span>lead</span> cuente</h2>
            <p>Empieza hoy y convierte mas conversaciones en ventas.</p>
            <div className="hero-actions">
              <button className="landing-demo big" onClick={goToDemo}><MessageCircle size={20} /> Probar gratis</button>
              <button className="landing-secondary"><Play size={18} /> Ver como funciona</button>
            </div>
          </div>
          <img src="/img/whatsapp.png" alt="WhatsApp Magnet" />
        </section>
      </main>

      <footer className="landing-footer" id="recursos">
        <div><LogoMark /><p>La plataforma de IA para convertir conversaciones en ventas.</p><span>○ ○ ○ ○</span></div>
        <nav><strong>Producto</strong><a href="#producto">Inbox</a><a href="#soluciones">Automatizaciones</a><a href="#precios">Precios</a></nav>
        <nav><strong>Soluciones</strong><a>Ventas</a><a>Atencion al cliente</a><a>E-commerce</a></nav>
        <nav><strong>Recursos</strong><a>Blog</a><a>Guias</a><a>Centro de ayuda</a></nav>
        <nav><strong>Empresa</strong><a>Quienes somos</a><a>Contacto</a><a href="/login">Ingresar</a></nav>
        <small>© 2026 Magnet. Todos los derechos reservados.</small>
        <div className="legal-links"><a href="/privacy">Privacidad</a><a href="/terms">Terminos</a><a>Cookies</a></div>
      </footer>
    </div>
  );
}

function LandingPage() {
  const appUrl = "https://app.magnetcloud.app/";
  const navLinks = [
    ["Producto", "#producto", true],
    ["Soluciones", "#soluciones", true],
    ["Integraciones", "#integraciones", false],
    ["Precios", "#precios", false],
    ["Recursos", "#recursos", true]
  ] as const;
  const conversations = [
    ["/img/icon-whatsapp.png", "whatsapp", "Carla Martínez", "Hola, ¿tienen disponibilidad para hoy?", "ahora", "2"],
    ["/img/messenger.png", "messenger", "Juan Pérez", "Quiero más información sobre el plan.", "5 min", ""],
    ["/img/instagram.png", "instagram", "Mariana Gómez", "Perfecto, agendemos una llamada.", "12 min", ""],
    ["/img/icon-whatsapp.png", "whatsapp", "Andrés López", "¿Me pueden enviar el catálogo?", "25 min", ""]
  ] as const;
  const features = [
    [MessageCircle, "Inbox unificado", "Todas tus conversaciones de WhatsApp, Messenger e Instagram en un solo lugar."],
    [Bot, "Automatización con IA", "Responde, califica y da seguimiento automáticamente para que tu equipo se enfoque en cerrar."],
    [BarChart3, "Más conversiones", "Pipelines visuales, recordatorios y reportes para vender más cada día."]
  ] as const;
  const steps = [
    [MessageCircle, "Conecta tus canales", "Integra WhatsApp, Messenger e Instagram en minutos."],
    [Bot, "Automatiza con IA", "La IA conversa, califica y asigna leads automáticamente."],
    [BarChart3, "Cierra más ventas", "Tu equipo sigue el pipeline y convierte más cada día."]
  ] as const;
  const integrations = [
    ["/img/icon-whatsapp.png", "WhatsApp", "Conecta tu número en minutos."],
    ["/img/messenger.png", "Messenger", "Responde desde un solo inbox."],
    ["/img/instagram.png", "Instagram", "Mensajes y comentarios en un solo lugar."],
    ["/img/crm-api.png", "CRM / API", "Conecta tu CRM y herramientas."]
  ] as const;
  const prices = [
    ["Gratis", "100", "Conversaciones gratis desde el registro", "$0"],
    ["Básico", "500", "Conversaciones", "$20"],
    ["Profesional", "1000", "Conversaciones", "$35"],
    ["Avanzado", "2000", "Conversaciones", "$60"]
  ] as const;

  return (
    <div className="landing-page landing-v2">
      <header className="landing-nav">
        <a className="landing-logo" href="/"><LogoMark /></a>
        <nav className="landing-menu" aria-label="Navegación principal">
          {navLinks.map(([label, href, dropdown]) => (
            <a href={href} key={label}>{label}{dropdown && <ChevronDown size={13} />}</a>
          ))}
        </nav>
        <div className="landing-actions">
          <span>Idioma</span>
          <button className="language-toggle" type="button">ES / EN</button>
          <a className="landing-login" href={appUrl}>Iniciar sesión</a>
          <a className="landing-demo" href={appUrl}>Probar gratis</a>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="producto">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={17} /> Plataforma de ventas con IA</div>
            <h1>Convierte tus leads en <span>ventas</span> con <span>IA</span></h1>
            <p>Centraliza WhatsApp, Messenger e Instagram, automatiza conversaciones y ciérralas más rápido con inteligencia artificial.</p>
            <div className="hero-actions">
              <a className="landing-demo big" href={appUrl}><MessageCircle size={20} /> Probar gratis</a>
              <a className="landing-secondary" href="#como-funciona"><Play size={18} /> Ver cómo funciona</a>
            </div>
            <div className="social-proof">
              <div className="avatars"><i>J</i><i>A</i><i>M</i></div>
              <div><strong>★★★★★</strong><span>Equipos que ya venden más con Magnet</span></div>
            </div>
          </div>

          <div className="product-mockup" aria-label="Vista previa del inbox Magnet">
            <div className="mockup-top"><LogoMark /><div><Search size={14} /> Buscar conversaciones...</div><i>U</i></div>
            <div className="mockup-body">
              <aside>
                {[[Inbox, "Inbox"], [Users, "Contactos"], [MessageCircle, "Conversaciones"], [Zap, "Automatizaciones"], [SlidersHorizontal, "Pipelines"], [BarChart3, "Reportes"], [Settings, "Ajustes"]].map(([Icon, label]) => (
                  <span className={label === "Inbox" ? "active" : ""} key={label as string}>{typeof Icon !== "string" && <Icon size={15} />} {label as string}</span>
                ))}
              </aside>
              <section>
                <h3>Inbox</h3>
                <div className="mock-tabs"><b>Todas <small>12</small></b><span>No leídas 3</span><span>@ Menciones</span></div>
                {conversations.map(([icon, channel, name, message, time, badge]) => (
                  <div className="mock-chat" key={name}>
                    <i className={channel}><img src={icon} alt="" aria-hidden="true" /></i>
                    <div><strong>{name}</strong><p>{message}</p></div>
                    <time>{time}</time>
                    {badge && <b>{badge}</b>}
                  </div>
                ))}
              </section>
              <aside className="pipeline-card">
                <h3>Pipeline</h3>
                <span>Leads <b>128</b></span>
                <span className="active">Calificados <b>64</b></span>
                <span>Propuesta <b>28</b></span>
                <span>Negociación <b>18</b></span>
                <span>Cerrados <b>36</b></span>
                <div className="conversion"><small>Conversión</small><strong>32%</strong><em>↑ 24% vs mes anterior</em><svg viewBox="0 0 160 70" aria-hidden="true"><path d="M4 58 C24 38 34 62 52 40 S82 18 100 30 S128 50 156 8" /></svg></div>
              </aside>
            </div>
          </div>
        </section>

        <section className="feature-cards" id="soluciones">
          {features.map(([Icon, title, text]) => (
            <article key={title as string}><div>{typeof Icon !== "string" && <Icon size={34} />}</div><h3>{title as string}</h3><p>{text as string}</p></article>
          ))}
        </section>

        <section className="how-it-works" id="como-funciona">
          <h2>Cómo funciona</h2>
          <div className="steps">
            {steps.map(([Icon, title, text], index) => (
              <article key={title as string}><b>{index + 1}</b><div>{typeof Icon !== "string" && <Icon size={43} />}</div><h3>{title as string}</h3><p>{text as string}</p></article>
            ))}
          </div>
        </section>

        <section className="integrations" id="integraciones">
          <h2>Integraciones que te conectan</h2>
          <div>
            {integrations.map(([src, title, text]) => (
              <article key={title}><img src={src} alt="" aria-hidden="true" /><span><strong>{title}</strong><small>{text}</small></span></article>
            ))}
          </div>
        </section>

        <section className="landing-prices" id="precios">
          <h2>Precios simples por conversaciones</h2>
          <div>
            {prices.map(([name, count, label, price], index) => (
              <article className={index === 0 ? "featured" : ""} key={name}>
                <span>{name}</span>
                <strong>{count}</strong>
                <small>{label}</small>
                <em>{price} <small>USD</small></em>
                {index > 0 && <small>por mes</small>}
              </article>
            ))}
          </div>
          <p className="pricing-note"><Check size={16} /> Sin contrato. Cancela cuando quieras.</p>
        </section>

        <section className="cta-band">
          <div>
            <h2>Empieza hoy <small>y convierte más conversaciones en</small> <span>ventas</span></h2>
            <p>Únete a equipos que ya venden más con Magnet.</p>
          </div>
          <a className="landing-demo big" href={appUrl}><MessageCircle size={20} /> Probar gratis</a>
          <img src="/img/whatsapp.png" alt="WhatsApp Magnet" />
        </section>
      </main>

      <footer className="landing-footer" id="recursos">
        <div><LogoMark /><p>La plataforma de IA para convertir conversaciones en ventas.</p><span className="social-icons">◉ ◉ ◉ ◉</span></div>
        <nav><strong>Producto</strong><a href="#producto">Inbox</a><a href="#soluciones">Automatizaciones</a><a href="#precios">Reportes</a></nav>
        <nav><strong>Soluciones</strong><a>Ventas</a><a>Atención al cliente</a><a>E-commerce</a><a>Agencias</a></nav>
        <nav><strong>Recursos</strong><a>Blog</a><a>Guías</a><a>Webinars</a><a>Centro de ayuda</a></nav>
        <nav><strong>Empresa</strong><a>Quiénes somos</a><a>Carreras</a><a>Contacto</a><a href={appUrl}>Ingresar</a></nav>
        <small>© 2024 Magnet. Todos los derechos reservados.</small>
        <div className="legal-links"><a href="/privacy">Privacidad</a><a href="/terms">Términos</a><a>Cookies</a></div>
      </footer>
    </div>
  );
}

function LegalPage({ type }: { type: "privacy" | "terms" }) {
  const isPrivacy = type === "privacy";
  const title = isPrivacy ? "Política de privacidad" : "Términos y condiciones";
  return (
    <div className="legal-page legal-v2">
      <a href="/" className="landing-logo"><LogoMark /></a>
      <section>
        <h1>{title}</h1>
        <p className="legal-date">Última actualización: 22 de mayo de 2026. Este documento aplica para Colombia y para el uso de MAGNET en el dominio magnetcloud.app.</p>
        {isPrivacy ? (
          <>
            <h2>Tratamiento de datos personales</h2>
            <p>MAGNET trata datos personales conforme a la Constitución Política de Colombia, la Ley 1581 de 2012, el Decreto 1377 de 2013 y las normas que los modifiquen o complementen. Podemos tratar datos de identificación, contacto, credenciales de acceso, información de empresa, conversaciones comerciales, metadatos técnicos, preferencias, registros de uso e información necesaria para soporte, seguridad, facturación y operación de integraciones.</p>
            <h2>Finalidades</h2>
            <p>Usamos la información para crear y administrar cuentas, operar inboxes e integraciones con canales como WhatsApp, Messenger e Instagram, automatizar respuestas con IA, gestionar leads, prestar soporte, enviar avisos operativos, prevenir abuso, mejorar el servicio, cumplir obligaciones legales y atender solicitudes de autoridades competentes.</p>
            <h2>Derechos del titular</h2>
            <p>Como titular puedes conocer, actualizar, rectificar, solicitar prueba de autorización, pedir información sobre el uso dado a tus datos, presentar quejas ante la Superintendencia de Industria y Comercio, revocar la autorización y solicitar supresión cuando sea procedente. Para ejercer estos derechos escribe a kinotrance@gmail.com con identificación suficiente de la solicitud.</p>
            <h2>Encargados, transferencias y seguridad</h2>
            <p>MAGNET puede usar proveedores tecnológicos, nube, analítica, pagos y mensajería, incluso ubicados fuera de Colombia, bajo medidas contractuales y técnicas razonables. Protegemos credenciales, tokens e integraciones con controles de acceso, segregación por organización y medidas de seguridad proporcionales al riesgo.</p>
            <h2>Responsabilidad del usuario</h2>
            <p>Quien conecta canales o carga contactos declara contar con autorización válida para tratar y contactar a sus leads, y se obliga a cumplir las políticas de Meta, WhatsApp, las normas de protección de datos, habeas data, comercio electrónico y protección al consumidor aplicables en Colombia.</p>
          </>
        ) : (
          <>
            <h2>Uso del servicio</h2>
            <p>MAGNET es una plataforma para centralizar conversaciones, gestionar leads, automatizar respuestas con IA y operar integraciones comerciales. Al usar el servicio aceptas estos términos, las políticas de terceros integrados y la normativa colombiana aplicable, incluyendo protección de datos, comercio electrónico, consumidor y propiedad intelectual.</p>
            <h2>Cuentas e integraciones</h2>
            <p>El usuario es responsable por la veracidad de la información registrada, la custodia de credenciales, tokens, accesos y configuraciones, así como por la autorización legal para tratar datos de clientes, prospectos y contactos. MAGNET puede suspender accesos ante uso abusivo, fraude, riesgo de seguridad, infracción normativa o incumplimiento de políticas de canales externos.</p>
            <h2>Automatización e IA</h2>
            <p>Las respuestas generadas o asistidas por IA deben ser revisadas y configuradas por el usuario según su operación. MAGNET no reemplaza asesoría legal, contable, médica, financiera ni profesional. El usuario mantiene responsabilidad por ofertas, promesas comerciales, tratamiento de datos, mensajes enviados y decisiones tomadas con base en la plataforma.</p>
            <h2>Pagos, disponibilidad y cambios</h2>
            <p>Los planes, precios, créditos o paquetes pueden cambiar según comunicación publicada en el sitio o dentro de la aplicación. Procuramos alta disponibilidad, pero el servicio puede presentar mantenimientos, fallas de terceros, límites de APIs o interrupciones razonables. Cuando proceda, las reclamaciones se atenderán por los canales de soporte informados.</p>
            <h2>Propiedad intelectual y ley aplicable</h2>
            <p>La marca, interfaz, software, diseños, textos y componentes de MAGNET pertenecen a sus titulares o licenciantes. Estos términos se rigen por las leyes de la República de Colombia. Para soporte, peticiones o reclamaciones escribe a kinotrance@gmail.com.</p>
          </>
        )}
        <a href="/">Volver al inicio</a>
      </section>
    </div>
  );
}

function AuthPage({ initialMode }: { initialMode: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [googleClientId, setGoogleClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || "");

  useEffect(() => {
    if (googleClientId) return;
    void fetch("/api/public-config")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (payload?.googleClientId) setGoogleClientId(payload.googleClientId);
      })
      .catch(() => undefined);
  }, [googleClientId]);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;

    let cancelled = false;
    const renderGoogleButton = () => {
      if (cancelled || !googleButtonRef.current || !window.google?.accounts?.id) return;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => void submitGoogle(response.credential || "")
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        type: "standard",
        shape: "rectangular",
        text: mode === "register" ? "signup_with" : "signin_with",
        width: Math.min(420, googleButtonRef.current.offsetWidth || 420)
      });
    };

    if (window.google?.accounts?.id) {
      renderGoogleButton();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
      if (existingScript) {
        existingScript.addEventListener("load", renderGoogleButton, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = renderGoogleButton;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (googleButtonRef.current) googleButtonRef.current.innerHTML = "";
    };
  }, [googleClientId, mode]);

  async function submit() {
    setError("");
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "register" ? { name, organizationName, email, password } : { email, password })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "No se pudo autenticar");
      return;
    }
    localStorage.setItem("magnet_token", payload.token);
    window.location.replace(nextAppPathAfterAuth());
  }

  async function submitGoogle(credential: string) {
    setError("");
    if (!credential) {
      setError("No se recibio la credencial de Google. Intentalo nuevamente.");
      return;
    }
    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "No se pudo autenticar con Google");
      return;
    }
    localStorage.setItem("magnet_token", payload.token);
    window.location.replace(nextAppPathAfterAuth());
  }

  return (
    <div className="auth-page">
      <a className="landing-logo" href="/"><LogoMark /></a>
      <section className="auth-card">
        <div>
          <span className="eyebrow"><ShieldCheck size={16} /> Acceso protegido</span>
          <h1>{mode === "register" ? "Crea tu cuenta Magnet" : "Ingresa a Magnet"}</h1>
          <p>{mode === "register" ? "Recibe 100 mensajes gratis para probar tu primer agente de ventas con IA." : "Accede a tu inbox, asistentes, creditos y configuracion."}</p>
        </div>
        {mode === "register" && <Field label="Nombre"><input value={name} onChange={(event) => setName(event.target.value)} /></Field>}
        {mode === "register" && <Field label="Empresa"><input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></Field>}
        <Field label="Email"><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></Field>
        <Field label="Contraseña"><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" /></Field>
        {error && <div className="error-banner">{typeof error === "string" ? error : "Revisa los datos"}</div>}
        <button className="landing-demo auth-submit" onClick={submit}>{mode === "register" ? "Crear cuenta gratis" : "Iniciar sesion"}</button>
        {googleClientId ? (
          <div className="google-button-slot" ref={googleButtonRef} />
        ) : (
          <button
            className="landing-secondary auth-google"
            type="button"
            onClick={() => setError("Login con Google esta listo en codigo, pero falta configurar el Google Client ID. Por ahora puedes entrar con email y contraseña.")}
          >
            Continuar con Google
          </button>
        )}
        <p className="auth-switch">{mode === "register" ? "Ya tienes cuenta?" : "Aun no tienes cuenta?"} <button onClick={() => setMode(mode === "register" ? "login" : "register")}>{mode === "register" ? "Inicia sesion" : "Registrate"}</button></p>
      </section>
    </div>
  );
}

function nextAppPathAfterAuth() {
  const storedPath = localStorage.getItem("magnet_last_path") || "/";
  if (window.location.hostname.startsWith("app.")) {
    return storedPath.replace(/^\/app\/?/, "/") || "/";
  }
  return storedPath;
}

function AppEntry() {
  const path = window.location.pathname;
  const hostname = window.location.hostname;
  const isAppHost = hostname.startsWith("app.");
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const isAppRoute = path === "/app" || path.startsWith("/app/");
  const isAuthRoute = path === "/login" || path === "/register";
  const token = localStorage.getItem("magnet_token");

  if (path === "/privacy") return <LegalPage type="privacy" />;
  if (path === "/terms") return <LegalPage type="terms" />;
  if ((isAppRoute || isAuthRoute) && !isAppHost && !isLocalHost) {
    const targetPath = isAppRoute ? path.replace(/^\/app\/?/, "/") || "/" : path;
    window.location.replace(`https://app.magnetcloud.app${targetPath}`);
    return null;
  }
  if (path === "/login") return <AuthPage initialMode="login" />;
  if (path === "/register") return <AuthPage initialMode="register" />;
  if (isAppHost && !token) return <AuthPage initialMode="login" />;
  if (isAppRoute || isAppHost) return <MagnetPanel />;
  return <LandingPage />;
}

function ChannelSettingsForm(props: {
  channel: ChannelSettings;
  onUpdate: (updated: ChannelSettings) => void;
  showToken: boolean;
  setShowToken: (show: boolean) => void;
}) {
  const { channel, onUpdate } = props;
  const credentials = channel.credentials || {};

  const updateCredential = (key: string, value: string) => {
    onUpdate({ ...channel, credentials: { ...credentials, [key]: value } });
  };

  const toggleEnabled = () => {
    onUpdate({ ...channel, enabled: !channel.enabled });
  };

  return (
    <div className="form-grid">
      <Field label="Estado del canal">
        <button onClick={toggleEnabled} className={channel.enabled ? "primary" : "secondary"}>
          {channel.enabled ? "✓ Activo" : "✗ Inactivo"}
        </button>
      </Field>

      {channel.channel === "whatsapp" && (
        <>
          <Field label="ID número de teléfono">
            <input
              value={credentials.phoneNumberId || ""}
              onChange={(e) => updateCredential("phoneNumberId", e.target.value)}
              placeholder="phone_number_id de Meta"
            />
          </Field>
          <Field label="ID cuenta de WhatsApp Business">
            <input
              value={credentials.whatsappBusinessAccountId || ""}
              onChange={(e) => updateCredential("whatsappBusinessAccountId", e.target.value)}
            />
          </Field>
          <Field label="ID de la aplicación de Meta">
            <input
              value={credentials.metaAppId || ""}
              onChange={(e) => updateCredential("metaAppId", e.target.value)}
            />
          </Field>
          <Field label="Token permanente">
            <div className="copy-field">
              <input
                type={props.showToken ? "text" : "password"}
                value={credentials.permanentAccessTokenEncrypted || ""}
                onChange={(e) => updateCredential("permanentAccessTokenEncrypted", e.target.value)}
                placeholder="Pega el token permanente"
              />
              <button onClick={() => props.setShowToken(!props.showToken)}>
                <ShieldCheck size={17} />
              </button>
            </div>
          </Field>
        </>
      )}

      {channel.channel === "instagram" && (
        <>
          <Field label="ID cuenta Instagram">
            <input
              value={credentials.instagramAccountId || ""}
              onChange={(e) => updateCredential("instagramAccountId", e.target.value)}
              placeholder="Instagram professional account ID"
            />
          </Field>
          <Field label="ID pagina Facebook">
            <input
              value={credentials.facebookPageId || ""}
              onChange={(e) => updateCredential("facebookPageId", e.target.value)}
              placeholder="Pagina conectada a Instagram"
            />
          </Field>
          <Field label="ID app Meta">
            <input
              value={credentials.metaAppId || ""}
              onChange={(e) => updateCredential("metaAppId", e.target.value)}
              placeholder="App ID de Meta for Developers"
            />
          </Field>
          <Field label="Token de acceso">
            <div className="copy-field">
              <input
                type={props.showToken ? "text" : "password"}
                value={credentials.permanentAccessTokenEncrypted || ""}
                onChange={(e) => updateCredential("permanentAccessTokenEncrypted", e.target.value)}
                placeholder="Token con permiso para mensajes de Instagram"
              />
              <button onClick={() => props.setShowToken(!props.showToken)}>
                <ShieldCheck size={17} />
              </button>
            </div>
          </Field>
          <Field label="Checklist Meta">
            <p className="muted-text">
              Activa y guarda este canal antes de verificar el webhook en Meta. Usa la URL webhook y el token de verificacion de abajo.
            </p>
          </Field>
        </>
      )}

      {channel.channel === "messenger" && (
        <>
          <Field label="ID pagina Facebook">
            <input
              value={credentials.facebookPageId || ""}
              onChange={(e) => updateCredential("facebookPageId", e.target.value)}
              placeholder="Pagina que recibe Messenger"
            />
          </Field>
          <Field label="ID app Meta">
            <input
              value={credentials.metaAppId || ""}
              onChange={(e) => updateCredential("metaAppId", e.target.value)}
              placeholder="App ID de Meta for Developers"
            />
          </Field>
          <Field label="Token de acceso">
            <div className="copy-field">
              <input
                type={props.showToken ? "text" : "password"}
                value={credentials.permanentAccessTokenEncrypted || ""}
                onChange={(e) => updateCredential("permanentAccessTokenEncrypted", e.target.value)}
                placeholder="Page access token con pages_messaging"
              />
              <button onClick={() => props.setShowToken(!props.showToken)}>
                <ShieldCheck size={17} />
              </button>
            </div>
          </Field>
          <Field label="Checklist Meta">
            <p className="muted-text">
              Activa y guarda este canal antes de verificar el webhook en Meta. Usa la URL webhook y el token de verificacion de abajo.
            </p>
          </Field>
        </>
      )}

      {channel.channel === "wordpress" && (
        <Field label="Instrucciones">
          <p className="muted-text">
            Copia y pega este webhook en tu formulario de WordPress (Contact Form 7 u otro plugin):
          </p>
          <div className="copy-field">
            <input value={channel.webhookUrl} readOnly />
            <button onClick={() => copyWithAlert(channel.webhookUrl, "Webhook")}>
              <Copy size={17} />
            </button>
          </div>
        </Field>
      )}

      <Field label="URL webhook">
        <div className="copy-field">
          <input value={channel.webhookUrl} readOnly />
          <button onClick={() => copyWithAlert(channel.webhookUrl, "Webhook")}>
            <Copy size={17} />
          </button>
        </div>
      </Field>

      <Field label="Token de verificación">
        <div className="copy-field">
          <input value={channel.verifyToken} readOnly />
          <button onClick={() => copyWithAlert(channel.verifyToken, "Token de verificación")}>
            <Copy size={17} />
          </button>
        </div>
      </Field>

      <Field label="Webhook secret">
        <div className="copy-field">
          <input value={channel.webhookSecret} readOnly />
          <button onClick={() => copyWithAlert(channel.webhookSecret, "Webhook secret")}>
            <Copy size={17} />
          </button>
        </div>
      </Field>
    </div>
  );
}

const weekDays = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const leadStatusColors = ["#25d366", "#2687ff", "#7c3aed", "#f5b942", "#25c6a6", "#a7b5bd"];
const leadSourceColors = ["#25d366", "#2687ff", "#7c3aed", "#f5b942", "#a7b5bd"];
const sectionSlugs: Record<string, string> = {
  Inicio: "",
  Asistentes: "asistentes",
  Descripción: "descripcion",
  Chat: "chat",
  Entrenamiento: "entrenamiento",
  Plantillas: "plantillas",
  Disparadores: "disparadores",
  "Recarga / Créditos": "creditos",
  "Logros / Métricas": "metricas",
  Ajustes: "ajustes",
  Contactos: "contactos",
  Etiquetas: "etiquetas",
  Admin: "admin"
};
const slugSections = Object.fromEntries(Object.entries(sectionSlugs).map(([sectionName, slug]) => [slug, sectionName]));

function sectionFromLocation() {
  const slug = window.location.pathname.replace(/^\/app\/?/, "").replace(/^\//, "").split("/")[0];
  return slugSections[slug] || "Inicio";
}

function appPathForSection(sectionName: string) {
  const slug = sectionSlugs[sectionName] ?? "";
  if (window.location.hostname.startsWith("app.")) return slug ? `/${slug}` : "/";
  return slug ? `/app/${slug}` : "/app";
}

function MagnetPanel() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [section, setSection] = useState(sectionFromLocation);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assistantId, setAssistantId] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [simulatorInput, setSimulatorInput] = useState("");
  const [simulatorMessages, setSimulatorMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [settingsTab, setSettingsTab] = useState<"General" | "IA" | "Chat">("General");
  const [aiSubtab, setAiSubtab] = useState<"General" | "Texto" | "Audio">("General");
  const [newAssistant, setNewAssistant] = useState({ name: "", countryCode: "CO +57", phone: "" });
  const [error, setError] = useState("");
  const [account, setAccount] = useState<AccountState | null>(null);
  const [billing, setBilling] = useState<BillingState>({ packages: [], mercadoPagoConfigured: false });
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);

  async function load(nextAssistantId = assistantId) {
    const query = nextAssistantId ? `?assistantId=${nextAssistantId}` : "";
    const response = await authFetch(`/api/bootstrap${query}`);
    if (response.status === 401) {
      localStorage.removeItem("magnet_token");
      window.location.replace("/login");
      return;
    }
    if (!response.ok) {
      setError("No se pudo cargar tu cuenta. Inicia sesión nuevamente.");
      return;
    }
    const payload = await response.json() as Bootstrap;
    setData(payload);
    const active = payload.activeAssistant || payload.assistants[0];
    if (active) {
      setAssistantId(active.id);
      setPromptDraft(active.prompt);
      setSelectedConversationId(payload.conversations[0]?.id || "");
    } else {
      setAssistantId("");
      setPromptDraft("");
      setSelectedConversationId("");
    }
  }

  useEffect(() => {
    void load();
    void loadAccount();
  }, []);

  useEffect(() => {
    localStorage.setItem("magnet_last_path", appPathForSection(section));
  }, [section]);

  useEffect(() => {
    const syncSection = () => setSection(sectionFromLocation());
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 921px)");
    const syncSidebar = (event: MediaQueryList | MediaQueryListEvent) => {
      if (event.matches) {
        setSidebarOpen(false);
      }
    };

    syncSidebar(media);
    media.addEventListener("change", syncSidebar);
    return () => media.removeEventListener("change", syncSidebar);
  }, []);

  const assistant = data?.assistants.find((item) => item.id === assistantId) || data?.activeAssistant || null;
  const contacts = data?.contacts || [];
  const conversations = data?.conversations || [];
  const messages = data?.messages || [];
  const triggers = data?.triggers || [];
  const templates = data?.templates || [];
  const tags = data?.tags || [];
  const products = data?.products || [];
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) || conversations[0];
  const selectedContact = contacts.find((contact) => contact.id === selectedConversation?.contactId);
  const conversationMessages = selectedConversation ? messages.filter((message) => message.conversationId === selectedConversation.id) : [];

  const metrics = useMemo(() => {
    const hot = contacts.filter((contact) => contact.leadScore > 70 || contact.tags.includes("caliente")).length;
    const outboundAi = messages.filter((message) => message.sender === "assistant").length;
    const inbound = messages.filter((message) => message.direction === "inbound").length;
    return {
      conversations: conversations.length,
      contacts: contacts.length,
      active: conversations.filter((conversation) => conversation.status !== "Perdido").length,
      hot,
      ai: inbound ? Math.round((outboundAi / inbound) * 100) : 0,
      outboundAi,
      inbound,
      human: messages.filter((message) => message.sender === "human").length
    };
  }, [contacts, conversations, messages]);

  async function updateAssistant(patch: Partial<Assistant>) {
    if (!assistant) return false;
    return updateAssistantById(assistant.id, patch);
  }

  async function updateAssistantById(targetAssistantId: string, patch: Partial<Assistant>) {
    setError("");
    const response = await authFetch(`/api/assistants/${targetAssistantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!response.ok) {
      const payload = await response.json() as { error?: string };
      setError(payload.error || "No se pudo guardar");
      return false;
    }
    await load(targetAssistantId);
    return true;
  }

  async function createAssistant() {
    if (!newAssistant.name || !newAssistant.phone) return;
    const response = await authFetch("/api/assistants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newAssistant)
    });
    const created = await response.json() as Assistant;
    setNewAssistant({ name: "", countryCode: "CO +57", phone: "" });
    await load(created.id);
    setSection("Ajustes");
  }

  async function sendManualMessage() {
    if (!assistant || !selectedContact || !messageText.trim()) return;
    await authFetch(`/api/assistants/${assistant.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: selectedContact.phone, text: messageText, name: selectedContact.name })
    });
    setMessageText("");
    await load(assistant.id);
  }

  async function simulate() {
    if (!assistant || !simulatorInput.trim()) return;
    const userText = simulatorInput;
    setSimulatorInput("");
    setSimulatorMessages((items) => [...items, { role: "Cliente", text: userText }]);
    const response = await authFetch(`/api/assistants/${assistant.id}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: userText })
    });
    const payload = await response.json() as { reply: string };
    setSimulatorMessages((items) => [...items, { role: "MAGNET", text: payload.reply }]);
  }

  async function saveTrigger(trigger: Partial<Trigger> & { name: string }) {
    if (!assistant) return;
    await authFetch(`/api/assistants/${assistant.id}/triggers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trigger)
    });
    window.alert("Disparador guardado correctamente.");
    await load(assistant.id);
  }

  async function deleteTrigger(id: string) {
    if (!assistant || !window.confirm("¿Eliminar este disparador?")) return;
    await authFetch(`/api/assistants/${assistant.id}/triggers/${id}`, { method: "DELETE" });
    window.alert("Disparador eliminado.");
    await load(assistant.id);
  }

  async function saveTemplate(template: Partial<Template> & { name: string }) {
    if (!assistant) return;
    await authFetch(`/api/assistants/${assistant.id}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template)
    });
    window.alert("Plantilla guardada correctamente.");
    await load(assistant.id);
  }

  async function deleteTemplate(id: string) {
    if (!assistant || !window.confirm("¿Eliminar esta plantilla?")) return;
    await authFetch(`/api/assistants/${assistant.id}/templates/${id}`, { method: "DELETE" });
    window.alert("Plantilla eliminada.");
    await load(assistant.id);
  }

  async function saveTag(tag: Partial<TagItem> & { name: string }) {
    if (!assistant) return;
    await authFetch(`/api/assistants/${assistant.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tag)
    });
    window.alert("Etiqueta guardada correctamente.");
    await load(assistant.id);
  }

  async function deleteTag(id: string) {
    if (!assistant || !window.confirm("¿Eliminar esta etiqueta?")) return;
    await authFetch(`/api/assistants/${assistant.id}/tags/${id}`, { method: "DELETE" });
    window.alert("Etiqueta eliminada.");
    await load(assistant.id);
  }

  async function saveProduct(product: Partial<ProductService> & { name: string; description: string }) {
    if (!assistant) return;
    await authFetch(`/api/assistants/${assistant.id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product)
    });
    window.alert("Producto o servicio guardado para el entrenamiento.");
    await load(assistant.id);
  }

  async function deleteProduct(id: string) {
    if (!assistant || !window.confirm("¿Eliminar este producto o servicio?")) return;
    await authFetch(`/api/assistants/${assistant.id}/products/${id}`, { method: "DELETE" });
    window.alert("Producto o servicio eliminado.");
    await load(assistant.id);
  }

  async function authFetch(path: string, init: RequestInit = {}) {
    const token = localStorage.getItem("magnet_token");
    return fetch(path, {
      ...init,
      headers: {
        ...(init.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  }

  async function loadAccount() {
    const token = localStorage.getItem("magnet_token");
    if (!token) return;

    const [meResponse, packagesResponse] = await Promise.all([
      authFetch("/api/me"),
      fetch("/api/billing/packages")
    ]);

    if (meResponse.ok) {
      setAccount(await meResponse.json() as AccountState);
    }
    if (packagesResponse.ok) {
      const payload = await packagesResponse.json() as BillingState;
      setBilling({
        packages: payload.packages || [],
        mercadoPagoConfigured: Boolean(payload.mercadoPagoConfigured)
      });
    }
  }

  async function loadAdminOverview() {
    const response = await authFetch("/api/admin/overview");
    if (response.ok) {
      setAdminOverview(await response.json() as AdminOverview);
    } else {
      setError("No tienes permisos para ver el panel admin");
    }
  }

  function logout() {
    localStorage.removeItem("magnet_token");
    window.location.href = "/login";
  }

  if (!data) {
    return <div className="loading">Cargando MAGNET...</div>;
  }

  if (!assistant) {
    return (
      <div className="empty-workspace">
        <a className="landing-logo" href="/"><LogoMark /></a>
        <Panel title="Crea tu primer asistente">
          <p className="muted-text">Tu cuenta ya esta lista. Crea el primer agente para generar webhook, configurar WhatsApp y empezar a usar tus 100 mensajes gratis.</p>
          <div className="field-row">
            <Field label="Nombre del asistente"><input value={newAssistant.name} onChange={(event) => setNewAssistant({ ...newAssistant, name: event.target.value })} placeholder="Ventas Magnet" /></Field>
            <Field label="Telefono"><input value={newAssistant.phone} onChange={(event) => setNewAssistant({ ...newAssistant, phone: event.target.value })} placeholder="3015336792" /></Field>
          </div>
          <Field label="Pais"><select value={newAssistant.countryCode} onChange={(event) => setNewAssistant({ ...newAssistant, countryCode: event.target.value })}><option>CO +57</option><option>EC +593</option><option>MX +52</option></select></Field>
          <button className="primary" onClick={createAssistant}>Crear asistente</button>
        </Panel>
        <button className="landing-secondary" onClick={logout}>Salir</button>
      </div>
    );
  }

  const selectSection = (nextSection: string) => {
    setSection(nextSection);
    const nextPath = appPathForSection(nextSection);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ section: nextSection }, "", nextPath);
    }
    setSidebarOpen(false);
  };

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand">
            <LogoMark className="brand-logo-img" />
            <div>
              <strong>MAGNET</strong>
              <span>Lead Management Agent</span>
            </div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar navegación">
            <X size={18} />
          </button>
        </div>

        <div className="assistant-current">
          <span className="muted">Asistente seleccionado</span>
          <strong>{assistant.countryCode.replace("CO ", "")} {assistant.phone}</strong>
          <small>{assistant.name}</small>
          <div className="status-row"><span className={`dot ${assistant.status}`} />Estado: {assistant.status === "active" ? "activo" : "inactivo"}</div>
        </div>

        <nav>
          {navItems.filter(([label]) => !label.startsWith("Descrip")).map(([label, Icon]) => (
            <button key={label} className={section === label ? "nav-active" : ""} onClick={() => selectSection(label)}>
              <Icon size={19} />
              <span>{label}</span>
              {label === "Chat" && <b>{conversations.length}</b>}
            </button>
          ))}
          {account && ["admin", "superadmin"].includes(account.user.role) && (
            <button className={section === "Admin" ? "nav-active" : ""} onClick={() => { selectSection("Admin"); void loadAdminOverview(); }}>
              <ShieldCheck size={19} />
              <span>Admin</span>
            </button>
          )}
        </nav>

        <div className="profile-card">
          <div className="avatar">{(account?.user.name || "M").slice(0, 1)}</div>
          <div><strong>{account?.user.name || "Magnet"}</strong><span>{account?.user.role || "Cuenta activa"}</span></div>
          <ChevronDown size={16} />
        </div>

        <div className="plan-card">
          <strong>{account?.organization.messageCredits ?? 0} mensajes</strong>
          <span>{account?.organization.name || "Plan inicial"}</span>
          <div className="progress"><i style={{ width: `${Math.min(100, ((account?.organization.messageCredits ?? 0) / 100) * 100)}%` }} /></div>
          <button onClick={() => selectSection("Recarga / Créditos")}>Ver creditos</button>
        </div>
      </aside>
      <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú" />

      <main className="main">
        <div className="mobile-bar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir navegación">
            <Menu size={20} />
          </button>
          <div className="mobile-brand">
            <LogoMark className="mobile-logo-img" />
            <div>
              <strong>MAGNET</strong>
              <span>{assistant.name}</span>
            </div>
          </div>
        </div>
        <header className="topbar">
          <div>
            <h1>{section === "Inicio" ? `Hola, ${account?.user.name?.split(" ")[0] || "Edi"}` : section}</h1>
            <p>{section === "Inicio" ? "Aquí tienes el resumen de tu sistema Magnet" : assistant.name}</p>
          </div>
          <div className="top-actions">
            <button className="ghost"><Clipboard size={18} /> Últimos 7 días</button>
            <button className="ghost"><ShieldCheck size={18} /> {assistant.status === "active" ? "Activo" : "Inactivo"}</button>
            <button className="primary" onClick={() => selectSection("Asistentes")}><Plus size={18} /> Nuevo agente</button>
            <button className="ghost" onClick={logout}>Salir</button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}
        {section === "Inicio" && (
          <Dashboard
            metrics={metrics}
            conversations={conversations}
            contacts={contacts}
            messages={messages}
            assistants={data.assistants}
            onOpenAgentChat={(id) => { setAssistantId(id); void load(id); selectSection("Chat"); }}
            onOpenAgentSettings={(id) => { setAssistantId(id); void load(id); selectSection("Ajustes"); }}
            onToggleAgent={(item) => void updateAssistantById(item.id, { status: item.status === "active" ? "inactive" : "active" })}
            onAddAgent={() => selectSection("Asistentes")}
          />
        )}
        {section === "Descripción" && <Overview assistant={assistant} metrics={metrics} conversations={conversations} />}
        {section === "Asistentes" && (
          <Assistants
            assistants={data.assistants}
            currentId={assistant.id}
            newAssistant={newAssistant}
            setNewAssistant={setNewAssistant}
            onCreate={createAssistant}
            onSelect={(id) => { setAssistantId(id); void load(id); }}
            onToggle={(item) => void updateAssistantById(item.id, { status: item.status === "active" ? "inactive" : "active" })}
            onOpenChat={() => selectSection("Chat")}
            onOpenSettings={() => selectSection("Ajustes")}
          />
        )}
        {section === "Chat" && (
          <Chat
            contacts={contacts}
            conversations={conversations}
            messages={conversationMessages}
            allMessages={messages}
            tags={tags}
            selectedConversationId={selectedConversation?.id || ""}
            selectedContact={selectedContact}
            messageText={messageText}
            setMessageText={setMessageText}
            setSelectedConversationId={setSelectedConversationId}
            onSend={sendManualMessage}
          />
        )}
        {section === "Entrenamiento" && (
          <Training
            promptDraft={promptDraft}
            setPromptDraft={setPromptDraft}
            onSave={() => void updateAssistant({ prompt: promptDraft })}
            simulatorInput={simulatorInput}
            setSimulatorInput={setSimulatorInput}
            simulatorMessages={simulatorMessages}
            onSimulate={simulate}
            products={products}
            onSaveProduct={saveProduct}
            onDeleteProduct={deleteProduct}
          />
        )}
        {section === "Disparadores" && <TriggersTable triggers={triggers} onSave={saveTrigger} onDelete={deleteTrigger} />}
        {section === "Plantillas" && <Templates templates={templates} onSave={saveTemplate} onDelete={deleteTemplate} />}
        {section === "Contactos" && <Contacts contacts={contacts} tags={tags} />}
        {section === "Etiquetas" && <TagsView tags={tags} onSave={saveTag} onDelete={deleteTag} />}
        {section === "Recarga / Créditos" && <Credits account={account} billing={billing} authFetch={authFetch} />}
        {section === "Logros / Métricas" && <Metrics conversations={conversations} contacts={contacts} messages={messages} />}
        {section === "Admin" && <AdminView overview={adminOverview} onRefresh={loadAdminOverview} authFetch={authFetch} />}
        {section === "Ajustes" && (
          <SettingsView
            assistant={assistant}
            settingsTab={settingsTab}
            setSettingsTab={setSettingsTab}
            aiSubtab={aiSubtab}
            setAiSubtab={setAiSubtab}
            updateAssistant={updateAssistant}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return <AppEntry />;
}

function Dashboard({
  metrics,
  conversations,
  contacts,
  messages,
  assistants = [],
  onOpenAgentChat,
  onOpenAgentSettings,
  onToggleAgent,
  onAddAgent
}: {
  metrics: Record<string, number>;
  conversations: Conversation[];
  contacts: Contact[];
  messages: Message[];
  assistants?: Assistant[];
  onOpenAgentChat: (id: string) => void;
  onOpenAgentSettings: (id: string) => void;
  onToggleAgent: (assistant: Assistant) => void;
  onAddAgent: () => void;
}) {
  const chartData = weekDays.map((day) => ({ day, conversations: 0, leads: 0 }));
  conversations.forEach((conversation) => {
    const day = new Date(conversation.lastMessageAt).getDay();
    const index = day === 0 ? 6 : day - 1;
    chartData[index].conversations += 1;
  });
  contacts.forEach((contact) => {
    const day = new Date(contact.lastMessageAt).getDay();
    const index = day === 0 ? 6 : day - 1;
    chartData[index].leads += 1;
  });
  const pieData = Object.entries(contacts.reduce<Record<string, number>>((acc, contact) => {
    acc[contact.status] = (acc[contact.status] || 0) + 1;
    return acc;
  }, {})).map(([name, value], index) => ({ name, value, color: leadStatusColors[index % leadStatusColors.length] }));
  const sources = Object.entries(contacts.reduce<Record<string, number>>((acc, contact) => {
    const source = contact.source || "Otros";
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {})).map(([source, value], index) => ({ source, value, color: leadSourceColors[index % leadSourceColors.length] }));
  const maxSource = Math.max(1, ...sources.map((item) => item.value));
  const processed = metrics.inbound + metrics.outboundAi + metrics.human;
  const aiScore = Math.max(0, Math.min(100, metrics.ai));
  const visibleAssistants = assistants.slice(0, 4);

  return (
    <div className="dashboard-grid">
      <MetricCard icon={MessageCircle} label="Conversaciones" value={metrics.conversations} delta="datos reales" />
      <MetricCard icon={Users} label="Leads nuevos" value={metrics.contacts} delta="datos reales" />
      <MetricCard icon={Target} label="Leads activos" value={metrics.active} delta="datos reales" />
      <MetricCard icon={Flame} label="Leads calientes" value={metrics.hot} delta="datos reales" />
      <MetricCard icon={Bot} label="Tasa de respuesta IA" value={`${metrics.ai}%`} delta={`${metrics.outboundAi}/${Math.max(1, metrics.inbound)} respuestas`} />

      <Panel className="wide" title="Conversaciones" action="Diario">
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#25d366" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#25d366" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" stroke="#7f8b95" />
            <YAxis stroke="#7f8b95" />
            <Tooltip contentStyle={{ background: "#101c1d", border: "1px solid #243534", color: "#fff" }} />
            <Area type="monotone" dataKey="conversations" stroke="#58e34f" fill="url(#green)" strokeWidth={3} />
            <Area type="monotone" dataKey="leads" stroke="#8b9aa4" fill="transparent" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Distribucion de leads por estado">
        <div className="pie-wrap">
          <div className="pie-chart-area">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={pieData.length ? pieData : [{ name: "Sin leads", value: 1, color: "#233132" }]} dataKey="value" innerRadius={58} outerRadius={96} paddingAngle={0}>
                  {(pieData.length ? pieData : [{ name: "Sin leads", value: 1, color: "#233132" }]).map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="legend-list">
            {pieData.length ? pieData.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name} <b>{item.value}</b></span>) : <span><i style={{ background: "#233132" }} />Sin leads <b>0</b></span>}
          </div>
        </div>
      </Panel>

      <Panel title="Actividad reciente" action="Ver todas">
        <ActivityList contacts={contacts} />
      </Panel>

      <Panel title="Agentes activos" className="wide agents-panel">
        <div className="table compact">
          <div className="table-head"><span>Agente</span><span>Numero</span><span>Estado</span><span>Conversaciones</span><span>Acciones</span></div>
          {visibleAssistants.map((agent) => {
            const ToggleIcon = agent.status === "active" ? ToggleRight : ToggleLeft;
            return (
            <div className="table-row" key={agent.id}>
              <span><span className={`wa-dot ${agent.status}`}><MessageCircle size={16} /></span><strong>{agent.name}</strong></span>
              <span>{agent.countryCode} {agent.phone}</span>
              <span className={agent.status === "active" ? "pill green" : "pill gray"}>{agent.status === "active" ? "Activo" : "Inactivo"}</span>
              <span><b>{conversations.filter((conversation) => conversation.assistantId === agent.id).length}</b> <small>{messages.filter((message) => message.assistantId === agent.id).length} mensajes</small></span>
              <span className="icon-actions">
                <button onClick={() => onOpenAgentChat(agent.id)} aria-label={`Abrir chat de ${agent.name}`}><MessageCircle size={17} /></button>
                <button onClick={() => onOpenAgentSettings(agent.id)} aria-label={`Abrir ajustes de ${agent.name}`}><Settings size={17} /></button>
                <button onClick={() => onToggleAgent(agent)} aria-label={`${agent.status === "active" ? "Desactivar" : "Activar"} ${agent.name}`}><ToggleIcon size={17} /></button>
              </span>
            </div>
          );})}
          {!visibleAssistants.length && <p className="muted-text">Aún no hay agentes en este workspace.</p>}
        </div>
        <button className="add-agent-inline" onClick={onAddAgent}><Plus size={18} />Agregar agente</button>
      </Panel>

      <Panel title="Rendimiento de IA" className="ai-performance">
        <div className="gauge" style={{ "--score": `${aiScore}%` } as React.CSSProperties}>
          <div className="gauge-core">
            <strong>{aiScore}%</strong>
            <span>Efectividad</span>
          </div>
        </div>
        <div className="mini-stats"><span><b>{processed}</b>Procesados</span><span><b>{metrics.outboundAi}</b>Respuestas IA</span><span><b>{metrics.human}</b>Humanas</span></div>
      </Panel>

      <Panel title="Fuentes de leads" action="Ver reporte">
        {sources.length ? sources.map(({ source, value, color }) => (
          <div className="source-row" key={source}>
            <span>{source}</span>
            <div><i style={{ width: `${Math.round((value / maxSource) * 100)}%`, background: color }} /></div>
            <b>{value}</b>
          </div>
        )) : <p className="muted-text">Aun no hay fuentes reales de leads.</p>}
        <div className="source-total"><span>Total</span><strong>{metrics.contacts} leads</strong></div>
      </Panel>
    </div>
  );
}
function Overview({ assistant, metrics, conversations }: { assistant: Assistant; metrics: Record<string, number>; conversations: Conversation[] }) {
  const todayKey = toDateInput(new Date());
  const todayConversations = conversations.filter((conversation) => toDateInput(new Date(conversation.lastMessageAt)) === todayKey).length;
  const last7Start = new Date();
  last7Start.setDate(last7Start.getDate() - 6);
  const last7Data = buildActualMetrics(toDateInput(last7Start), todayKey, conversations, [], []);
  return (
    <div className="stack-grid">
      <Panel title="Estado">
        <div className="hero-status"><span className={`dot ${assistant.status}`} />{assistant.status === "active" ? "Activo" : "Inactivo"}</div>
      </Panel>
      <Panel title="Cuotas">
        <div className="quota"><strong>{metrics.conversations} / 1.000</strong><span>Conversaciones usadas</span><div className="progress"><i style={{ width: `${Math.min(metrics.conversations / 10, 100)}%` }} /></div></div>
      </Panel>
      <Panel title="Nuevas conversaciones hoy"><div className="big-number">{todayConversations}</div></Panel>
      <Panel title="Nuevas conversaciones últimos 7 días" className="wide">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={last7Data}>
            <XAxis dataKey="label" stroke="#7f8b95" /><YAxis stroke="#7f8b95" />
            <Area type="monotone" dataKey="conversations" stroke="#25d366" fill="#25d36633" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

function Assistants(props: {
  assistants: Assistant[];
  currentId: string;
  newAssistant: { name: string; countryCode: string; phone: string };
  setNewAssistant: (value: { name: string; countryCode: string; phone: string }) => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onToggle: (assistant: Assistant) => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="split-grid">
      <Panel title="Asistente seleccionado" className="wide">
        <div className="assistant-list">
          {props.assistants.map((assistant) => (
            <div className={`assistant-row ${assistant.id === props.currentId ? "selected" : ""}`} key={assistant.id}>
              <div className="robot-icon"><Bot size={24} /></div>
              <div><strong>{assistant.countryCode} {assistant.phone}</strong><span>{assistant.name}</span></div>
              <div className="assistant-actions">
                <button onClick={props.onOpenChat}><MessageCircle size={17} /></button>
                <button onClick={props.onOpenSettings}><Settings size={17} /></button>
                <button onClick={() => props.onToggle(assistant)}><ToggleLeft size={17} /></button>
                <button className="primary small" onClick={() => props.onSelect(assistant.id)}>Seleccionar</button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Agregar asistente">
        <Field label="Nombre">
          <input value={props.newAssistant.name} onChange={(event) => props.setNewAssistant({ ...props.newAssistant, name: event.target.value })} placeholder="Ventas Magnet" />
        </Field>
        <Field label="País">
          <select value={props.newAssistant.countryCode} onChange={(event) => props.setNewAssistant({ ...props.newAssistant, countryCode: event.target.value })}>
            <option>CO +57</option><option>EC +593</option><option>MX +52</option><option>US +1</option>
          </select>
        </Field>
        <Field label="Número WhatsApp">
          <input value={props.newAssistant.phone} onChange={(event) => props.setNewAssistant({ ...props.newAssistant, phone: event.target.value })} placeholder="3138851960" />
        </Field>
        <button className="primary full" onClick={props.onCreate}><Plus size={18} />Agregar asistente</button>
      </Panel>
    </div>
  );
}

type ConversationFilter = {
  search: string;
  tag: string;
  status: string;
  automation: string;
  unread: boolean;
  date: string;
};

function Chat(props: {
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  allMessages: Message[];
  tags: TagItem[];
  selectedConversationId: string;
  selectedContact?: Contact;
  messageText: string;
  setMessageText: (value: string) => void;
  setSelectedConversationId: (id: string) => void;
  onSend: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ConversationFilter>({
    search: "",
    tag: "",
    status: "",
    automation: "",
    unread: false,
    date: ""
  });
  const selectedConversation = props.conversations.find((conversation) => conversation.id === props.selectedConversationId);
  const selectedMessages = props.messages;
  const selectedHasError = selectedMessages.some((message) => message.status === "failed");
  const selectedTags = uniqueDisplayTags([...(selectedConversation?.tags || []), ...(props.selectedContact?.tags || []), selectedConversation?.status || ""]).slice(0, 4);
  const selectedWasHandledByBot = selectedConversation?.botEnabled || selectedMessages.some((message) => message.sender === "assistant");
  const filteredConversations = props.conversations
    .map((conversation) => {
      const contact = props.contacts.find((item) => item.id === conversation.contactId);
      const messages = props.allMessages.filter((message) => message.conversationId === conversation.id);
      const autoTags = deriveConversationTags(conversation, contact, messages);
      const tagList = uniqueDisplayTags([...(conversation.tags || []), ...(contact?.tags || []), ...autoTags]);
      const lastMessage = messages[messages.length - 1];
      const channel = channelFromConversation(conversation, contact, lastMessage);
      const isUnread = lastMessage?.direction === "inbound" && lastMessage.status === "received";
      const searchable = `${contact?.name || ""} ${contact?.phone || ""} ${conversation.lastMessage} ${tagList.join(" ")}`.toLowerCase();
      return { conversation, contact, messages, tagList, lastMessage, isUnread, searchable, channel };
    })
    .filter((item) => {
      if (filters.search && !item.searchable?.includes(filters.search.toLowerCase())) return false;
      if (filters.tag && !item.tagList.includes(filters.tag)) return false;
      if (filters.status && item.conversation.status !== filters.status) return false;
      if (filters.automation === "bot" && !item.conversation.botEnabled) return false;
      if (filters.automation === "human" && item.conversation.assignedTo !== "human") return false;
      if (filters.unread && !item.isUnread) return false;
      if (filters.date && new Date(item.conversation.lastMessageAt).toISOString().slice(0, 10) !== filters.date) return false;
      return true;
    })
    .sort((a, b) => new Date(b.conversation.lastMessageAt).getTime() - new Date(a.conversation.lastMessageAt).getTime());

  return (
    <div className="chat-layout">
      <section className="chat-panel">
        <div className="chat-header">
          <div><strong>{props.selectedContact?.name || "Selecciona una conversación"}</strong><span>{props.selectedContact?.phone}</span></div>
          {selectedTags.length > 0 && (
            <div className="contact-tags">
              {selectedTags.map((tag) => <i key={tag}>{labelFromTag(tag)}</i>)}
            </div>
          )}
          <div className="chat-header-actions">
            {selectedWasHandledByBot && <span className="status-chip bot"><Bot size={14} />Bot activo</span>}
            {selectedHasError && <span className="status-chip warning"><AlertTriangle size={14} />Revisar</span>}
            <select defaultValue={props.selectedContact?.status || "Nuevo"}>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select>
          </div>
        </div>
        <div className="chat-thread">
          {selectedMessages.length === 0 && (
            <div className="chat-empty">
              <Bot size={48} />
              <strong>No hay mensajes todavia</strong>
              <span>Cuando escriban al WhatsApp conectado, Magnet creara el lead y mostrara la conversacion aqui.</span>
            </div>
          )}
          {selectedMessages.map((message) => (
            <div key={message.id} className={`bubble ${message.direction}`}>
              <p>{message.text}</p>
              <small>
                <span>{formatTime(message.timestamp)}</span>
                {message.sender === "assistant" && <span className="mini-chip"><Bot size={12} />Bot</span>}
                {message.status === "failed" && <span className="mini-chip danger"><AlertTriangle size={12} />Error</span>}
                {message.direction === "outbound" && (
                  <span className={`receipt ${message.status}`} title={receiptTitle(message.status)}>
                    <CheckCheck size={14} />
                  </span>
                )}
              </small>
            </div>
          ))}
        </div>
        <div className="composer">
          <button><Paperclip size={19} /></button>
          <button><Clipboard size={19} /></button>
          <input
            value={props.messageText}
            onChange={(event) => props.setMessageText(event.target.value)}
            placeholder="Escribe una respuesta..."
            disabled={!selectedConversation}
          />
          <button className="primary icon" onClick={props.onSend}><Send size={18} /></button>
        </div>
      </section>
      <aside className="conversation-list">
        <div className="searchbar"><Search size={18} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Buscar lead o conversación" /></div>
        <div className="filters chat-filter-row">
          <button className={!filters.tag && !filters.status && !filters.automation && !filters.unread && !filters.date ? "active" : ""} onClick={() => setFilters({ search: filters.search, tag: "", status: "", automation: "", unread: false, date: "" })}>Todos</button>
          <button className={filters.automation === "bot" ? "active" : ""} onClick={() => setFilters({ ...filters, automation: filters.automation === "bot" ? "" : "bot" })}>Bot</button>
          <button className={filters.automation === "human" ? "active" : ""} onClick={() => setFilters({ ...filters, automation: filters.automation === "human" ? "" : "human" })}>Humano</button>
          <button className={filtersOpen ? "active" : ""} onClick={() => setFiltersOpen(!filtersOpen)}><Filter size={16} /></button>
        </div>
        {filtersOpen && (
          <div className="filter-menu">
            <Field label="Etiqueta"><select value={filters.tag} onChange={(event) => setFilters({ ...filters, tag: event.target.value })}><option value="">Todas</option>{props.tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}</select></Field>
            <Field label="Estado"><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select></Field>
            <Field label="Automatización"><select value={filters.automation} onChange={(event) => setFilters({ ...filters, automation: event.target.value })}><option value="">Todas</option><option value="bot">Bot activo</option><option value="human">Humano</option></select></Field>
            <Field label="Fecha"><input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} /></Field>
            <label className="check-row"><input type="checkbox" checked={filters.unread} onChange={(event) => setFilters({ ...filters, unread: event.target.checked })} /> Mensajes no leídos</label>
            <button className="secondary" onClick={() => setFilters({ search: filters.search, tag: "", status: "", automation: "", unread: false, date: "" })}>Limpiar filtros</button>
          </div>
        )}
        {filteredConversations.map(({ conversation, contact, messages, tagList, lastMessage, isUnread, channel }) => {
          const hasError = messages.some((message) => message.status === "failed");
          const wasHandledByBot = conversation.botEnabled || messages.some((message) => message.sender === "assistant");
          const visibleTags = tagList.slice(0, 3);
          return (
            <button
              className={`conversation-item ${conversation.id === props.selectedConversationId ? "active" : ""} ${isUnread ? "unread" : ""} ${hasError ? "failed" : ""}`}
              key={conversation.id}
              onClick={() => props.setSelectedConversationId(conversation.id)}
            >
              <div className="conversation-top">
                <strong>{contact?.name || "Contacto"}</strong>
                <img className="channel-icon" src={channelMeta[channel].icon} alt={channelMeta[channel].shortLabel} title={channelMeta[channel].label} />
                <span>{formatShortDate(conversation.lastMessageAt)}</span>
              </div>
              <div className="conversation-preview">
                {isUnread && <i className="unread-dot" />}
                <span>{conversation.lastMessage || "Sin mensajes todavia"}</span>
                {lastMessage?.direction === "outbound" && (
                  <em className={`receipt ${lastMessage.status}`} title={receiptTitle(lastMessage.status)}>
                    <CheckCheck size={15} />
                  </em>
                )}
              </div>
              <div className="conversation-meta">
                <div className="conversation-tags">
                  {visibleTags.map((tag) => <i key={tag}>{labelFromTag(tag)}</i>)}
                </div>
                <div className="conversation-icons">
                  {wasHandledByBot && <Bot size={15} />}
                  {hasError && <AlertTriangle size={15} />}
                </div>
              </div>
            </button>
          );
        })}
        {!filteredConversations.length && <p className="muted-text">No hay conversaciones con esos filtros.</p>}
      </aside>
    </div>
  );
}

function deriveConversationTags(conversation: Conversation, _contact: Contact | undefined, messages: Message[]) {
  const lastText = `${conversation.lastMessage} ${messages[messages.length - 1]?.text || ""}`.toLowerCase();
  const tags = [conversation.status, conversation.botEnabled ? "bot_activo" : "requiere_humano"];
  if (lastText.includes("precio") || lastText.includes("pago") || lastText.includes("comprar")) tags.push("interés_comercial");
  if (lastText.includes("envío") || lastText.includes("domicilio")) tags.push("envío");
  return tags.filter(Boolean);
}

function uniqueDisplayTags(tags: Array<string | undefined>) {
  const blocked = new Set(["whatsapp", "instagram", "messenger", "wordpress", "web", "internet"]);
  const seen = new Set<string>();
  return tags
    .map((tag) => (tag || "").trim())
    .filter(Boolean)
    .filter((tag) => {
      const key = labelFromTag(tag).toLowerCase();
      if (blocked.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function channelFromConversation(conversation: Conversation, contact?: Contact, lastMessage?: Message): VisibleChannelType {
  const raw = String(lastMessage?.channel || contact?.source || conversation.tags?.[0] || "").toLowerCase();
  if (raw.includes("instagram")) return "instagram";
  if (raw.includes("messenger") || raw.includes("facebook")) return "messenger";
  if (raw.includes("wordpress") || raw.includes("woocommerce") || raw.includes("web") || raw.includes("internet")) return "wordpress";
  return "whatsapp";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });
}

function receiptTitle(status: string) {
  if (status === "read") return "Leido";
  if (status === "delivered") return "Entregado";
  if (status === "failed") return "Error de envio";
  return "Enviado";
}

function labelFromTag(tag: string) {
  return tag.replace(/_/g, " ");
}

function copyWithAlert(value: string, label = "Copiado") {
  void navigator.clipboard.writeText(value);
  window.alert(`${label} al portapapeles.`);
}

function Training(props: {
  promptDraft: string;
  setPromptDraft: (value: string) => void;
  onSave: () => void;
  simulatorInput: string;
  setSimulatorInput: (value: string) => void;
  simulatorMessages: Array<{ role: string; text: string }>;
  onSimulate: () => void;
  products: ProductService[];
  onSaveProduct: (product: Partial<ProductService> & { name: string; description: string }) => void;
  onDeleteProduct: (id: string) => void;
}) {
  const emptyProduct = { name: "", description: "", imageUrl: "", price: "", currency: "COP" as const };
  const [draft, setDraft] = useState<Partial<ProductService> & { name: string; description: string }>(emptyProduct);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const openNewProduct = () => {
    setDraft(emptyProduct);
    setProductModalOpen(true);
  };
  const editProduct = (product: ProductService) => {
    setDraft(product);
    setProductModalOpen(true);
  };
  const closeProductModal = () => {
    setDraft(emptyProduct);
    setProductModalOpen(false);
  };
  const saveProduct = () => {
    if (!draft.name.trim() || !draft.description.trim()) {
      window.alert("Nombre y descripción son obligatorios.");
      return;
    }
    props.onSaveProduct(draft);
    closeProductModal();
  };
  const loadImage = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft((current) => ({ ...current, imageUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="training-grid">
      <Panel title="Entrenamiento" action="Prompt">
        <textarea className="prompt-editor" value={props.promptDraft} onChange={(event) => props.setPromptDraft(event.target.value)} />
        <div className="editor-footer"><span>{props.promptDraft.length} caracteres. Markdown soportado.</span><button className="primary" onClick={() => { props.onSave(); window.alert("Entrenamiento guardado correctamente."); }}><Save size={17} />Guardar</button></div>
      </Panel>
      <Panel title="Simulador de chat">
        <div className="simulator-log">
          {props.simulatorMessages.map((message, index) => <div key={`${message.role}-${index}`}><strong>{message.role}</strong><p>{message.text}</p></div>)}
          {!props.simulatorMessages.length && <p className="muted-text">Prueba cómo responde el asistente con el prompt, disparadores y productos cargados.</p>}
        </div>
        <div className="simulator-actions">
          <input value={props.simulatorInput} onChange={(event) => props.setSimulatorInput(event.target.value)} placeholder="Mensaje de prueba" />
          <button onClick={() => props.setSimulatorInput("")}>Limpiar</button>
          <button className="primary" onClick={props.onSimulate}><Send size={17} />Generar</button>
        </div>
      </Panel>
      <Panel title="Productos y servicios" className="wide">
        <div className="product-panel-head">
          <p className="helper-text">Carga la oferta que debe conocer el chat. El simulador y las respuestas automáticas usan esta información como contexto de venta.</p>
          <button className="primary" onClick={openNewProduct}><Plus size={17} />Añadir Producto/Servicio</button>
        </div>
        <div className="product-list">
          {props.products.map((product) => (
            <article key={product.id}>
              <div className="product-card-media">
                {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span><Image size={24} /></span>}
              </div>
              <div className="product-card-body">
                <strong>{product.name}</strong>
                <p>{product.description}</p>
                <small>{product.price ? `${product.currency} ${product.price}` : "Sin precio obligatorio"}</small>
              </div>
              <div className="product-card-actions">
                <button onClick={() => editProduct(product)} aria-label={`Editar ${product.name}`}><Edit3 size={16} /></button>
                <button onClick={() => props.onDeleteProduct(product.id)} aria-label={`Eliminar ${product.name}`}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
          {!props.products.length && <p className="muted-text">Aún no hay productos o servicios cargados.</p>}
        </div>
      </Panel>
      {productModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Producto o servicio">
          <section className="product-modal">
            <div className="modal-title">
              <div>
                <strong>{draft.id ? "Editar producto/servicio" : "Añadir producto/servicio"}</strong>
                <span>Esta información alimenta el entrenamiento del chat.</span>
              </div>
              <button onClick={closeProductModal} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="product-form">
              <Field label="Nombre"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Plan mensual, asesoría, producto..." /></Field>
              <Field label="Precio o rango (opcional)"><input value={draft.price || ""} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="199000 o 150000-250000" /></Field>
              <Field label="Moneda"><select value={draft.currency || "COP"} onChange={(event) => setDraft({ ...draft, currency: event.target.value as ProductService["currency"] })}><option>COP</option><option>USD</option><option>EUR</option><option>MXN</option></select></Field>
              <Field label="Imagen"><input type="file" accept="image/*" onChange={(event) => loadImage(event.target.files?.[0])} /></Field>
              <Field label="Descripción"><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Qué incluye, beneficios, restricciones, detalles que debe saber el chat." /></Field>
              <div className="product-preview">
                {draft.imageUrl ? <img src={draft.imageUrl} alt="" /> : <span><Image size={24} />Sin imagen</span>}
              </div>
              <div className="form-actions">
                <button className="ghost" onClick={closeProductModal}>Cancelar</button>
                <button className="primary" onClick={saveProduct}><Save size={17} />Guardar</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function TriggersTable({ triggers, onSave, onDelete }: {
  triggers: Trigger[];
  onSave: (trigger: Partial<Trigger> & { name: string }) => void;
  onDelete: (id: string) => void;
}) {
  type TriggerDraft = { id?: string; name: string; type: string; conditions: string; actions: string; active: boolean };
  const empty: TriggerDraft = { name: "", type: "keyword", conditions: "", actions: "", active: true };
  const [draft, setDraft] = useState(empty);
  const edit = (trigger: Trigger) => setDraft({
    id: trigger.id,
    name: trigger.name,
    type: trigger.type,
    conditions: trigger.conditions.join(", "),
    actions: trigger.actions.join(", "),
    active: trigger.active
  });
  const save = () => {
    if (!draft.name.trim()) {
      window.alert("El nombre del disparador es obligatorio.");
      return;
    }
    const draftId = draft.id;
    onSave({
      ...(draftId ? { id: draftId } : {}),
      name: draft.name,
      type: draft.type,
      conditions: draft.conditions.split(",").map((item) => item.trim()).filter(Boolean),
      actions: draft.actions.split(",").map((item) => item.trim()).filter(Boolean),
      active: draft.active
    });
    setDraft(empty);
  };
  return (
    <Panel title="Disparadores lógicos">
      <p className="helper-text">Los disparadores detectan palabras, intención o eventos de la conversación y ejecutan acciones como etiquetar, avisar a un humano o enviar una plantilla.</p>
      <div className="crud-form">
        <Field label="Nombre"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="interesado_producto" /></Field>
        <Field label="Tipo"><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option value="keyword">Keyword</option><option value="intent">Intención</option><option value="logic">Lógico</option><option value="event">Evento</option></select></Field>
        <Field label="Condiciones"><input value={draft.conditions} onChange={(event) => setDraft({ ...draft, conditions: event.target.value })} placeholder="precio, comprar, pago" /></Field>
        <Field label="Acciones"><input value={draft.actions} onChange={(event) => setDraft({ ...draft, actions: event.target.value })} placeholder="asignar etiqueta, notificar humano" /></Field>
        <label className="check-row"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Activo</label>
        <div className="form-actions"><button className="ghost" onClick={() => setDraft(empty)}>Nuevo</button><button className="primary" onClick={save}><Save size={17} />Guardar</button></div>
      </div>
      <div className="table">
        <div className="table-head trigger"><span></span><span>Editar</span><span>Nombre</span><span>Tipo</span><span>Condiciones</span><span>Acciones</span><span>Creado</span><span>Estado</span></div>
        {triggers.map((trigger) => (
          <div className="table-row trigger" key={trigger.id}>
            <input type="checkbox" defaultChecked={trigger.active} />
            <span className="row-actions"><button onClick={() => edit(trigger)}><Edit3 size={16} /></button><button onClick={() => onDelete(trigger.id)}><Trash2 size={16} /></button></span>
            <span>{trigger.name}</span>
            <span>{trigger.type}</span>
            <span>{trigger.conditions.join(", ")}</span>
            <span>{trigger.actions.join(", ")}</span>
            <span>{new Date(trigger.createdAt).toLocaleDateString("es-CO")}</span>
            <span className={trigger.active ? "pill green" : "pill gray"}>{trigger.active ? "Activo" : "Inactivo"}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SettingsView(props: {
  assistant: Assistant;
  settingsTab: "General" | "IA" | "Chat";
  setSettingsTab: (value: "General" | "IA" | "Chat") => void;
  aiSubtab: "General" | "Texto" | "Audio";
  setAiSubtab: (value: "General" | "Texto" | "Audio") => void;
  updateAssistant: (patch: Partial<Assistant>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(props.assistant);
  const [showToken, setShowToken] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelType>("whatsapp");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => setDraft(props.assistant), [props.assistant]);
  useEffect(() => {
    if (!visibleChannelTypes.includes(selectedChannel as VisibleChannelType)) {
      setSelectedChannel("whatsapp");
    }
  }, [selectedChannel]);

  const save = async () => {
    setSaveState("saving");
    const ok = await props.updateAssistant(draft);
    setSaveState(ok ? "saved" : "error");
    if (ok) {
      window.alert("Cambios guardados correctamente.");
      window.setTimeout(() => setSaveState("idle"), 2600);
    }
  };
  const uuidError = draft.referenceAssistantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.referenceAssistantId);
  const selectedVisibleChannel = visibleChannelTypes.includes(selectedChannel as VisibleChannelType) ? selectedChannel as VisibleChannelType : "whatsapp";
  const currentChannel = normalizeChannelSettings(selectedVisibleChannel, draft.channels[selectedVisibleChannel]);

  return (
    <div className="settings-shell">
      <div className="settings-tabs">
        {(["General", "IA", "Chat"] as const).map((tab) => <button className={props.settingsTab === tab ? "active" : ""} key={tab} onClick={() => props.setSettingsTab(tab)}>{tab}</button>)}
        <button className="primary save" onClick={() => void save()} disabled={saveState === "saving" || Boolean(uuidError)}>
          {saveState === "saving" ? "Guardando..." : saveState === "saved" ? "Guardado" : "Guardar"}
        </button>
      </div>
      {saveState === "saved" && <div className="success-banner">Cambios guardados correctamente.</div>}
      {saveState === "error" && <div className="error-banner">No se pudieron guardar los cambios. Revisa los campos e intenta de nuevo.</div>}

      {props.settingsTab === "General" && (
        <Panel title="Ajustes generales">
          <Field label="ID del asistente">
            <div className="copy-field"><input value={draft.id} readOnly /><button onClick={() => copyWithAlert(draft.id, "ID del asistente")}><Copy size={17} /></button></div>
          </Field>
          <Field label="Nombre"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <div className="field-row">
            <Field label="País"><select value={draft.countryCode} onChange={(event) => setDraft({ ...draft, countryCode: event.target.value })}><option>CO +57</option><option>EC +593</option><option>MX +52</option></select></Field>
            <Field label="Teléfono"><input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></Field>
          </div>
          <Field label="Mensaje de bienvenida">
            <div className="copy-field"><input value={draft.welcomeMessageId || "No seleccionado aún"} readOnly /><button><Clipboard size={17} /></button></div>
          </Field>
          <Field label="Usar referencia opcional">
            <input value={draft.referenceAssistantId} onChange={(event) => setDraft({ ...draft, referenceAssistantId: event.target.value })} placeholder="UUID de otro asistente" />
            {uuidError && <small className="field-error">El formato del identificador es incorrecto</small>}
            <small>Este campo permite usar la configuración de otro asistente como referencia para replicar plantillas, etiquetas, disparadores, entrenamiento u otras configuraciones.</small>
          </Field>
        </Panel>
      )}

      {props.settingsTab === "IA" && (
        <div className="ai-settings">
          <aside>{(["General", "Texto", "Audio"] as const).map((tab) => <button className={props.aiSubtab === tab ? "active" : ""} key={tab} onClick={() => props.setAiSubtab(tab)}>{tab}</button>)}</aside>
          <Panel title={`IA / ${props.aiSubtab}`}>
            {props.aiSubtab === "General" && (
              <>
                <Field label="Estado"><select value={draft.ai.status} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, status: event.target.value as Assistant["ai"]["status"] } })}><option value="active">Activo</option><option value="sleeping">Dormido</option><option value="inactive">Inactivo</option></select></Field>
                <Field label="Tiempo de respuesta"><Stepper value={draft.ai.responseDelaySeconds} onChange={(value) => setDraft({ ...draft, ai: { ...draft.ai, responseDelaySeconds: value } })} suffix="segundos" /></Field>
                <Field label="Respuesta del asistente"><input type="range" min="0" max="100" value={draft.ai.textResponseProbability} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, textResponseProbability: Number(event.target.value), audioResponseProbability: 100 - Number(event.target.value) } })} /><small>{draft.ai.textResponseProbability}% texto, {draft.ai.audioResponseProbability}% audio</small></Field>
              </>
            )}
            {props.aiSubtab === "Texto" && (
              <div className="form-grid">
                <Field label="Proveedor IA"><select value={draft.ai.modelProvider} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, modelProvider: event.target.value as Assistant["ai"]["modelProvider"] } })}><option value="local">Local</option><option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option><option value="deepinfra">DeepInfra</option></select></Field>
                <Field label="Modelo IA"><input value={draft.ai.modelName} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, modelName: event.target.value } })} /></Field>
                <Field label="Temperatura"><input type="number" step="0.1" value={draft.ai.temperature} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, temperature: Number(event.target.value) } })} /></Field>
                <Field label="Máximo de tokens"><input type="number" value={draft.ai.maxTokens} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, maxTokens: Number(event.target.value) } })} /></Field>
                <Field label="Personalidad"><input value={draft.ai.personality} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, personality: event.target.value } })} /></Field>
                <Field label="Tono"><input value={draft.ai.tone} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, tone: event.target.value } })} /></Field>
                <Field label="Nivel de formalidad"><input value={draft.ai.formalityLevel} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, formalityLevel: event.target.value } })} /></Field>
                <Field label="Reglas de seguridad"><textarea value={draft.ai.systemRules} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, systemRules: event.target.value } })} /></Field>
                <Field label="Idioma principal"><input value={draft.ai.mainLanguage} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, mainLanguage: event.target.value } })} /></Field>
                <Field label="Idiomas permitidos"><input value={draft.ai.allowedLanguages.join(", ")} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, allowedLanguages: event.target.value.split(",").map((item) => item.trim()) } })} /></Field>
              </div>
            )}
            {props.aiSubtab === "Audio" && (
              <div className="form-grid">
                <Field label="Respuestas de audio"><select value={draft.ai.audioEnabled ? "on" : "off"} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, audioEnabled: event.target.value === "on" } })}><option value="on">Activado</option><option value="off">Desactivado</option></select></Field>
                <Field label="Voz seleccionada"><input value={draft.ai.voice} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, voice: event.target.value } })} /></Field>
                <Field label="Velocidad"><input type="number" step="0.1" value={draft.ai.voiceSpeed} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, voiceSpeed: Number(event.target.value) } })} /></Field>
                <Field label="Transcripción de notas de voz"><select value={draft.ai.transcribeIncomingAudio ? "on" : "off"} onChange={(event) => setDraft({ ...draft, ai: { ...draft.ai, transcribeIncomingAudio: event.target.value === "on" } })}><option value="on">Activada</option><option value="off">Desactivada</option></select></Field>
              </div>
            )}
          </Panel>
        </div>
      )}

      {props.settingsTab === "Chat" && (
        <div className="channels-settings">
          <aside className="channels-list">
            {visibleChannelTypes.map((channelId) => {
              const channel = normalizeChannelSettings(channelId, draft.channels[channelId]);
              const meta = channelMeta[channelId];
              return (
              <button
                key={channelId}
                className={selectedVisibleChannel === channelId ? "active" : ""}
                onClick={() => setSelectedChannel(channelId)}
              >
                <img src={meta.icon} alt="" aria-hidden="true" />
                <div>
                  <strong>{meta.label}</strong>
                  <small>{meta.description}</small>
                  <span className={channel.enabled ? "enabled" : "disabled"}>
                    {channel.enabled ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </button>
            );})}
          </aside>
          <Panel title={`Configuración: ${channelMeta[selectedVisibleChannel].label}`}>
            <ChannelSettingsForm
              channel={currentChannel}
              onUpdate={(updated) =>
                setDraft({
                  ...draft,
                  channels: { ...draft.channels, [selectedVisibleChannel]: updated }
                })
              }
              showToken={showToken}
              setShowToken={setShowToken}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}

function Templates({ templates, onSave, onDelete }: {
  templates: Template[];
  onSave: (template: Partial<Template> & { name: string }) => void;
  onDelete: (id: string) => void;
}) {
  type TemplateDraft = { id?: string; name: string; type: string; language: string; body: string; status: string };
  const empty: TemplateDraft = { name: "", type: "utility", language: "es_CO", body: "", status: "draft" };
  const [draft, setDraft] = useState(empty);
  const save = () => {
    if (!draft.name.trim() || !draft.body.trim()) {
      window.alert("Nombre y mensaje son obligatorios.");
      return;
    }
    onSave(draft);
    setDraft(empty);
  };
  return (
    <Panel title="Plantillas">
      <p className="helper-text">Las plantillas son mensajes reutilizables para bienvenida, seguimiento, pagos o confirmaciones. Puedes usarlas en respuestas manuales o acciones de disparadores.</p>
      <div className="crud-form template-form">
        <Field label="Nombre"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="seguimiento_pago" /></Field>
        <Field label="Tipo"><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option value="utility">Utility</option><option value="marketing">Marketing</option><option value="authentication">Autenticación</option><option value="text">Texto</option></select></Field>
        <Field label="Idioma"><input value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value })} /></Field>
        <Field label="Estado"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="draft">Borrador</option><option value="approved">Aprobada</option><option value="paused">Pausada</option><option value="rejected">Rechazada</option></select></Field>
        <Field label="Mensaje"><textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Hola {{1}}, gracias por escribirnos..." /></Field>
        <div className="form-actions"><button className="ghost" onClick={() => setDraft(empty)}>Nueva</button><button className="primary" onClick={save}><Save size={17} />Guardar</button></div>
      </div>
      {templates.map((template) => (
        <div className="template-card" key={template.id}>
          <strong>{template.name}</strong><span>{template.language} · {template.status}</span><p>{template.body}</p>
          <div className="card-actions"><button onClick={() => setDraft(template)}><Edit3 size={16} />Editar</button><button onClick={() => onDelete(template.id)}><Trash2 size={16} />Eliminar</button></div>
        </div>
      ))}
    </Panel>
  );
}

function Contacts({ contacts, tags }: { contacts: Contact[]; tags: TagItem[] }) {
  const [selectedTag, setSelectedTag] = useState("");
  const [search, setSearch] = useState("");
  const filteredContacts = contacts.filter((contact) => {
    const matchesTag = !selectedTag || contact.tags.includes(selectedTag);
    const matchesSearch = !search || `${contact.name} ${contact.phone} ${contact.email}`.toLowerCase().includes(search.toLowerCase());
    return matchesTag && matchesSearch;
  });
  return (
    <Panel title="Contactos">
      <div className="contact-toolbar">
        <div className="searchbar"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contacto" /></div>
        <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)}>
          <option value="">Todas las etiquetas</option>
          {tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
        </select>
      </div>
      <div className="tag-strip">{tags.map((tag) => <button className={selectedTag === tag.name ? "active" : ""} key={tag.id} style={{ borderColor: tag.color }} onClick={() => setSelectedTag(selectedTag === tag.name ? "" : tag.name)}>{tag.name}</button>)}</div>
      <div className="table"><div className="table-head contacts"><span>Nombre</span><span>Teléfono</span><span>Fuente</span><span>Estado</span><span>Etiquetas</span><span>Score</span></div>{filteredContacts.map((contact) => <div className="table-row contacts" key={contact.id}><span>{contact.name}</span><span>{contact.phone}</span><span>{contact.source}</span><span>{contact.status}</span><span>{contact.tags.map((tag) => <i className="tag" key={tag}>{tag}</i>)}</span><span>{contact.leadScore}</span></div>)}</div>
      {!filteredContacts.length && <p className="muted-text">No hay contactos con ese filtro.</p>}
    </Panel>
  );
}

function TagsView({ tags, onSave, onDelete }: {
  tags: TagItem[];
  onSave: (tag: Partial<TagItem> & { name: string }) => void;
  onDelete: (id: string) => void;
}) {
  type TagDraft = { id?: string; name: string; color: string };
  const empty: TagDraft = { name: "", color: "#25d366" };
  const [draft, setDraft] = useState(empty);
  const save = () => {
    if (!draft.name.trim()) {
      window.alert("El nombre de la etiqueta es obligatorio.");
      return;
    }
    onSave(draft);
    setDraft(empty);
  };
  return (
    <Panel title="Etiquetas">
      <p className="helper-text">Las etiquetas clasifican contactos y conversaciones. También alimentan filtros, automatizaciones y seguimiento comercial.</p>
      <div className="crud-form tag-form">
        <Field label="Nombre"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="cliente_caliente" /></Field>
        <Field label="Color"><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></Field>
        <div className="form-actions"><button className="ghost" onClick={() => setDraft(empty)}>Nueva</button><button className="primary" onClick={save}><Save size={17} />Guardar</button></div>
      </div>
      {tags.map((tag) => <div className="tag-row editable" key={tag.id}><i style={{ background: tag.color }} /><strong>{tag.name}</strong><span>{tag.color}</span><button onClick={() => setDraft(tag)}><Edit3 size={16} /></button><button onClick={() => onDelete(tag.id)}><Trash2 size={16} /></button></div>)}
    </Panel>
  );
}

function Integrations() {
  const channels: Array<{ id: ChannelType; name: string; description: string }> = [
    { id: "whatsapp", name: "WhatsApp Cloud API", description: "Conecta con Meta WhatsApp Business" },
    { id: "instagram", name: "Instagram Direct Messages", description: "Responde mensajes de Instagram DM" },
    { id: "messenger", name: "Facebook Messenger", description: "Integra con Messenger de Facebook" },
    { id: "wordpress", name: "WordPress Forms", description: "Captura leads desde formularios WP" }
  ];

  return (
    <div className="cards-grid">
      {channels.map((channel) => (
        <Panel title={channel.name} key={channel.id}>
          <p className="muted-text">{channel.description}</p>
          <button className="secondary">Configurar en Ajustes</button>
        </Panel>
      ))}
    </div>
  );
}

function Credits({
  account,
  billing,
  authFetch
}: {
  account: AccountState | null;
  billing: BillingState;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const credits = account?.organization.messageCredits ?? 0;
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState("");

  async function buyPackage(packageId: string) {
    setCheckoutError("");
    setCheckoutLoading(packageId);
    const response = await authFetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId })
    });
    const payload = await response.json();
    setCheckoutLoading("");
    if (!response.ok) {
      setCheckoutError(payload.error || "No se pudo iniciar el checkout");
      return;
    }
    window.location.href = payload.initPoint;
  }

  return (
    <div className="credits-view">
      <Panel title="Recarga / Créditos">
        <div className="credit-box">
          <strong>{credits}</strong>
          <span>Mensajes disponibles para respuestas automaticas de IA</span>
          <div className="progress"><i style={{ width: `${Math.min(100, credits)}%` }} /></div>
          <p className="muted-text">Cada respuesta enviada por IA descuenta 1 mensaje. Tus primeros 100 mensajes gratis se activan al registrarte.</p>
        </div>
      </Panel>
      <Panel title="Paquetes disponibles">
        {!billing.mercadoPagoConfigured && (
          <div className="info-banner">Mercado Pago aun no esta conectado. Cuando tengamos el access token, estos botones abriran el checkout real.</div>
        )}
        {checkoutError && <div className="error-banner">{checkoutError}</div>}
        <div className="package-grid">
          {billing.packages.map((item) => (
            <article key={item.id}>
              <strong>{item.messages}</strong>
              <span>{formatCop(item.priceCop)}</span>
              <small>{item.name}</small>
              <button className="primary" onClick={() => void buyPackage(item.id)} disabled={checkoutLoading === item.id}>
                {checkoutLoading === item.id ? "Abriendo..." : "Comprar"}
              </button>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="Movimientos recientes">
        <div className="ledger-list">
          {(account?.ledger || []).slice().reverse().slice(0, 8).map((entry) => (
            <div key={entry.id}>
              <span>{entry.description}</span>
              <b>{entry.amount > 0 ? "+" : ""}{entry.amount}</b>
              <small>Saldo {entry.balanceAfter}</small>
            </div>
          ))}
          {!account?.ledger?.length && <p className="muted-text">Aun no hay movimientos de creditos.</p>}
        </div>
      </Panel>
    </div>
  );
}

function AdminView({ overview, onRefresh, authFetch }: { overview: AdminOverview | null; onRefresh: () => void; authFetch: (path: string, init?: RequestInit) => Promise<Response> }) {
  type AdminDraft = { id?: string; name: string; email: string; password: string; role: AccountUser["role"]; planType: NonNullable<Organization["planType"]>; messageCredits: number };
  const empty: AdminDraft = { name: "", email: "", password: "", role: "user", planType: "Gratis", messageCredits: 100 };
  const [draft, setDraft] = useState(empty);

  async function saveUser() {
    if (!draft.name.trim() || !draft.email.trim()) {
      window.alert("Nombre y email son obligatorios.");
      return;
    }
    const response = await authFetch(draft.id ? `/api/admin/users/${draft.id}` : "/api/admin/users", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    if (!response.ok) {
      window.alert("No se pudo guardar el usuario.");
      return;
    }
    window.alert("Usuario guardado correctamente.");
    setDraft(empty);
    onRefresh();
  }

  async function deleteUser(id: string) {
    if (!window.confirm("¿Eliminar este usuario?")) return;
    const response = await authFetch(`/api/admin/users/${id}`, { method: "DELETE" });
    window.alert(response.ok ? "Usuario eliminado." : "No se pudo eliminar el usuario.");
    onRefresh();
  }

  if (!overview) {
    return <Panel title="Admin"><button className="primary" onClick={() => void onRefresh()}>Cargar información admin</button></Panel>;
  }

  return (
    <div className="admin-view">
      <div className="metric-summary-row">
        <MetricCard icon={Users} label="Usuarios" value={overview.totals.users} delta="registrados" />
        <MetricCard icon={ShieldCheck} label="Organizaciones" value={overview.totals.organizations} delta="workspaces" />
        <MetricCard icon={Bot} label="Asistentes" value={overview.totals.assistants} delta="creados" />
        <MetricCard icon={CreditCard} label="Créditos" value={overview.totals.creditsAvailable} delta="disponibles" />
      </div>
      <Panel title="Usuarios registrados">
        <div className="crud-form admin-form">
          <Field label="Nombre"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="Email"><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></Field>
          <Field label="Contraseña"><input type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder={draft.id ? "Opcional para cambiarla" : "Mínimo 8 caracteres"} /></Field>
          <Field label="Rol"><select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AccountUser["role"] })}><option value="user">Usuario</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select></Field>
          <Field label="Plan"><select value={draft.planType} onChange={(event) => setDraft({ ...draft, planType: event.target.value as AdminDraft["planType"] })}><option>Gratis</option><option>Básico</option><option>Profesional</option><option>Avanzado</option><option>Enterprise</option></select></Field>
          <Field label="Tokens"><input type="number" min="0" value={draft.messageCredits} onChange={(event) => setDraft({ ...draft, messageCredits: Number(event.target.value) })} /></Field>
          <div className="form-actions"><button className="ghost" onClick={() => setDraft(empty)}>Nuevo</button><button className="primary" onClick={() => void saveUser()}><Save size={17} />Guardar usuario</button></div>
        </div>
        <div className="table">
          <div className="table-head admin-users"><span>Nombre</span><span>Email</span><span>Rol</span><span>Plan</span><span>Último acceso</span><span>Acciones</span></div>
          {overview.users.map((user) => {
            const organization = overview.organizations.find((item) => item.id === user.organizationId);
            return (
              <div className="table-row admin-users" key={user.id}>
                <span>{user.name}</span>
                <span>{user.email}</span>
                <span>{user.role}</span>
                <span>{organization?.planType || "Gratis"}</span>
                <span>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-CO") : "Sin acceso"}</span>
                <span className="row-actions">
                  <button onClick={() => setDraft({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    password: "",
                    role: user.role,
                    planType: organization?.planType || "Gratis",
                    messageCredits: organization?.messageCredits || 0
                  })}><Edit3 size={16} /></button>
                  <button onClick={() => void deleteUser(user.id)}><Trash2 size={16} /></button>
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Organizaciones">
        <div className="package-grid">
          {overview.organizations.map((organization) => (
            <article key={organization.id}>
              <strong>{organization.messageCredits}</strong>
              <span>{organization.name}</span>
              <small>{organization.planType || "Gratis"} · {organization.freeMessagesGranted ? "100 tokens entregados" : "Sin tokens iniciales"}</small>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function formatCop(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(value);
}

function Metrics({ conversations, contacts, messages }: { conversations: Conversation[]; contacts: Contact[]; messages: Message[] }) {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(today.getDate() - 29);
  const [from, setFrom] = useState(toDateInput(defaultFrom));
  const [to, setTo] = useState(toDateInput(today));
  const [preset, setPreset] = useState("30");
  const data = useMemo(() => buildActualMetrics(from, to, conversations, contacts, messages), [from, to, conversations, contacts, messages]);
  const totals = data.reduce(
    (acc, item) => ({
      conversations: acc.conversations + item.conversations,
      leads: acc.leads + item.leads,
      ai: acc.ai + item.ai,
      human: acc.human + item.human
    }),
    { conversations: 0, leads: 0, ai: 0, human: 0 }
  );
  const averageAi = data.length ? Math.round(data.reduce((sum, item) => sum + item.aiRate, 0) / data.length) : 0;

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setPreset(String(days));
    setFrom(toDateInput(start));
    setTo(toDateInput(end));
  }

  return (
    <div className="metrics-view">
      <Panel title="Histórico de métricas" className="metrics-main">
        <div className="metrics-toolbar">
          <div className="range-buttons">
            {[7, 14, 30, 90].map((days) => (
              <button key={days} className={preset === String(days) ? "active" : ""} onClick={() => applyPreset(days)}>
                {days} días
              </button>
            ))}
          </div>
          <div className="date-filters">
            <Field label="Desde"><input type="date" value={from} onChange={(event) => { setPreset("custom"); setFrom(event.target.value); }} /></Field>
            <Field label="Hasta"><input type="date" value={to} onChange={(event) => { setPreset("custom"); setTo(event.target.value); }} /></Field>
          </div>
        </div>
        <div className="metric-summary-row">
          <MetricCard icon={MessageCircle} label="Conversaciones" value={totals.conversations} delta="datos reales" />
          <MetricCard icon={Users} label="Leads nuevos" value={totals.leads} delta="datos reales" />
          <MetricCard icon={Bot} label="Respuestas IA" value={totals.ai} delta={`${averageAi}% promedio`} />
          <MetricCard icon={Users} label="Respuestas humanas" value={totals.human} delta="asistidas" />
        </div>
        <ResponsiveContainer width="100%" height={330}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="metricConversations" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#25d366" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#25d366" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="metricLeads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2687ff" stopOpacity={0.36} />
                <stop offset="95%" stopColor="#2687ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" stroke="#7f8b95" interval="preserveStartEnd" />
            <YAxis stroke="#7f8b95" />
            <Tooltip contentStyle={{ background: "#101c1d", border: "1px solid #243534", color: "#fff" }} />
            <Area type="monotone" dataKey="conversations" name="Conversaciones" stroke="#58e34f" fill="url(#metricConversations)" strokeWidth={3} />
            <Area type="monotone" dataKey="leads" name="Leads" stroke="#2687ff" fill="url(#metricLeads)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Detalle por día">
        <div className="metrics-table">
          <div><span>Fecha</span><span>Conv.</span><span>Leads</span><span>IA</span><span>Humanas</span></div>
          {data.slice(-12).reverse().map((item) => (
            <div key={item.date}>
              <span>{item.label}</span>
              <b>{item.conversations}</b>
              <b>{item.leads}</b>
              <b>{item.ai}</b>
              <b>{item.human}</b>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildActualMetrics(from: string, to: string, conversations: Conversation[], contacts: Contact[], messages: Message[]) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const days = Math.min(180, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dayKey = toDateInput(date);
    const dayConversations = conversations.filter((conversation) => toDateInput(new Date(conversation.lastMessageAt)) === dayKey).length;
    const leads = contacts.filter((contact) => toDateInput(new Date(contact.lastMessageAt)) === dayKey).length;
    const ai = messages.filter((message) => message.sender === "assistant" && toDateInput(new Date(message.timestamp)) === dayKey).length;
    const human = messages.filter((message) => message.sender === "human" && toDateInput(new Date(message.timestamp)) === dayKey).length;
    return {
      date: toDateInput(date),
      label: date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
      conversations: dayConversations,
      leads,
      ai,
      human,
      aiRate: dayConversations ? Math.round((ai / dayConversations) * 100) : 0
    };
  });
}

function MetricCard({ icon: Icon, label, value, delta }: { icon: typeof MessageCircle; label: string; value: number | string; delta: string }) {
  return <div className="metric-card"><div className="metric-icon"><Icon size={32} /></div><span>{label}</span><strong>{value}</strong><small>{delta}</small></div>;
}

function Panel({ title, action, className = "", children }: { title: string; action?: string; className?: string; children: React.ReactNode }) {
  return <section className={`panel ${className}`}><div className="panel-title"><h2>{title}</h2>{action && <button>{action}</button>}</div>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Stepper({ value, onChange, suffix }: { value: number; onChange: (value: number) => void; suffix: string }) {
  return <div className="stepper"><button onClick={() => onChange(Math.max(0, value - 5))}>-</button><strong>{value} {suffix}</strong><button onClick={() => onChange(value + 5)}>+</button></div>;
}

function ActivityList({ contacts }: { contacts: Contact[] }) {
  if (!contacts.length) return <p className="muted-text">Aun no hay actividad real.</p>;
  const icons = [MessageCircle, Tags, Flame, Check, Bot];
  return <div className="activity-list">{contacts.slice(0, 5).map((contact, index) => {
    const Icon = icons[index] || Activity;
    return (
      <div key={contact.id}>
        <span className={`activity-icon tone-${index + 1}`}><Icon size={18} /></span>
        <span><strong>{index === 0 ? "Nuevo lead recibido" : "Actividad actualizada"}</strong>{contact.name} - {contact.status}</span>
        <small>Reciente</small>
      </div>
    );
  })}</div>;
}
