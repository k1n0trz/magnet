# MAGNET Architecture

Deep dive into Magnet's multi-channel handler system and how to extend it.

---

## Core Concepts

### 1. Handler Pattern

Every channel is represented by a `ChannelHandler` - a standardized interface:

```typescript
interface ChannelHandler {
  // Validate webhook (security check)
  validateWebhook(
    req: { query: Record<string, string | string[]>; body: unknown },
    settings: ChannelSettings
  ): boolean | string;  // false = invalid, string = challenge response
  
  // Parse inbound message to standard format
  parseInbound(payload: unknown): ChannelInboundMessage[];
  
  // Send message to user
  sendMessage(
    settings: ChannelSettings,
    to: string,
    body: string
  ): Promise<ChannelSendResult>;
}
```

### 2. Channel Types

```typescript
type ChannelType = "whatsapp" | "instagram" | "messenger" | "wordpress" | "telegram" | "sms";
```

### 3. Channel Settings

Per-channel configuration stored in database:

```typescript
interface ChannelSettings {
  channel: ChannelType;              // whatsapp, instagram, etc.
  enabled: boolean;                  // Is this channel active?
  webhookUrl: string;                // Full URL for webhooks
  webhookSecret: string;             // HMAC secret for validation
  verifyToken: string;               // Token for webhook validation
  credentials: Record<string, string>;  // API keys, tokens, etc.
  createdAt: string;
  updatedAt: string;
}
```

### 4. Message Format

All channels parse to this standard format:

```typescript
interface ChannelInboundMessage {
  messageId: string;           // Unique ID from channel
  from: string;                // Sender identifier (phone, ID, etc.)
  profileName?: string;        // Display name
  timestamp: number;           // Unix timestamp
  type: "text" | "audio" | "image" | "document";
  text?: string;               // Message content
  mediaUrl?: string;           // Attachment URL
}
```

---

## Data Flow

```
Webhook Request
  ↓
Router checks: GET /api/webhooks/:assistantId/:channel
  ↓
Look up Assistant + Channel Settings
  ↓
Get Handler from Registry
  ↓
Handler.validateWebhook()
  ├─ Returns string → Send challenge (Meta style)
  ├─ Returns false → Reject (403)
  └─ Returns true → Continue
  ↓
Handler.parseInbound()
  ↓
For each message:
  ├─ upsertContact()      ← Create/update from sender
  ├─ upsertConversation() ← Thread per contact
  ├─ addMessage()         ← Store message
  │
  ├─ [IF botEnabled]
  │  ├─ Load conversation history
  │  ├─ Load triggers
  │  ├─ generateAssistantReply()  ← AI response
  │  ├─ Handler.sendMessage()     ← Send back
  │  └─ addMessage()              ← Log response
  │
  └─ addEvent()           ← Audit log
  ↓
Return 200 OK
```

---

## Adding a New Channel

### Step 1: Define Handler

Create `server/handlers/telegram.ts`:

```typescript
import type { ChannelHandler, ChannelSettings, ChannelInboundMessage, ChannelSendResult } from "../types";
import { decryptSecret } from "../lib/crypto";

export function createTelegramHandler(): ChannelHandler {
  return {
    validateWebhook(req, settings) {
      // Telegram sends webhook secret in X-Telegram-Bot-API-Secret-Token
      const token = req.headers["x-telegram-bot-api-secret-token"] as string;
      const expected = settings.verifyToken;
      
      if (!token || token !== expected) {
        return false;
      }
      
      return true;  // No challenge response needed
    },

    parseInbound(payload) {
      // Telegram payload structure
      const update = payload as any;
      if (!update.message) return [];
      
      const msg = update.message;
      const messages: ChannelInboundMessage[] = [];
      
      // Extract text or caption (for photos/documents)
      const text = msg.text || msg.caption || "";
      
      messages.push({
        messageId: String(msg.message_id),
        from: String(msg.from.id),
        profileName: msg.from.first_name || msg.from.username || "",
        timestamp: msg.date,
        type: msg.photo ? "image" : (msg.document ? "document" : "text"),
        text: text,
        mediaUrl: msg.photo 
          ? `https://api.telegram.org/file/bot${settings.credentials.botToken}/...`
          : ""
      });
      
      return messages;
    },

    async sendMessage(settings, to, body) {
      const botToken = settings.credentials.botToken;
      
      if (!botToken) {
        return { messageId: "", error: "Missing bot token" };
      }
      
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: to,
              text: body,
              parse_mode: "Markdown"
            })
          }
        );
        
        if (!response.ok) {
          return { messageId: "", error: `API error: ${response.status}` };
        }
        
        const data = (await response.json()) as { result?: { message_id: number } };
        return { messageId: String(data.result?.message_id || "") };
      } catch (err) {
        return { messageId: "", error: String(err) };
      }
    }
  };
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}
```

### Step 2: Register Handler

Edit `server/handlers/index.ts`:

```typescript
import { createTelegramHandler } from "./telegram";

