import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { createMemoryStore } from "../store/memoryStore";

describe("auth and billing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers a user with 100 free messages", async () => {
    const app = createApp({ store: createMemoryStore(false) });
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Ana Cliente",
        email: "ana@example.com",
        password: "password-seguro",
        organizationName: "Ana Store"
      });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.organization.messageCredits).toBe(100);
    expect(response.body.organization.freeMessagesGranted).toBe(true);
  });

  it("logs in registered users and exposes their credit ledger", async () => {
    const app = createApp({ store: createMemoryStore(false) });
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana Cliente", email: "ana@example.com", password: "password-seguro" });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "ana@example.com", password: "password-seguro" });

    const me = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${login.body.token}`);

    expect(login.status).toBe(200);
    expect(me.status).toBe(200);
    expect(me.body.ledger[0].amount).toBe(100);
  });

  it("publishes conversation packages with USD launch prices", async () => {
    const app = createApp({ store: createMemoryStore(false) });
    const response = await request(app).get("/api/billing/packages");

    expect(response.status).toBe(200);
    expect(response.body.mercadoPagoConfigured).toBe(false);
    expect(response.body.packages.map((item: { messages: number }) => item.messages)).toEqual([500, 1000, 2000]);
    expect(response.body.packages.map((item: { priceUsd: number }) => item.priceUsd)).toEqual([20, 35, 60]);
    expect(response.body.packages[0].priceCop).toBe(80000);
  });

  it("requires Mercado Pago configuration before checkout", async () => {
    const app = createApp({ store: createMemoryStore(false) });
    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana Cliente", email: "ana@example.com", password: "password-seguro" });

    const response = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${register.body.token}`)
      .send({ packageId: "conversations-500" });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain("Mercado Pago");
  });

  it("creates a Mercado Pago preference for the selected conversation package", async () => {
    vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "APP_USR-test-token");
    vi.stubEnv("APP_BASE_URL", "https://app.magnetcloud.app");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "pref-123",
        init_point: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-123",
        sandbox_init_point: "https://sandbox.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-123"
      })
    } as Response);

    const app = createApp({ store: createMemoryStore(false) });
    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana Cliente", email: "ana@example.com", password: "password-seguro" });

    const response = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${register.body.token}`)
      .send({ packageId: "conversations-500" });

    const [, preferenceInit] = vi.mocked(fetch).mock.calls[0];
    const preferenceBody = JSON.parse(String(preferenceInit?.body));
    expect(response.status).toBe(201);
    expect(response.body.initPoint).toContain("mercadopago.com.co");
    expect(preferenceBody.items[0]).toMatchObject({
      id: "conversations-500",
      title: "MAGNET - 500 conversaciones",
      currency_id: "COP",
      unit_price: 80000
    });
    expect(preferenceBody.notification_url).toBe("https://app.magnetcloud.app/api/billing/mercadopago/webhook");
  });

  it("credits an approved Mercado Pago payment only once", async () => {
    vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "APP_USR-test-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 987654321,
        status: "approved",
        external_reference: JSON.stringify({
          organizationId: "org-mp",
          userId: "user-mp",
          packageId: "conversations-500"
        })
      })
    } as Response);

    const store = createMemoryStore(false);
    await store.createOrganization({
      id: "org-mp",
      name: "Ana Store",
      ownerUserId: "user-mp",
      messageCredits: 10,
      freeMessagesGranted: true,
      planType: "Gratis"
    });
    const app = createApp({ store });

    const first = await request(app)
      .post("/api/billing/mercadopago/webhook")
      .send({ type: "payment", data: { id: "987654321" } });
    const retry = await request(app)
      .post("/api/billing/mercadopago/webhook")
      .send({ type: "payment", data: { id: "987654321" } });

    const organization = await store.getOrganization("org-mp");
    const ledger = await store.listCreditLedger("org-mp");
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(organization?.messageCredits).toBe(510);
    expect(ledger.filter((entry) => entry.type === "purchase")).toHaveLength(1);
    expect(ledger[0].metadata.paymentId).toBe("987654321");
  });

  it("protects admin overview from normal users", async () => {
    const app = createApp({ store: createMemoryStore(false) });
    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana Cliente", email: "ana@example.com", password: "password-seguro" });

    const response = await request(app)
      .get("/api/admin/overview")
      .set("Authorization", `Bearer ${register.body.token}`);

    expect(response.status).toBe(403);
  });

  it("does not expose bootstrap data without a valid session", async () => {
    const app = createApp({ store: createMemoryStore(true) });

    const response = await request(app).get("/api/bootstrap");

    expect(response.status).toBe(401);
  });

  it("keeps marketing /app routes off the public domain", async () => {
    const app = createApp({ store: createMemoryStore(false) });

    const response = await request(app)
      .get("/app/chat")
      .set("Host", "magnetcloud.app");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://app.magnetcloud.app/chat");
  });

  it("updates the authenticated user's profile phone", async () => {
    const app = createApp({ store: createMemoryStore(false) });
    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana Cliente", email: "ana@example.com", password: "password-seguro" });

    const response = await request(app)
      .patch("/api/me")
      .set("Authorization", `Bearer ${register.body.token}`)
      .send({
        phone: "573226898323",
        companyName: "Ana Store",
        taxId: "900123456-7",
        theme: "light"
      });

    expect(response.status).toBe(200);
    expect(response.body.user.phone).toBe("573226898323");
    expect(response.body.user.companyName).toBe("Ana Store");
    expect(response.body.user.taxId).toBe("900123456-7");
    expect(response.body.user.theme).toBe("light");
  });

  it("updates contact and conversation status and tags from the CRM API", async () => {
    const store = createMemoryStore(false);
    const app = createApp({ store });
    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana Cliente", email: "ana@example.com", password: "password-seguro" });
    const assistant = await store.createAssistant({
      organizationId: register.body.user.organizationId,
      name: "Ventas",
      countryCode: "CO +57",
      phone: "3010000000"
    });
    const contact = await store.upsertContact({ assistantId: assistant.id, phone: "573001112233", name: "Juan" });
    const conversation = await store.upsertConversation({ assistantId: assistant.id, contactId: contact.id });

    const response = await request(app)
      .patch(`/api/assistants/${assistant.id}/conversations/${conversation.id}`)
      .set("Authorization", `Bearer ${register.body.token}`)
      .send({ status: "Calificado", tags: ["cliente_caliente", "brief_completo"] });

    const [updatedContact] = await store.listContacts(assistant.id);
    const [updatedConversation] = await store.listConversations(assistant.id);
    expect(response.status).toBe(200);
    expect(updatedContact.status).toBe("Calificado");
    expect(updatedContact.tags).toEqual(["cliente_caliente", "brief_completo"]);
    expect(updatedConversation.status).toBe("Calificado");
    expect(updatedConversation.tags).toEqual(["cliente_caliente", "brief_completo"]);
  });

  it("exports contacts using the current filters", async () => {
    const store = createMemoryStore(false);
    const app = createApp({ store });
    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana Cliente", email: "ana@example.com", password: "password-seguro" });
    const assistant = await store.createAssistant({
      organizationId: register.body.user.organizationId,
      name: "Ventas",
      countryCode: "CO +57",
      phone: "3010000000"
    });
    await store.upsertContact({
      assistantId: assistant.id,
      name: "Juan Caliente",
      phone: "573001112233",
      tags: ["cliente_caliente"],
      status: "Calificado",
      lastMessageAt: "2026-05-20T12:00:00.000Z"
    });
    await store.upsertContact({
      assistantId: assistant.id,
      name: "Maria Fria",
      phone: "573004445566",
      tags: ["frio"],
      status: "Nuevo",
      lastMessageAt: "2026-05-22T12:00:00.000Z"
    });

    const response = await request(app)
      .get(`/api/assistants/${assistant.id}/contacts/export`)
      .query({ tag: "cliente_caliente", from: "2026-05-19", to: "2026-05-21" })
      .set("Authorization", `Bearer ${register.body.token}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers["content-disposition"]).toContain(".xlsx");
    expect(Number(response.headers["content-length"])).toBeGreaterThan(500);
  });

  it("rejects WhatsApp settings when Meta cannot access the phone number", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: "Unsupported get request",
          code: 100,
          error_subcode: 33,
          fbtrace_id: "trace-id"
        }
      })
    } as Response);

    const store = createMemoryStore(false);
    const app = createApp({ store });
    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Nuevo User", email: "nuevo@example.com", password: "password-seguro" });
    const assistant = await store.createAssistant({
      organizationId: register.body.user.organizationId,
      name: "Ventas",
      countryCode: "CO +57",
      phone: "3010000000"
    });

    const response = await request(app)
      .patch(`/api/assistants/${assistant.id}`)
      .set("Authorization", `Bearer ${register.body.token}`)
      .send({
        channels: {
          whatsapp: {
            ...assistant.channels.whatsapp,
            enabled: true,
            credentials: {
              permanentAccessTokenEncrypted: "EAAX-token",
              phoneNumberId: "1092552667278358"
            }
          }
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("No se pudo validar WhatsApp con Meta");
    expect(response.body.error).toContain("Unsupported get request");
  });

  it("keeps temporarily unavailable channels blocked from assistant settings", async () => {
    const store = createMemoryStore(false);
    const app = createApp({ store });
    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Nuevo User", email: "nuevo@example.com", password: "password-seguro" });
    const assistant = await store.createAssistant({
      organizationId: register.body.user.organizationId,
      name: "Ventas",
      countryCode: "CO +57",
      phone: "3010000000"
    });

    const response = await request(app)
      .patch(`/api/assistants/${assistant.id}`)
      .set("Authorization", `Bearer ${register.body.token}`)
      .send({
        channels: {
          messenger: {
            ...assistant.channels.messenger,
            enabled: true
          }
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Disponible próximamente");
  });
});
