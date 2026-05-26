# Deploying Magnet to Google Cloud Run

## Prerequisites

- Google Cloud account (free tier available)
- `gcloud` CLI installed and configured
- MongoDB Atlas account (free tier: 512MB)
- Node.js 20+ locally for building

## ⚡ Quick Start

```bash
# 1. Set up MongoDB (free): https://mongodb.com/cloud/atlas
# Get your connection string: mongodb+srv://user:pass@cluster.mongodb.net/magnet

# 2. Deploy with MongoDB
./deploy.sh quant-495219 magnet us-central1 \
  --with-mongo "mongodb+srv://user:pass@cluster.mongodb.net/magnet"

# 3. Open the URL and start using!
```

---

## Deployment Options

### Option 1: Deploy Script (Recommended)

```bash
# Basic deployment (memory store, test mode)
./deploy.sh

# With custom project/service/region
./deploy.sh my-project magnet us-east1

# With all options
./deploy.sh my-project magnet us-central1 \
  --with-mongo "mongodb+srv://..." \
  --real-whatsapp \
  --openai "sk-..."
```

**Supported flags:**
- `--with-mongo <uri>` - Use MongoDB (recommended for production)
- `--real-whatsapp` - Enable real WhatsApp message sending
- `--openai <key>` - Set OpenAI API key
- `--deepseek <key>` - Set DeepSeek API key
- `--jwt-secret <secret>` - Set JWT secret

### Option 2: Manual Deploy

```bash
# Build frontend
npm run build

# Deploy to Cloud Run
gcloud run deploy magnet \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars=MONGO_URI=mongodb+srv://...
```

### Option 3: Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Cloud Run → Create Service
3. Connect to GitHub (authenticate and select repo)
4. Configure build:
   - Runtime: Node.js 20
   - Entry point: `node server/server.ts` (handled by Dockerfile)
5. Set environment variables
6. Deploy

---

## Setup Guide

### Step 1: Create Google Cloud Project

```bash
gcloud projects create magnet-prod --name "Magnet"
gcloud config set project magnet-prod
```

### Step 2: Set up MongoDB (Free)

1. Go to [MongoDB Atlas](https://mongodb.com/cloud/atlas)
2. Sign up (free)
3. Create organization
4. Create project: "Magnet"
5. Build a database: Select **M0 (free)** cluster
6. Configure:
   - Provider: AWS / GCP / Azure (doesn't matter for free tier)
   - Region: Closest to `us-central1`
   - Name: `magnet`
7. Create admin user: Save username & password
8. Network access: Allow `0.0.0.0/0` (or restrict to Cloud Run IP later)
9. Get connection string (Connection → Drivers → Node.js)
   ```
   mongodb+srv://admin:PASSWORD@magnet.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### Step 3: Deploy

```bash
./deploy.sh quant-495219 magnet us-central1 \
  --with-mongo "mongodb+srv://admin:PASSWORD@magnet.xxxxx.mongodb.net/magnet"
```

### Step 4: Configure Channels

See [SETUP_CHANNELS.md](./SETUP_CHANNELS.md) for detailed setup instructions.

---

## Environment Variables

### Required (Security)

- `JWT_SECRET` - Random string for token signing (auto-generated if not set)
- `ENCRYPTION_KEY` - 32-byte hex string for credential encryption

### Optional but Recommended

- `MONGO_URI` - MongoDB connection string
  - With MongoDB: Data persists across deployments ✅
  - Without: Data lost on restart ❌
  - Get free at: https://mongodb.com/cloud/atlas

### AI Providers (choose at least one)

- `OPENAI_API_KEY` - OpenAI models (GPT-4, GPT-4o)
- `DEEPSEEK_API_KEY` - DeepSeek models
- `DEEPINFRA_API_KEY` - DeepInfra models
- `AUDIO_PROVIDER` - `deepinfra` or `openai`; defaults to `deepinfra` when `DEEPINFRA_API_KEY` exists
- `DEEPINFRA_STT_MODEL` - DeepInfra transcription model, e.g. `openai/whisper-large`
- `DEEPINFRA_TTS_MODEL` - DeepInfra text-to-speech model, e.g. `deepinfra/tts`

### WhatsApp

- `MAGNET_SEND_REAL_WHATSAPP` - `true`/`false` (default: false)
  - `false` = Mock mode (logs messages, doesn't send)
  - `true` = Send real WhatsApp messages

### Auto-set by Cloud Run

- `PORT=8080` - Server port
- `NODE_ENV=production` - Environment
- `REGION=us-central1` - Region (example)

---

## Post-Deployment

### 1. Verify Health

```bash
curl https://magnet-xxx.run.app/api/health
# Expected response: {"ok":true,"name":"MAGNET","persistence":"mongo|memory"}
```

### 2. Check Logs

```bash
gcloud run logs read magnet --limit 50 --region us-central1
```

### 3. Configure Channels

Open https://magnet-xxx.run.app and go to:
- **Settings → Chat → [Channel name]**
- Add credentials (WhatsApp token, Instagram token, etc.)
- Copy webhook URLs
- Register webhooks in Meta/WordPress dashboards

See [SETUP_CHANNELS.md](./SETUP_CHANNELS.md) for step-by-step guides.

### 4. Test Webhooks

```bash
# Test WhatsApp webhook
curl -X GET "https://magnet-xxx.run.app/api/webhooks/ASSISTANT_ID/whatsapp?hub.challenge=test"

# Test WordPress webhook
curl -X POST "https://magnet-xxx.run.app/api/webhooks/ASSISTANT_ID/wordpress" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","message":"Hello"}'
```

## Troubleshooting

### Blank Page

If you see a blank page:

1. Check Cloud Run logs:
   ```bash
   gcloud run logs read magnet --limit 50
   ```

2. Verify frontend was built:
   ```bash
   ls dist/index.html
   ```

3. Check API health:
   ```bash
   curl https://magnet-xxx.run.app/api/health
   ```

### Port Issues

Cloud Run automatically sets `PORT=8080`. The app reads this from `process.env.PORT`.

### Static Files Not Served

Ensure `dist/` folder exists and contains `index.html` and `assets/`.

## Local Testing with Docker

```bash
# Build image
docker build -t magnet:latest .

# Run container
docker run -p 8080:8080 magnet:latest

# Test
curl http://localhost:8080
curl http://localhost:8080/api/health
```

## Monitoring

### View Logs
```bash
gcloud run logs read magnet --limit 100
```

### View Metrics
```bash
gcloud monitoring dashboards list
```

### Update Service (After Code Changes)

```bash
npm run build
gcloud run deploy magnet --source .
```

## Security Notes

- ✅ All environment variables are set in Cloud Run (not in code)
- ✅ HTTPS is enforced by default
- ✅ Rate limiting is enabled
- ✅ CORS is configured

## Current Deployment

**URL:** https://magnet-122728831361.us-central1.run.app/

**Status:** ✅ Production Ready

To check status:
```bash
gcloud run services describe magnet --region us-central1
```

## Rollback

If deployment goes wrong:

```bash
# View revision history
gcloud run revisions list --service magnet --region us-central1

# Rollback to previous revision
gcloud run services update-traffic magnet \
  --to-revisions PREVIOUS_REVISION_ID=100 \
  --region us-central1
```
