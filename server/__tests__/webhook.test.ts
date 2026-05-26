import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { createMemoryStore } from "../store/memoryStore";

describe("WhatsApp webhook", () => {
  it("returns Meta challenge when verify token matches the assistant", async () => {
    const store = createMemoryStore(true);
    const assistant = await store.createAssistant({
      name: "Seller Comfama",
      countryCode: "CO +57",
      phone: "3138851960"
    });

    const app = createApp({ store });
    const response = await request(app)
      .get(`/api/whatsapp/webhook/${assistant.id}`)
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": assistant.channels.whatsapp.verifyToken,
        "hub.challenge": "magnet-challenge"
      });

    expect(response.status).toBe(200);
    expect(response.text).toBe("magnet-challenge");
  });

  it("returns Meta challenge from the unified webhook without a channel suffix", async () => {
    const store = createMemoryStore(true);
    const assistant = await store.createAssistant({
      name: "Seller Comfama",
      countryCode: "CO +57",
      phone: "3138851960"
    });

    const app = createApp({ store });
    const response = await request(app)
      .get(`/api/webhooks/${assistant.id}`)
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": assistant.channels.whatsapp.verifyToken,
        "hub.challenge": "magnet-challenge"
      });

    expect(response.status).toBe(200);
    expect(response.text).toBe("magnet-challenge");
  });

  it("does not serve the SPA for unknown API routes", async () => {
    const app = createApp({ store: createMemoryStore(false) });
    const response = await request(app).get("/api/webhooks/missing-route");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Assistant not found");
  });

  it("stores inbound messages and generates an outbound assistant response", async () => {
    const store = createMemoryStore(true);
    const assistant = await store.createAssistant({
      name: "Seller Comfama",
      countryCode: "CO +57",
      phone: "3138851960"
    });

    const app = createApp({ store });
    const response = await request(app)
      .post(`/api/whatsapp/webhook/${assistant.id}`)
      .send({
        entry: [{
          changes: [{
            value: {
              contacts: [{ profile: { name: "Juan David" }, wa_id: "573001112233" }],
              messages: [{
                id: "wamid.1",
                from: "573001112233",
                timestamp: "1735689600",
                type: "text",
                text: { body: "Hola, quiero comprar" }
              }]
            }
          }]
        }]
      });

    const messages = await store.listMessages(assistant.id);
    expect(response.status).toBe(200);
    expect(messages.some((message) => message.direction === "inbound")).toBe(true);
    expect(messages.some((message) => message.direction === "outbound")).toBe(true);
  });

  it("updates outbound message delivery status from Meta webhooks", async () => {
    const store = createMemoryStore(true);
    const assistant = await store.createAssistant({
      name: "Seller Comfama",
      countryCode: "CO +57",
      phone: "3138851960"
    });
    const contact = await store.upsertContact({ assistantId: assistant.id, phone: "573001112233", name: "Juan" });
    const conversation = await store.upsertConversation({ assistantId: assistant.id, contactId: contact.id });
    await store.addMessage({
      assistantId: assistant.id,
      conversationId: conversation.id,
      contactId: contact.id,
      direction: "outbound",
      sender: "assistant",
      type: "text",
      text: "Hola",
      mediaUrl: "",
      channel: "whatsapp",
      channelMessageId: "wamid.out",
      status: "sent",
      timestamp: new Date().toISOString()
    });

    const app = createApp({ store });
    const response = await request(app)
      .post(`/api/webhooks/${assistant.id}`)
      .send({
        entry: [{
          changes: [{
            value: {
              statuses: [{ id: "wamid.out", status: "read", timestamp: "1735689601" }]
            }
          }]
        }]
      });

    const messages = await store.listMessages(assistant.id);
    expect(response.status).toBe(200);
    expect(messages.find((message) => message.channelMessageId === "wamid.out")?.status).toBe("read");
  });

  it("charges one conversation credit only when the conversation is first created", async () => {
    const store = createMemoryStore(false);
    const organization = await store.createOrganization({
      name: "Trafficker Kino",
      ownerUserId: "",
      messageCredits: 2,
      freeMessagesGranted: true,
      planType: "Gratis"
    });
    const assistant = await store.createAssistant({
      organizationId: organization.id,
      name: "Ventas k1n0",
      countryCode: "CO +57",
      phone: "3014390898"
    });
    const app = createApp({ store });
    const payload = (id: string, body: string) => ({
      entry: [{
        changes: [{
          value: {
            contacts: [{ profile: { name: "Fabio Trujillo" }, wa_id: "573135679932" }],
            messages: [{
              id,
              from: "573135679932",
              timestamp: "1735689600",
              type: "text",
              text: { body }
            }]
          }
        }]
      }]
    });

    const first = await request(app).post(`/api/webhooks/${assistant.id}`).send(payload("wamid.1", "Hola"));
    const second = await request(app).post(`/api/webhooks/${assistant.id}`).send(payload("wamid.2", "Quiero precio"));

    const updatedOrganization = await store.getOrganization(organization.id);
    const ledger = await store.listCreditLedger(organization.id);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(updatedOrganization?.messageCredits).toBe(1);
    expect(ledger.filter((entry) => entry.type === "usage")).toHaveLength(1);
    expect(ledger[0].description).toBe("AI conversation");
  });

  it("stores ad referral metadata on the inbound message and conversation", async () => {
    const store = createMemoryStore(false);
    const organization = await store.createOrganization({
      name: "Trafficker Kino",
      ownerUserId: "",
      messageCredits: 5,
      freeMessagesGranted: true,
      planType: "Gratis"
    });
    const assistant = await store.createAssistant({
      organizationId: organization.id,
      name: "Ventas k1n0",
      countryCode: "CO +57",
      phone: "3014390898"
    });
    const app = createApp({ store });

    const response = await request(app)
      .post(`/api/webhooks/${assistant.id}`)
      .send({
        entry: [{
          changes: [{
            value: {
              contacts: [{ profile: { name: "Sara" }, wa_id: "573022281038" }],
              messages: [{
                id: "wamid.referral",
                from: "573022281038",
                timestamp: "1735689600",
                type: "text",
                text: { body: "Más información" },
                referral: {
                  source_type: "ad",
                  source_id: "238555123",
                  source_url: "https://fb.me/ad/238555123",
                  headline: "Anuncio de Instagram",
                  body: "Rellena el formulario para registrarte."
                }
              }]
            }
          }]
        }]
      });

    const [message] = await store.listMessages(assistant.id);
    const [conversation] = await store.listConversations(assistant.id);
    const [contact] = await store.listContacts(assistant.id);
    expect(response.status).toBe(200);
    expect(message.referral?.headline).toBe("Anuncio de Instagram");
    expect(conversation.referral?.sourceId).toBe("238555123");
    expect(contact.source).toBe("Meta Ads");
  });

  it("emits new-conversation notification events using owner phone and email", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.alert" }] })
    } as Response);
    const store = createMemoryStore(false);
    const organization = await store.createOrganization({
      name: "Trafficker Kino",
      ownerUserId: "",
      messageCredits: 5,
      freeMessagesGranted: true,
      planType: "Gratis"
    });
    const owner = await store.createUser({
      organizationId: organization.id,
      name: "Trafficker Kino",
      email: "trafficker@example.com",
      phone: "573226898323"
    });
    await store.updateOrganization(organization.id, { ownerUserId: owner.id });
    const assistant = await store.createAssistant({
      organizationId: organization.id,
      name: "Ventas k1n0",
      countryCode: "CO +57",
      phone: "3014390898",
      operations: { newConversationAlertsEnabled: true } as any,
      channels: {
        whatsapp: {
          credentials: {
            permanentAccessTokenEncrypted: "EAAX-token",
            phoneNumberId: "1092552667278358"
          }
        }
      } as any
    });

    const app = createApp({ store });
    const response = await request(app)
      .post(`/api/webhooks/${assistant.id}`)
      .send({
        entry: [{
          changes: [{
            value: {
              contacts: [{ profile: { name: "Fabio" } }],
              messages: [{
                id: "wamid.notify",
                from: "573135679932",
                timestamp: "1735689600",
                type: "text",
                text: { body: "Hola" }
              }]
            }
          }]
        }]
      });

    const events = await store.listEvents(assistant.id);
    expect(response.status).toBe(200);
    expect(events.some((event) => event.type === "new_conversation_whatsapp_alert_sent")).toBe(true);
    expect(events.some((event) => event.type === "new_conversation_email_alert_pending")).toBe(true);
  });
});
