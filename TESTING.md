# Testing Magnet Locally

Complete guide for testing Magnet features before deployment.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start MongoDB locally (optional but recommended)
# Install MongoDB: https://docs.mongodb.com/manual/installation/
mongod  # In one terminal

# 3. Create .env file
cp .env.example .env

# Edit .env:
# - Set MONGO_URI=mongodb://localhost:27017/magnet (if using local MongoDB)
# - Set OPENAI_API_KEY or DEEPSEEK_API_KEY (if testing AI)
# - Keep MAGNET_SEND_REAL_WHATSAPP=false for testing

# 4. Start dev server
npm run dev
```

App will run on `http://localhost:4000`

---

## Testing Checklist

### Frontend

- [ ] Dashboard loads (home page)
- [ ] Sidebar navigation works
- [ ] Create new assistant
- [ ] Switch between assistants
- [ ] All tabs visible: Chat, Settings, Integrations, etc.

### Assistant Management

- [ ] Create assistant with phone number
- [ ] Edit assistant name
- [ ] Toggle assistant active/inactive
- [ ] Delete assistant (check that data persists)

### Channel Configuration

#### WhatsApp
- [ ] Settings → Chat → WhatsApp
- [ ] See webhook URL (copy-able)
- [ ] See verification token
- [ ] Credentials fields visible
- [ ] Toggle channel enabled/disabled

#### Instagram
- [ ] Settings → Chat → Instagram
- [ ] Token input visible
- [ ] Webhook URL displayed

#### Messenger
- [ ] Settings → Chat → Messenger
- [ ] Token input visible
- [ ] Webhook URL displayed

#### WordPress
- [ ] Settings → Chat → WordPress
- [ ] Webhook URL shown with copy button
- [ ] Instructions for CF7 visible

### AI Settings

- [ ] Settings → IA → General: Model provider selector
- [ ] Settings → IA → Texto: Temperature, personality, rules, etc.
- [ ] Settings → IA → Audio: Voice settings
- [ ] Simulator works (test AI responses)

### Chat Interface

- [ ] Create multiple conversations
- [ ] Send/receive messages
- [ ] Message status indicators
- [ ] Contact info sidebar
- [ ] Search conversations

### Data Persistence

**With MongoDB:**
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Create data
# - Open http://localhost:4000
# - Create 2 assistants
# - Add some contacts/messages
# - Stop dev server (Ctrl+C)

# Restart dev server
npm run dev

# Verify data is still there
# Both assistants should be visible
```

**Without MongoDB (memory store):**
```bash
# Data is lost on restart (expected)
# This is for testing only
```

---

## Testing Webhooks Locally

### Setup ngrok (expose local server to internet)

```bash
# Install ngrok: https://ngrok.com
ngrok http 4000
# Will output: https://xxxx-xx-xxx-xx.ngrok.io

# Keep this terminal open
```

### Test WhatsApp Webhook

```bash
# In another terminal, verify endpoint works:
curl "https://xxxx-xx-xxx-xx.ngrok.io/api/webhooks/ASSISTANT_ID/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test_challenge"

# Should return: test_challenge
```

### Simulate WhatsApp Message

```bash
curl -X POST "https://xxxx-xx-xxx-xx.ngrok.io/api/webhooks/ASSISTANT_ID/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "id": "wamid.123",
            "from": "5573001112233",
            "timestamp": "'$(date +%s)'",
            "type": "text",
            "text": {
              "body": "Test message from webhook"
            }
          }],
          "contacts": [{
            "profile": {
              "name": "Test User"
            }
          }]
        }
      }]
    }]
  }'

# Check localhost:4000 - message should appear in Chat
```

### Test Instagram Webhook

```bash
# Similar to WhatsApp but different payload structure
curl -X POST "https://xxxx-xx-xxx-xx.ngrok.io/api/webhooks/ASSISTANT_ID/instagram" \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "mid": "mid.123",
            "from": "123456789",
            "timestamp": "'$(date +%s)'",
            "type": "text",
            "message": "Instagram test message"
          }],
          "from": {
            "id": "123456789",
            "name": "Instagram User"
          }
        }
      }]
    }]
  }'
```

### Test WordPress Webhook

```bash
curl -X POST "https://xxxx-xx-xxx-xx.ngrok.io/api/webhooks/ASSISTANT_ID/wordpress" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "message": "Interested in your services",
    "timestamp": "'$(date +%s)'"
  }'

