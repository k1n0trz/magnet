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

  const productHint = findRelevantProduct(inboundText, products);
  const triggerLine = triggerHint ? ` Veo que esto va por ${humanizeTrigger(triggerHint.name)}, asi que te ayudo con ese paso.` : "";

  if (productHint) {
    const price = productHint.price ? ` El valor es ${productHint.currency} ${productHint.price}.` : "";
    return `Claro. ${assistant.name} ofrece ${productHint.name}: ${productHint.description.slice(0, 170)}.${price}${triggerLine} Te cuento mas detalles o prefieres que avancemos con una asesoria?`;
  }

  if (products.length) {
    const names = products.slice(0, 3).map((product) => product.name).join(", ");
    return `Claro, te cuento. En ${assistant.name} podemos ayudarte con ${names}.${triggerLine} Cual de estos servicios te interesa revisar primero?`;
  }

  if (history.length > 2) {
    return `Si, seguimos por aqui. Para ayudarte mejor, cuentame que quieres resolver ahora y avanzamos paso a paso.`;
  }

  return `Hola, gracias por escribir a ${assistant.name}.${triggerLine} Cuentame que necesitas y te ayudo a elegir el siguiente paso.`;
}

async function tryRemoteProvider(assistant: Assistant, inboundText: string, history: Message[], products: ProductService[]) {
  const apiKey = providerKey(assistant.ai.modelProvider);
  if (!apiKey) return "";
  const context = history.slice(-8).map((message) => `${message.sender}: ${message.text}`).join("\n");
  const productContext = products.length
    ? `\nProductos y servicios disponibles:\n${products.map((product) => `- ${product.name}: ${product.description}${product.price ? ` Precio: ${product.currency} ${product.price}` : ""}`).join("\n")}`
    : "";
  const messages = [
    { role: "system", content: `${assistant.prompt}\n${assistant.ai.systemRules}\nResponde como una persona atenta: natural, breve y especifica. No repitas literalmente el mensaje del cliente, no uses plantillas visibles y haz maximo una pregunta clara al final.${productContext}` },
    { role: "user", content: `${context}\nCliente: ${inboundText}` }
  ];

  if (assistant.ai.modelProvider === "openai") {
    return requestChatCompletion({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey,
      model: assistant.ai.modelName || "gpt-4o-mini",
      temperature: assistant.ai.temperature,
      maxTokens: assistant.ai.maxTokens,
      messages
    });
  }

  if (assistant.ai.modelProvider === "deepseek") {
    return requestChatCompletion({
      url: "https://api.deepseek.com/chat/completions",
      apiKey,
      model: assistant.ai.modelName || process.env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: assistant.ai.temperature,
      maxTokens: assistant.ai.maxTokens,
      messages
    });
  }

  return "";
}

async function requestChatCompletion(args: {
  url: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  messages: Array<{ role: string; content: string }>;
}) {
  try {
    const response = await fetch(args.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: args.model,
        temperature: args.temperature,
        max_tokens: args.maxTokens,
        messages: args.messages
      })
    });
    if (!response.ok) return "";
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

function findRelevantProduct(inboundText: string, products: ProductService[]) {
  const normalized = inboundText.toLowerCase();
  return products.find((product) => {
    const words = product.name.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
    return words.some((word) => normalized.includes(word));
  });
}

function humanizeTrigger(name: string) {
  return name.replace(/_/g, " ");
}

function providerKey(provider: Assistant["ai"]["modelProvider"]) {
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY;
  if (provider === "deepinfra") return process.env.DEEPINFRA_API_KEY;
  return "";
}
