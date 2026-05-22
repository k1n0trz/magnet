import { createApp } from "../server/app";

const app = createApp({
  runtime: {
    persistence: "memory",
    realWhatsAppEnabled: false
  }
});

export default app;
