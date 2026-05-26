# 🧲 MAGNET - Multi-Channel Lead Management Agent

Enterprise-grade WhatsApp, Instagram, Messenger, and WordPress lead management system with AI-powered responses.

**Current Deployment:** https://magnet-ieazdv2u7q-uc.a.run.app

---

## ✨ Features

### 🚀 Multi-Channel Support

- **WhatsApp** - Meta Cloud API integration
- **Instagram** - DM and business message support
- **Facebook Messenger** - Full conversation handling
- **WordPress** - Contact form webhooks (Contact Form 7, etc.)
- **Telegram** - Coming soon
- **SMS/Twilio** - Coming soon

### 🤖 AI-Powered Responses

- **Multiple AI Providers**: OpenAI, DeepSeek, DeepInfra
- **Custom Personality**: Configure tone, formality, language preferences
- **Smart Routing**: Route to human agents when needed
- **Response Modes**: Automatic, manual review, or human-only

### 📊 Lead Management

- **Contact Database** - Automatic contact creation and enrichment
- **Conversation Tracking** - Full message history per contact
- **Lead Scoring** - Automatic qualification based on engagement
- **Status Pipeline** - Nuevo → Contactado → Calificado → Negociación → Ganado
- **Tags & Categories** - Custom organization for leads

### 🔐 Enterprise Security

- **HTTPS Enforced** - All webhooks via HTTPS
- **Encrypted Credentials** - AES-256 encryption for API keys
- **Rate Limiting** - Protection against abuse
- **CORS Configured** - Cross-origin request handling
- **JWT Authentication** - Secure token-based access

### 💾 Data Persistence

- **Optional MongoDB** - Persistent data storage (free tier available)
- **Memory Store** - In-memory option for testing/development
- **Automatic Backups** - Via MongoDB Atlas

---

## 🎯 Quick Start

### 1. Deploy to Google Cloud Run (2 minutes)

```bash
# Prerequisites: gcloud CLI configured
gcloud config set project quant-495219

# Deploy
./deploy.sh quant-495219 magnet us-central1
```

**URL will be:** `https://magnet-<random>.run.app`

### 2. Set Up MongoDB (Optional, Recommended)

```bash
# Create free MongoDB Atlas account: https://mongodb.com/cloud/atlas
# Get connection string and redeploy:

./deploy.sh quant-495219 magnet us-central1 \
  --with-mongo "mongodb+srv://user:pass@cluster.mongodb.net/magnet"
```

### 3. Configure Channels

1. Open https://magnet-<random>.run.app
2. Go to **Settings → Chat**
3. Select each channel and add credentials
4. Copy webhook URL and register in Meta/WordPress

**Detailed setup:** See [SETUP_CHANNELS.md](./SETUP_CHANNELS.md)

---

## 🧪 Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your API keys

# Start dev server (with hot reload)
npm run dev

# Opens: http://localhost:4000
```

**Full development guide:** See [TESTING.md](./TESTING.md)

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [SETUP_CHANNELS.md](./SETUP_CHANNELS.md) | Step-by-step setup for each channel |
| [DEPLOY.md](./DEPLOY.md) | Deployment and Cloud Run configuration |
| [TESTING.md](./TESTING.md) | Local testing and debugging guide |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design and handler pattern |

---

## 🔧 Tech Stack

### Backend
- **Node.js 20** - ES modules
- **Express.js** - REST API
- **TypeScript** - Type safety
- **MongoDB** - Data persistence (optional)
- **JWT** - Authentication

### Frontend
- **React 19** - UI framework
- **Vite** - Build tooling
- **Lucide Icons** - Icon library
- **Recharts** - Data visualization

### Deployment
- **Google Cloud Run** - Serverless container platform
- **Docker** - Container orchestration
- **Multi-stage builds** - Optimized images

### AI & Integration
- **OpenAI API** - GPT-4, GPT-4o models
- **DeepSeek API** - Alternative LLM provider
- **DeepInfra** - Model inference
- **Meta Graph API** - WhatsApp, Instagram, Messenger
- **Webhooks** - Inbound integrations

---

## 📊 Architecture

### Handler Pattern

Each channel implements `ChannelHandler` interface:

```typescript
interface ChannelHandler {
  validateWebhook(req, settings): boolean | string;
  parseInbound(payload): ChannelInboundMessage[];
  sendMessage(settings, to, body): Promise<ChannelSendResult>;
}
```

**Benefits:**
- ✅ Agnóstico del canal - agrega nuevos canales sin tocar core
- ✅ Type-safe - TypeScript ensures consistency
- ✅ Testable - Mock handlers for testing
- ✅ Extensible - Plugin architecture ready

### Data Flow

```
Webhook Request
  ↓