export function createHandlerRegistry() {
  const handlers: Record<ChannelType, ChannelHandler> = {
    // ... existing handlers ...
    telegram: createTelegramHandler(),  // ADD THIS
    sms: createPlaceholderHandler()
  };
  
  return {
    get(channel: ChannelType): ChannelHandler {
      const handler = handlers[channel];
      if (!handler) throw new Error(`Unknown channel: ${channel}`);
      return handler;
    },
    // ... rest of implementation
  };
}
```

### Step 3: Add Store Support

Update `server/store/memoryStore.ts` buildChannels():

```typescript
function buildChannels(): Record<ChannelType, ChannelSettings> {
  const baseUrl = "https://magnet-xxx.run.app/api/webhooks";
  const generateToken = () => randomUUID().replace(/-/g, "").slice(0, 32);
  
  return {
    whatsapp: { /* ... */ },
    instagram: { /* ... */ },
    messenger: { /* ... */ },
    wordpress: { /* ... */ },
    telegram: {
      channel: "telegram",
      enabled: false,
      webhookUrl: `${baseUrl}/ASSISTANT_ID/telegram`,
      webhookSecret: generateSecret(),
      verifyToken: generateToken(),
      credentials: {
        botToken: ""  // User will fill this in
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    sms: { /* ... */ }
  };
}
```

### Step 4: Update Types

In `server/types.ts`, the `ChannelType` already includes "telegram":

```typescript
type ChannelType = "whatsapp" | "instagram" | "messenger" | "wordpress" | "telegram" | "sms";
// Already defined - no change needed!
```

### Step 5: Test Handler

Create `server/__tests__/handlers.test.ts` entry:

```typescript
import { createTelegramHandler } from "../handlers/telegram";
import { describe, it, expect } from "vitest";

describe("Telegram Handler", () => {
  const handler = createTelegramHandler();
  
  it("should validate webhook with correct token", () => {
    const settings = {
      verifyToken: "test-token",
      credentials: {}
    } as any;
    
    const result = handler.validateWebhook(
      {
        query: {},
        headers: { "x-telegram-bot-api-secret-token": "test-token" },
        body: {}
      } as any,
      settings
    );
    
    expect(result).toBe(true);
  });
  
  it("should parse Telegram message", () => {
    const payload = {
      message: {
        message_id: 123,
        date: Math.floor(Date.now() / 1000),
        from: { id: 456, first_name: "John" },
        text: "Hello bot"
      }
    };
    
    const messages = handler.parseInbound(payload);
    
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      messageId: "123",
      from: "456",
      text: "Hello bot"
    });
  });
});
```

### Step 6: Update Frontend

In `src/App.tsx`, the `ChannelType` already includes "telegram", so the UI will automatically show it:

```typescript
const channels: Array<{ id: ChannelType; name: string; description: string }> = [
  // ... existing ...
  { id: "telegram", name: "Telegram Bot", description: "Responde mensajes de Telegram" },
  { id: "sms", name: "SMS / Twilio", description: "Próximamente disponible" }
];
```

### Step 7: Document Setup

Create `SETUP_TELEGRAM.md` for users:

```markdown
# Setting up Telegram Bot

1. Create bot with BotFather: @BotFather on Telegram
2. Get bot token: `/newbot` → follow prompts
3. Set webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=...`
4. Add to Magnet: Settings → Chat → Telegram
5. Paste bot token
6. Done!
```

---

## Handler Types Reference

### Meta Handlers (WhatsApp, Instagram, Messenger)

**Validation:**
- Uses Meta webhook challenge pattern
- Returns `hub.challenge` if token matches
- Signature validation on request body

**Payload Structure:**
```typescript
{
  entry: [{
    changes: [{
      value: {
        messages: [{ id, from, timestamp, type, text, ... }],
        contacts: [{ profile: { name } }]
      }
    }]
  }]
}
```

### Custom Handlers (WordPress, Telegram)

**Validation:**
- Direct token comparison or HMAC signature
- No challenge response (returns true/false)

**Payload Structure:**
- Varies by platform
- Parser converts to standard format

---

## Registry Pattern

The `HandlerRegistry` is a factory that manages all handlers:

```typescript
export function createHandlerRegistry() {
  const handlers = { /* all handlers */ };
  
  return {
    get(channel: ChannelType): ChannelHandler {
      // Get handler by channel
    },
    
    async handle(channel, req, res, settings, onMessage) {
      // Unified webhook handler
      // - Validates
      // - Parses
      // - Calls onMessage for each
    }
  };
}
```

**Usage in routes:**

```typescript
// In routes/webhooks.ts
const messages = handler.parseInbound(req.body);
for (const inbound of messages) {
  // Process message
  const sent = await handler.sendMessage(settings, inbound.from, reply);
}
```

---

## Error Handling

Each handler should return errors gracefully:

```typescript
async sendMessage(settings, to, body) {
  try {
    const response = await fetch(...);
    if (!response.ok) {
      return { 
        messageId: "", 
        error: `API error: ${response.status}` 
      };
    }
    return { messageId: "..." };
  } catch (err) {
    return { 
      messageId: "", 
      error: String(err) 
    };
  }
}
```

