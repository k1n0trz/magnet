import type { ChannelHandler, ChannelType, ChannelSettings, ChannelInboundMessage } from "../types";
import { createWhatsAppHandler } from "./whatsapp";
import { createInstagramHandler } from "./instagram";
import { createMessengerHandler } from "./messenger";
import { createWordPressHandler } from "./wordpress";

const CHANNEL_HANDLERS = {
  whatsapp: createWhatsAppHandler(),
  instagram: createInstagramHandler(),
  messenger: createMessengerHandler(),
  wordpress: createWordPressHandler(),
  telegram: {
    validateWebhook: () => false,
    parseInbound: () => [],
    sendMessage: async () => ({ messageId: "", error: "Telegram not implemented yet" })
  } as ChannelHandler,
  sms: {
    validateWebhook: () => false,
    parseInbound: () => [],
    sendMessage: async () => ({ messageId: "", error: "SMS not implemented yet" })
  } as ChannelHandler
};

export function createHandlerRegistry() {
  return {
    get(channel: ChannelType): ChannelHandler {
      const handler = CHANNEL_HANDLERS[channel];
      if (!handler) throw new Error(`Unknown channel: ${channel}`);
      return handler;
    },

    getAll(): Record<ChannelType, ChannelHandler> {
      return CHANNEL_HANDLERS;
    }
  };
}

export type HandlerRegistry = ReturnType<typeof createHandlerRegistry>;
