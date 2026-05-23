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

  it("publishes message packages", async () => {
    const app = createApp({ store: createMemoryStore(false) });
    const response = await request(app).get("/api/billing/packages");

    expect(response.status).toBe(200);
    expect(response.body.mercadoPagoConfigured).toBe(false);
    expect(response.body.packages.map((item: { messages: number }) => item.messages)).toEqual([500, 1000, 2000, 5000]);
    expect(response.body.packages[0].priceCop).toBe(29900);
  });

  it("requires Mercado Pago configuration before checkout", async () => {
    const app = createApp({ store: createMemoryStore(false) });
    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana Cliente", email: "ana@example.com", password: "password-seguro" });

    const response = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${register.body.token}`)
      .send({ packageId: "messages-500" });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain("Mercado Pago");
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
});
