import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAssistant } from "../store/memoryStore";
import { sendWhatsAppAudio, transcribeWhatsAppAudio } from "../services/audio";

describe("audio service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AUDIO_PROVIDER;
    delete process.env.DEEPINFRA_API_KEY;
    delete process.env.DEEPINFRA_STT_MODEL;
    delete process.env.DEEPINFRA_TTS_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MAGNET_SEND_REAL_WHATSAPP;
  });

  it("transcribes WhatsApp media with OpenAI", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const assistant = buildAssistant({
      name: "Ventas",
      channels: {
        whatsapp: {
          credentials: {
            permanentAccessTokenEncrypted: "EAAX-token",
            phoneNumberId: "1092552667278358"
          }
        }
      } as any
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://lookaside.whatsapp.net/audio", mime_type: "audio/ogg" })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        headers: new Headers({ "content-type": "audio/ogg" })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Hola, quiero más información" })
      } as Response);

    const text = await transcribeWhatsAppAudio(assistant.channels.whatsapp, "media-123");

    expect(text).toBe("Hola, quiero más información");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer openai-key" })
      })
    );
  });

  it("sends generated OpenAI speech through WhatsApp media upload", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.MAGNET_SEND_REAL_WHATSAPP = "true";
    const assistant = buildAssistant({
      name: "Ventas",
      channels: {
        whatsapp: {
          credentials: {
            permanentAccessTokenEncrypted: "EAAX-token",
            phoneNumberId: "1092552667278358"
          }
        }
      } as any
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "media-uploaded" })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: "wamid.audio.reply" }] })
      } as Response);

    const sent = await sendWhatsAppAudio(assistant, "573001112233", "Hola, te ayudo con gusto.");

    expect(sent.messageId).toBe("wamid.audio.reply");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("transcribes WhatsApp media with DeepInfra when configured", async () => {
    process.env.AUDIO_PROVIDER = "deepinfra";
    process.env.DEEPINFRA_API_KEY = "deepinfra-key";
    const assistant = buildAssistant({
      name: "Ventas",
      channels: {
        whatsapp: {
          credentials: {
            permanentAccessTokenEncrypted: "EAAX-token",
            phoneNumberId: "1092552667278358"
          }
        }
      } as any
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://lookaside.whatsapp.net/audio", mime_type: "audio/ogg" })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        headers: new Headers({ "content-type": "audio/ogg" })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Hola desde DeepInfra" })
      } as Response);

    const text = await transcribeWhatsAppAudio(assistant.channels.whatsapp, "media-123");

    expect(text).toBe("Hola desde DeepInfra");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.deepinfra.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer deepinfra-key" })
      })
    );
  });

  it("sends generated DeepInfra speech through WhatsApp media upload", async () => {
    process.env.AUDIO_PROVIDER = "deepinfra";
    process.env.DEEPINFRA_API_KEY = "deepinfra-key";
    process.env.MAGNET_SEND_REAL_WHATSAPP = "true";
    const assistant = buildAssistant({
      name: "Ventas",
      ai: { voice: "nova", voiceSpeed: 1.1 } as any,
      channels: {
        whatsapp: {
          credentials: {
            permanentAccessTokenEncrypted: "EAAX-token",
            phoneNumberId: "1092552667278358"
          }
        }
      } as any
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "media-uploaded" })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: "wamid.deepinfra.audio.reply" }] })
      } as Response);

    const sent = await sendWhatsAppAudio(assistant, "573001112233", "Hola, te ayudo con gusto.");

    expect(sent.messageId).toBe("wamid.deepinfra.audio.reply");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.deepinfra.com/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer deepinfra-key" })
      })
    );
  });
});
