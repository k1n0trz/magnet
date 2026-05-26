import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAssistantReply } from "../services/ai";
import { buildAssistant } from "../store/memoryStore";

describe("AI service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DEEPSEEK_API_KEY;
  });

  it("uses DeepSeek chat completions when the assistant provider is deepseek", async () => {
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hola Edison, claro. Te ayudo con marketing digital." } }]
      })
    } as Response);
    const assistant = buildAssistant({ name: "Ventas k1n0" });
    assistant.ai = {
      ...assistant.ai,
      modelProvider: "deepseek",
      modelName: "deepseek-chat",
      temperature: 0.7,
      maxTokens: 500
    };

    const reply = await generateAssistantReply({
      assistant,
      inboundText: "Edison, asesoramiento en marketing",
      history: [],
      triggers: []
    });

    expect(reply).toContain("Hola Edison");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-deepseek-key" })
      })
    );
  });

  it("defaults new assistants to DeepSeek when a DeepSeek key exists", () => {
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.DEEPSEEK_MODEL = "deepseek-chat";

    const assistant = buildAssistant({ name: "Ventas k1n0" });

    expect(assistant.ai.modelProvider).toBe("deepseek");
    expect(assistant.ai.modelName).toBe("deepseek-chat");
  });

  it("keeps the local fallback conversational instead of echoing a robotic template", async () => {
    const assistant = buildAssistant({ name: "Luisa Gracia" });
    assistant.ai = {
      ...assistant.ai,
      modelProvider: "local"
    };

    const reply = await generateAssistantReply({
      assistant,
      inboundText: "Que servicios ofreces?",
      history: [],
      triggers: [],
      products: [{
        id: "therapy",
        assistantId: assistant.id,
        name: "Terapia online",
        description: "Sesiones de psicologia online para bienestar emocional y desarrollo personal.",
        imageUrl: "",
        price: "",
        currency: "COP",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]
    });

    expect(reply).toContain("Luisa Gracia");
    expect(reply).toContain("Terapia online");
    expect(reply).not.toContain("Entiendo:");
    expect(reply).not.toContain("Me confirmas tu nombre");
  });
});
