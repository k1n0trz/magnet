import request from "supertest";
import { describe, expect, it } from "vitest";
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
});
