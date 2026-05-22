import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { apiRouter } from "./routes/api";
import { whatsappRouter } from "./routes/whatsapp";
import { webhooksRouter } from "./routes/webhooks";
import { createMemoryStore } from "./store/memoryStore";
import { createHandlerRegistry } from "./handlers";
import type { Store } from "./types";

interface AppOptions {
  store?: Store;
  runtime?: {
    persistence: "memory" | "mongo";
    realWhatsAppEnabled: boolean;
  };
}

const appHost = process.env.MAGNET_APP_HOST || "app.magnetcloud.app";

function hostnameFromRequest(hostname: string) {
  return hostname.split(":")[0].toLowerCase();
}

function isAllowedAppHost(hostname: string) {
  return hostname === appHost || hostname === "localhost" || hostname === "127.0.0.1";
}

function appRedirectPath(pathname: string) {
  if (pathname === "/app") return "/";
  if (pathname.startsWith("/app/")) return pathname.slice(4) || "/";
  return pathname;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const store = options.store || createMemoryStore(false);
  const handlers = createHandlerRegistry();
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const distDir = path.join(rootDir, "dist");
  const indexHtml = path.join(distDir, "index.html");

  app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  }));
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }));

  app.use((req, res, next) => {
    const hostname = hostnameFromRequest(req.hostname || req.get("host") || "");
    const isAppRoute = req.path === "/app" || req.path.startsWith("/app/");
    const isAuthRoute = req.path === "/login" || req.path === "/register";

    if ((isAppRoute || isAuthRoute) && !isAllowedAppHost(hostname)) {
      res.redirect(302, `https://${appHost}${appRedirectPath(req.path)}`);
      return;
    }

    next();
  });

  app.use("/api", apiRouter(store, options.runtime || {
    persistence: "memory",
    realWhatsAppEnabled: process.env.MAGNET_SEND_REAL_WHATSAPP === "true"
  }));

  // Legacy WhatsApp route (mantener para backward compat)
  app.use("/api/whatsapp", whatsappRouter(store));

  // New unified webhooks route (multi-channel)
  app.use("/api/webhooks", webhooksRouter(store, handlers));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  if (fs.existsSync(indexHtml)) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