Errors are logged but don't crash the system - user will retry.

---

## Testing Strategy

### Unit Tests (Handler Logic)

```typescript
describe("CustomChannelHandler", () => {
  const handler = createCustomHandler();
  
  // Test validation
  it("should validate webhook", () => { ... });
  
  // Test parsing
  it("should parse inbound message", () => { ... });
  
  // Test sending
  it("should send message successfully", () => { ... });
  it("should handle API errors", () => { ... });
});
```

### Integration Tests (E2E)

```bash
# Simulate webhook
curl -X POST https://magnet/api/webhooks/ASSISTANT_ID/custom \
  -H "..." \
  -d '{"message": "test"}'

# Verify:
# 1. Contact created
# 2. Conversation created
# 3. Message stored
# 4. AI response sent (if enabled)
# 5. Response message stored
```

### Load Testing

```bash
# Simulate 100 webhooks/sec
ab -n 1000 -c 10 https://magnet/api/webhooks/ASSISTANT_ID/custom
```

---

## Performance Considerations

### Webhook Processing

**Target latency: < 100ms**

```
Parse payload:     ~5ms
Database insert:   ~20ms
AI generation:     ~200ms (async)
Send response:     ~20ms
Total:             ~45-250ms
```

### Optimization Tips

1. **Async AI**: Don't wait for AI response before returning 200 OK
2. **Batch inserts**: Group multiple contacts
3. **Cache settings**: Load channel settings once per request
4. **Index database**: `assistantId`, `contactId`, `conversationId`

---

## Security Best Practices

### 1. Webhook Validation

Always validate:
- Token/signature matches
- Timestamp within reasonable window (prevent replay)
- Channel is enabled
- Assistant exists

### 2. Credential Storage

- Encrypt all API keys (ENCRYPTION_KEY)
- Never log credentials
- Rotate tokens regularly
- Use environment variables for secrets

### 3. Rate Limiting

```typescript
// Express rate limiter
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  keyGenerator: (req) => req.params.assistantId
});

router.post("/webhooks/:assistantId/:channel", limiter, handler);
```

### 4. CORS & Headers

```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

app.use(helmet());  // Security headers
```

---

## Monitoring & Debugging

### Logging

```typescript
// Add structured logging to handlers
console.log(`[${channel}] Webhook received from ${from}`);
console.log(`[${channel}] Parsed ${messages.length} messages`);
console.log(`[${channel}] Sent response to ${to}`);
```

### Metrics to Track

1. Webhooks received (per channel)
2. Messages processed
3. AI responses generated
4. Errors/failures
5. Latency p50/p95/p99

### Cloud Run Logs

```bash
gcloud run logs read magnet --limit 100

# Filter by channel
gcloud run logs read magnet --limit 100 | grep "whatsapp"

# Real-time
gcloud run logs read magnet --tail
```

---

## Example: SMS/Twilio

```typescript
// server/handlers/sms.ts

import { decryptSecret } from "../lib/crypto";

export function createSmsHandler(): ChannelHandler {
  return {
    validateWebhook(req, settings) {
      // Twilio sends auth token in Authorization header
      const token = req.headers.authorization?.split(" ")[1];
      const expected = settings.verifyToken;
      return token === expected;
    },

    parseInbound(payload) {
      const msg = payload as any;
      return [{
        messageId: msg.MessageSid,
        from: msg.From,
        profileName: msg.FromCountry || "",
        timestamp: Math.floor(Date.now() / 1000),
        type: "text",
        text: msg.Body,
        mediaUrl: msg.MediaUrl0 || ""
      }];
    },

    async sendMessage(settings, to, body) {
      const accountSid = settings.credentials.accountSid;
      const authToken = decryptSecret(settings.credentials.authToken);
      const fromNumber = settings.credentials.fromNumber;
      
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            From: fromNumber,
            To: to,
            Body: body
          })
        }
      );
      
      const data = await response.json() as { sid?: string };
      return { messageId: data.sid || "" };
    }
  };
}
```

---

## Extensibility Roadmap

### Short Term (1-2 weeks)
- [ ] Telegram handler
- [ ] SMS/Twilio handler
- [ ] Webhook signature validation helpers

### Medium Term (1 month)
- [ ] Rate limiting per channel
- [ ] Message scheduling
- [ ] Bulk message sending
- [ ] Custom field mapping

### Long Term (Quarter)
- [ ] Custom channel plugin system
- [ ] Channel marketplace
- [ ] Zapier/Make integration
- [ ] Webhook retry logic with exponential backoff

---

## References

- **Express.js:** https://expressjs.com/
- **Meta Webhooks:** https://developers.facebook.com/docs/webhooks
- **Telegram Bot API:** https://core.telegram.org/bots/api
- **TypeScript:** https://www.typescriptlang.org/

---

**Last Updated:** May 2026

For questions or issues, refer to [TESTING.md](./TESTING.md) and [SETUP_CHANNELS.md](./SETUP_CHANNELS.md).
