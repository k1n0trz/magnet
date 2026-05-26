import { describe, expect, it } from "vitest";
import { createWhatsAppHandler } from "../handlers/whatsapp";
import { createInstagramHandler } from "../handlers/instagram";
import { createMessengerHandler } from "../handlers/messenger";
import { createWordPressHandler } from "../handlers/wordpress";

describe("Channel Handlers", () => {
  describe("WhatsApp Handler", () => {
    const handler = createWhatsAppHandler();

    it("validates webhook with correct token", () => {
      const req = {
        query: {
          "hub.mode": "subscribe",
          "hub.verify_token": "test-token",
          "hub.challenge": "test-challenge"
        },
        body: {}
      };
      const settings = {
        channel: "whatsapp" as const,
        enabled: true,
        webhookUrl: "http://localhost:4000/api/webhooks/1/whatsapp",
        webhookSecret: "secret",
        verifyToken: "test-token",
        credentials: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = handler.validateWebhook(req, settings);
      expect(result).toBe("test-challenge");
    });

    it("rejects webhook with incorrect token", () => {
      const req = {
        query: {
          "hub.mode": "subscribe",
          "hub.verify_token": "wrong-token",
          "hub.challenge": "test-challenge"
        },
        body: {}
      };
      const settings = {
        channel: "whatsapp" as const,
        enabled: true,
        webhookUrl: "http://localhost:4000/api/webhooks/1/whatsapp",
        webhookSecret: "secret",
        verifyToken: "test-token",
        credentials: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = handler.validateWebhook(req, settings);
      expect(result).toBe(false);
    });

    it("parses WhatsApp inbound messages", () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              contacts: [{ profile: { name: "Juan" } }],
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
      };

      const messages = handler.parseInbound(payload);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        messageId: "wamid.1",
        from: "573001112233",
        profileName: "Juan",
        text: "Hola, quiero comprar",
        type: "text"
      });
    });

    it("parses Click-to-WhatsApp referral metadata and audio media ids", () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              contacts: [{ profile: { name: "Sara" } }],
              messages: [{
                id: "wamid.audio",
                from: "573022281038",
                timestamp: "1735689600",
                type: "audio",
                audio: { id: "media-audio-123", mime_type: "audio/ogg; codecs=opus", voice: true },
                referral: {
                  source_type: "ad",
                  source_id: "238555123",
                  source_url: "https://fb.me/ad/238555123",
                  headline: "Anuncio de Instagram",
                  body: "Rellena el formulario para registrarte.",
                  media_type: "image",
                  image_url: "https://example.com/ad.jpg"
                }
              }]
            }
          }]
        }]
      };

      const messages = handler.parseInbound(payload);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        messageId: "wamid.audio",
        from: "573022281038",
        profileName: "Sara",
        type: "audio",
        mediaId: "media-audio-123",
        mediaMimeType: "audio/ogg; codecs=opus",
        referral: {
          sourceType: "ad",
          sourceId: "238555123",
          sourceUrl: "https://fb.me/ad/238555123",
          headline: "Anuncio de Instagram",
          body: "Rellena el formulario para registrarte.",
          mediaType: "image",
          imageUrl: "https://example.com/ad.jpg"
        }
      });
    });

    it("returns error when credentials are missing", async () => {
      const settings = {
        channel: "whatsapp" as const,
        enabled: true,
        webhookUrl: "http://localhost:4000/api/webhooks/1/whatsapp",
        webhookSecret: "secret",
        verifyToken: "test-token",
        credentials: {
          permanentAccessTokenEncrypted: "", // Empty in test
          phoneNumberId: "123456789"
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = await handler.sendMessage(settings, "573001112233", "Hola!");
      expect(result.error).toBeDefined();
      expect(result.messageId).toBe("");
    });
  });

  describe("Instagram Handler", () => {
    const handler = createInstagramHandler();

    it("validates webhook with correct token", () => {
      const req = {
        query: {
          "hub.mode": "subscribe",
          "hub.verify_token": "ig-token",
          "hub.challenge": "ig-challenge"
        },
        body: {}
      };
      const settings = {
        channel: "instagram" as const,
        enabled: true,
        webhookUrl: "http://localhost:4000/api/webhooks/1/instagram",
        webhookSecret: "secret",
        verifyToken: "ig-token",
        credentials: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = handler.validateWebhook(req, settings);
      expect(result).toBe("ig-challenge");
    });

    it("parses Instagram DM messages", () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: "ig-msg-123",
                from: { id: "ig-user-456", name: "María" },
                timestamp: "1735689600",
                type: "text",
                message: "¿Tienen stock?"
              }]
            }
          }]
        }]
      };

      const messages = handler.parseInbound(payload);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        messageId: "ig-msg-123",
        from: "ig-user-456",
        profileName: "María",
        text: "¿Tienen stock?",
        type: "text"
      });
    });

    it("parses Instagram messaging webhook events", () => {
      const payload = {
        entry: [{
          messaging: [{
            sender: { id: "igscoped-456" },
            recipient: { id: "17841400000000000" },
            timestamp: 1735689600000,
            message: {
              mid: "ig-mid-123",
              text: "Hola desde Instagram"
            }
          }]
        }]
      };

      const messages = handler.parseInbound(payload);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        messageId: "ig-mid-123",
        from: "igscoped-456",
        text: "Hola desde Instagram",
        type: "text"
      });
      expect(messages[0].timestamp).toBe(1735689600);
    });

    it("returns error when token is missing", async () => {
      const settings = {
        channel: "instagram" as const,
        enabled: true,
        webhookUrl: "http://localhost:4000/api/webhooks/1/instagram",
        webhookSecret: "secret",
        verifyToken: "ig-token",
        credentials: { permanentAccessTokenEncrypted: "" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = await handler.sendMessage(settings, "ig-user-456", "¡Sí, tenemos!");
      expect(result.error).toBeDefined();
      expect(result.messageId).toBe("");
    });
  });

  describe("Messenger Handler", () => {
    const handler = createMessengerHandler();

    it("parses Messenger messages", () => {
      const payload = {
        entry: [{
          messaging: [{
            sender: { id: "user-789" },
            message: {
              mid: "msg-789",
              text: "¿Cuánto cuesta?"
            }
          }]
        }]
      };

      const messages = handler.parseInbound(payload);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        messageId: "msg-789",
        from: "user-789",
        text: "¿Cuánto cuesta?"
      });
    });

    it("ignores non-message events", () => {
      const payload = {
        entry: [{
          messaging: [
            { sender: { id: "user-789" }, delivery: { mids: ["msg-789"] } },
            { sender: { id: "user-789" }, read: { watermark: 1000 } }
          ]
        }]
      };

      const messages = handler.parseInbound(payload);
      expect(messages).toHaveLength(0);
    });
  });

  describe("WordPress Handler", () => {
    const handler = createWordPressHandler();

    it("validates webhook with correct HMAC signature", () => {
      const secret = "test-secret";
      const body = { name: "Juan", email: "juan@example.com", message: "Contacto" };
      const crypto = require("crypto");
      const signature = "sha256=" + crypto.createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");

      const req = {
        headers: { "x-magnet-signature": signature },
        query: {},
        body
      };

      const settings = {
        channel: "wordpress" as const,
        enabled: true,
        webhookUrl: "http://localhost:4000/api/webhooks/1/wordpress",
        webhookSecret: secret,
        verifyToken: "wp-token",
        credentials: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = handler.validateWebhook(req, settings);
      expect(result).toBe(true);
    });

    it("rejects webhook with incorrect signature", () => {
      const req = {
        headers: { "x-magnet-signature": "sha256=wrong" },
        query: {},
        body: { name: "Juan" }
      };

      const settings = {
        channel: "wordpress" as const,
        enabled: true,
        webhookUrl: "http://localhost:4000/api/webhooks/1/wordpress",
        webhookSecret: "test-secret",
        verifyToken: "wp-token",
        credentials: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = handler.validateWebhook(req, settings);
      expect(result).toBe(false);
    });

    it("parses WordPress form submissions", () => {
      const payload = {
        source: "contact_form_7",
        form_id: "123",
        name: "Juan David",
        email: "juan@example.com",
        message: "Quisiera información sobre precios",
        timestamp: Date.now()
      };

      const messages = handler.parseInbound(payload);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        from: "juan@example.com",
        profileName: "Juan David",
        text: "Quisiera información sobre precios",
        type: "text"
      });
    });
  });
});
