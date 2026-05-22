import "dotenv/config";
import { createApp } from "./app";
import { connectMongoStore } from "./store/mongoStore";

const port = Number(process.env.PORT || 4000);
const store = process.env.MONGO_URI ? await connectMongoStore(process.env.MONGO_URI) : undefined;
const app = createApp({
  store,
  runtime: {
    persistence: process.env.MONGO_URI ? "mongo" : "memory",
    realWhatsAppEnabled: process.env.MAGNET_SEND_REAL_WHATSAPP === "true"
  }
});

app.listen(port, () => {
  console.log(`MAGNET API listening on http://127.0.0.1:${port}`);
});