Handler validates & parses
  ↓
Create/Update Contact
  ↓
Create/Update Conversation
  ↓
Add Message
  ↓
Generate AI Response (optional)
  ↓
Send Response via Handler
  ↓
Log to Event System
```

### Storage

- **Assistants** - Configuration, AI settings, channels
- **Contacts** - Phone, name, metadata, lead score
- **Conversations** - Thread per contact, assignment, status
- **Messages** - Full history with timestamps
- **Triggers** - Automation rules
- **Templates** - Message templates
- **Events** - Audit log

---

## 🚀 Deployment Architecture

### Container Setup

```dockerfile
# Multi-stage build
Stage 1 (Builder):
  - Node.js 20-alpine
  - npm ci (dependencies)
  - npm run build (TypeScript + Vite)
  
Stage 2 (Production):
  - Node.js 20-alpine
  - Production dependencies only
  - Copy dist/ (frontend)
  - Copy server/ (backend)
  - Express static + SPA fallback
  - Health check endpoint
```

### Cloud Run Configuration

- **Memory:** 512Mi (sufficient for most workloads)
- **CPU:** 1 vCPU
- **Timeout:** 3600s
- **Concurrency:** 80 concurrent requests
- **Region:** us-central1 (configurable)

### Scaling

Cloud Run auto-scales 0 → N instances based on traffic:
- 0 requests = 0 cost (except for invocations)
- 1000 req/min = ~5-10 instances
- Billing: $0.00002500 per request (free tier: 2M/month)

---

## 🔑 Configuration

### Required Environment Variables

```bash
# Security (auto-generated if not provided)
JWT_SECRET=your-random-secret
ENCRYPTION_KEY=32-byte-hex-string

# Optional but recommended
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/magnet

# WhatsApp mode
MAGNET_SEND_REAL_WHATSAPP=false  # true = real messages

# AI Providers (at least one)
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
DEEPINFRA_API_KEY=...
```

**See:** [.env.example](./.env.example) for complete list

---

## 📈 Monitoring

### Health Check

```bash
curl https://magnet-xxx.run.app/api/health
# {"ok":true,"name":"MAGNET","persistence":"mongo|memory"}
```

### Cloud Run Logs

```bash
gcloud run logs read magnet --limit 50
gcloud run logs read magnet --region us-central1
```

### Metrics

```bash
gcloud monitoring dashboards list
gcloud monitoring metrics-descriptors list
```

---

## 🧪 Testing

### Unit Tests

```bash
npm test

# Output:
# ✓ Handlers (12 tests)
#   - WhatsApp validation
#   - WhatsApp parsing
#   - Instagram parsing
#   - Messenger parsing
#   - WordPress parsing
# ✓ Webhooks (2 tests)
# ✓ Security (2 tests)
```

### Local Testing

```bash
npm run dev
# Then see TESTING.md for webhook simulation
```

### Integration Testing

```bash
# Use ngrok to expose local server
ngrok http 4000

# Simulate webhooks with curl
curl -X POST https://xxx.ngrok.io/api/webhooks/... \
  -H "Content-Type: application/json" \
  -d '{"entry":[...]}'
