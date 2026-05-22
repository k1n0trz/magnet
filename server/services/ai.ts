import type { Assistant, Message, ProductService, Trigger } from "../types";

interface GenerateArgs {
  assistant: Assistant;
  inboundText: string;
  history: Message[];
  triggers: Trigger[];
  products?: ProductService[];
}

export async function generateAssistantReply({ assistant, inboundText, history, triggers, products = [] }: GenerateArgs) {
  const activeTriggers = triggers.filter((trigger) => trigger.active);
  const normalizedText = inboundText.toLowerCase();
  const triggerHint = activeTriggers.find((trigger) => {
    const terms = [trigger.name.split("_")[0], ...trigger.conditions].map((term) => term.toLowerCase());
    return terms.some((term) => normalizedText.includes(term));
  });
  const provider = assistant.ai.modelProvider;

  if (provider !== "local") {
    const remote = await tryRemoteProvider(assistant, inboundText, history, products);
    if (remote) return remote;
  }

  const lastUserIntent = inboundText.length > 110 ? `${inboundText.slice(0, 107)}...` : inboundText;
  const triggerLine = triggerHint ? ` Detecte el disparador ${triggerHint.name}; voy a ayudarte con ese paso.` : "";
  const productHint = findRelevantProduct(inboundText, products);
  const productLine = productHint
    ? ` Tenemos en cuenta ${productHint.name}${productHint.price ? ` (${productHint.currency} ${productHint.price})` : ""}: ${productHint.description.slice(0, 140)}.`
    : products.length
      ? ` Puedo orientarte sobre ${products.slice(0, 3).map((product) => product.name).join(", ")}.`
      : "";
  return `Hola, gracias por escribir a ${assistant.name}. Entiendo: "${lastUserIntent}".${triggerLine}${productLine} Me confirmas tu nombre y el producto o servicio que te interesa para avanzar?`;
}

async function tryRemoteProvider(assistant: Assistant, inboundText: string, history: Message[], products: ProductService[]) {
  const apiKey = providerKey(assistant.ai.modelProvider);
  if (!apiKey) return "";
  const context = history.slice(-8).map((message) => `${message.sender}: ${message.text}`).join("\n");

  if (assistant.ai.modelProvider === "openai") {
    const productContext = products.length
      ? `\nProductos y servicios disponibles:\n${products.map((product) => `- ${product.name}: ${product.description}${product.price ? ` Precio: ${product.currency} ${product.price}` : ""}`).join("\n")}`
      : "";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: assistant.ai.modelName || "gpt-4o-mini",
        temperature: assistant.ai.temperature,
        max_tokens: assistant.ai.maxTokens,
        messages: [
          { role: "system", content: `${assistant.prompt}\n${assistant.ai.systemRules}${productContext}` },
          { role: "user", content: `${context}\nCliente: ${inboundText}` }
        ]
      })
    });
    if (!response.ok) return "";
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || "";
  }

  return "";
}

function findRelevantProduct(inboundText: string, products: ProductService[]) {
  const normalized = inboundText.toLowerCase();
  return products.find((product) => {
    const words = product.name.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
    return words.some((word) => normalized.includes(word));
  });
}

function providerKey(provider: Assistant["ai"]["modelProvider"]) {
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY;
  if (provider === "deepinfra") return process.env.DEEPINFRA_API_KEY;
  return "";
}