# Should create contact and conversation
```

---

## Testing AI Responses

### Enable Simulator

1. Go to Settings → Entrenamiento (Training)
2. Edit prompt (left panel)
3. Simulator (right panel) - type test message
4. Click "Generar" (Generate)
5. AI response appears below

### Test Actual Message Response

```bash
# With real message from webhook
# 1. Send message via webhook (see above)
# 2. Message appears in Chat
# 3. If botEnabled=true, AI automatically responds
# 4. Response appears after ~2 seconds
```

---

## Testing Modes

### Development Mode (npm run dev)

```bash
PROS:
- Hot reload on code changes
- Full console output
- Slower startup
- Good for development

CONS:
- Not production-like
- TypeScript compiles on-the-fly
```

### Production Mode (npm run build + npm start)

```bash
# Build and test like production
npm run build
export MONGO_URI=mongodb://localhost:27017/magnet
npm start

# Navigate to http://localhost:4000
```

### Docker Mode (test deployment locally)

```bash
# Build Docker image
docker build -t magnet:latest .

# Run container
docker run -p 4000:8080 \
  -e MONGO_URI="mongodb://host.docker.internal:27017/magnet" \
  -e MAGNET_SEND_REAL_WHATSAPP=false \
  magnet:latest

# Test at http://localhost:4000
```

---

## Unit Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- server/__tests__/handlers.test.ts

# Watch mode (rerun on file changes)
npm test -- --watch
```

Expected results:
- 16 tests passing (handlers, webhooks, security)
- No console errors
- Coverage output (optional)

---

## Debugging

### Check logs

**Development:**
```bash
npm run dev
# Logs appear in console
```

**Production:**
```bash
npm start
# Logs on stdout
```

### Check API responses

```bash
# Health check
curl http://localhost:4000/api/health

# Bootstrap data
curl http://localhost:4000/api/bootstrap

# Assistants
curl http://localhost:4000/api/assistants
```

### Check Database

**MongoDB Compass (GUI):**
1. Download: https://www.mongodb.com/try/download/compass
2. Connect: `mongodb://localhost:27017`
3. Browse collections: `magnet.assistants`, `magnet.contacts`, etc.

**MongoDB CLI:**
```bash
mongosh
use magnet
db.assistants.find()
db.contacts.find()
db.conversations.find()
db.messages.find()
```

---

## Common Issues

### Issue: Port 4000 already in use

```bash
# Find and kill process
lsof -i :4000
kill -9 <PID>

# Or use different port
PORT=3000 npm run dev
```

### Issue: MongoDB connection failed

```bash
# Check MongoDB is running
ps aux | grep mongod

# If not, start it
mongod

# Or disable for testing (memory store)
unset MONGO_URI
npm run dev
```

### Issue: Webhook returns 404

- Verify assistant ID is correct
- Check channel is enabled in Settings
- Verify webhook URL format: `/api/webhooks/:assistantId/:channel`

### Issue: AI doesn't respond

- Check `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` is set
- Verify AI status is "active" in Settings
- Check that conversation has `botEnabled=true`
- Review server logs for errors

### Issue: Frontend shows blank page

- Check console errors (F12 → Console)
- Verify API is running (`/api/health`)
- Try hard refresh (Ctrl+Shift+R)
- Check `dist/` folder exists after `npm run build`

---

## Stress Testing

### Simulate 100 contacts

```bash
# Create test data script
# Useful for testing UI performance with large datasets
NODE_ENV=development npx tsx << 'EOF'
import { createMemoryStore } from "./server/store/memoryStore";

const store = createMemoryStore();
const assistant = await store.createAssistant({
  name: "Test",
  phone: "1234567890"
});

// Create 100 contacts
for (let i = 0; i < 100; i++) {
  await store.upsertContact({
    assistantId: assistant.id,
    name: `Contact ${i}`,
    phone: `555000${String(i).padStart(4, '0')}`
  });
}

console.log("Created 100 contacts");
EOF
```

### Send 50 messages

```bash
# Similar approach - create conversations and messages
# Then check if UI remains responsive
```

---

## Performance Benchmarks

Target metrics for your deployment:

| Metric | Target | Status |
|--------|--------|--------|
| Home page load | < 2s | ✅ |
| Create assistant | < 1s | ✅ |
| Send message | < 500ms | ✅ |
| Load Chat (100 msgs) | < 1s | ✅ |
| Search conversations | < 200ms | ✅ |
| Webhook response | < 100ms | ✅ |

Test on slow network (Chrome DevTools → Throttling)

---

## Sign-Off Checklist

Before deploying to production:

- [ ] All unit tests passing
- [ ] Webhook simulation working
- [ ] MongoDB connected and data persists
- [ ] AI responses working
- [ ] No console errors
- [ ] Bundle size reasonable (~600KB JS)
- [ ] Docker image builds successfully
- [ ] Health check endpoint responds
- [ ] HTTPS works (on cloud)