```

---

## 🐛 Troubleshooting

### Deployment Issues

**Blank page?**
```bash
# Check health endpoint
curl https://magnet-xxx.run.app/api/health

# Check logs
gcloud run logs read magnet

# Verify frontend was built
ls dist/index.html
```

**Webhooks not working?**
- Verify URL is accessible from internet
- Check webhook secret/token matches
- Ensure HTTPS (not HTTP)
- Check assistant ID is correct

**MongoDB not connecting?**
- Verify `MONGO_URI` environment variable
- Check MongoDB Atlas network access (allow 0.0.0.0/0)
- Test connection: `mongosh "mongodb+srv://..."`

### Local Development Issues

**Port in use?**
```bash
lsof -i :4000
kill -9 <PID>
```

**Dependencies issue?**
```bash
rm -rf node_modules package-lock.json
npm ci
```

**TypeScript errors?**
```bash
npx tsc --noEmit
```

---

## 📋 Roadmap

### Phase 1 ✅ (Complete)
- [x] Multi-channel handler architecture
- [x] WhatsApp, Instagram, Messenger, WordPress
- [x] Basic AI responses
- [x] Cloud Run deployment
- [x] Frontend multi-channel UI

### Phase 2 🚀 (In Progress)
- [ ] Lead qualification scoring system
- [ ] Advanced AI prompt management
- [ ] Frontend routing (React Router)
- [ ] Dashboard analytics
- [ ] Message templates with variables

### Phase 3 🔮 (Planned)
- [ ] Telegram bot support
- [ ] SMS/Twilio integration
- [ ] Team collaboration features
- [ ] Advanced automation rules
- [ ] Custom webhooks/zapier integration

### Phase 4 (Wishlist)
- [ ] Mobile app (React Native)
- [ ] Voice/audio responses
- [ ] Multilingual NLP
- [ ] CRM integrations (Salesforce, HubSpot)
- [ ] Marketplace (3rd party channels)

---

## 💰 Costs

### Free Tier

- **Cloud Run:** 2M requests/month free
- **MongoDB Atlas:** 512MB storage free
- **OpenAI API:** Pay per token (starting ~$0.01)

### Example Monthly Cost (100k messages)

| Service | Usage | Cost |
|---------|-------|------|
| Cloud Run | 100k requests | $0 (free tier) |
| MongoDB | <512MB | $0 (free tier) |
| OpenAI | 10M tokens (~$0.50) | $5 |
| **Total** | - | ~$5 |

Scales up for larger workloads.

---

## 📝 License

Proprietary - All rights reserved

---

## 🤝 Support

### Documentation
- [SETUP_CHANNELS.md](./SETUP_CHANNELS.md) - Channel setup guides
- [DEPLOY.md](./DEPLOY.md) - Deployment instructions
- [TESTING.md](./TESTING.md) - Local testing guide

### Issues & Debugging
```bash
# Check logs
gcloud run logs read magnet

# Debug locally
npm run dev

# Run tests
npm test
```

---

## 👨‍💻 Development

### Project Structure

```
magnet/
├── src/
│   ├── App.tsx              # Main React app
│   ├── index.css            # Global styles
│   └── main.tsx             # React entry
│
├── server/
│   ├── app.ts               # Express setup
│   ├── server.ts            # Entry point
│   ├── types.ts             # TS interfaces
│   ├── lib/                 # Utilities
│   ├── handlers/            # Channel handlers
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── store/               # Data persistence
│   └── __tests__/           # Unit tests
│
├── Dockerfile               # Multi-stage build
├── deploy.sh                # Deploy script
├── DEPLOY.md                # Deploy guide
├── SETUP_CHANNELS.md        # Channel setup
└── TESTING.md               # Testing guide
```

### Commands

```bash
npm run dev            # Start with hot reload
npm run build          # Build frontend + backend
npm start              # Run production build
npm test               # Run unit tests
npm run preview        # Preview built frontend
```

---

**Built with ❤️ for modern lead management**
