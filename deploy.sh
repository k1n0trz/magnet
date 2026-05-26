#!/bin/bash

# Magnet Cloud Run Deployment Script
# Usage: ./deploy.sh [project_id] [service_name] [region] [options]
# Example: ./deploy.sh quant-495219 magnet us-central1 --with-mongo "mongodb+srv://..."

set -e

# ============================================
# Configuration
# ============================================
PROJECT_ID="${1:-quant-495219}"
SERVICE_NAME="${2:-magnet}"
REGION="${3:-us-central1}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# Parse additional arguments
# ============================================
MONGO_URI=""
REAL_WHATSAPP="false"
OPENAI_KEY=""
DEEPSEEK_KEY=""
JWT_SECRET=""

while [[ $# -gt 3 ]]; do
  case $4 in
    --with-mongo)
      MONGO_URI="$5"
      shift 2
      ;;
    --real-whatsapp)
      REAL_WHATSAPP="true"
      shift
      ;;
    --openai)
      OPENAI_KEY="$5"
      shift 2
      ;;
    --deepseek)
      DEEPSEEK_KEY="$5"
      shift 2
      ;;
    --jwt-secret)
      JWT_SECRET="$5"
      shift 2
      ;;
    *)
      echo "Unknown option: $4"
      exit 1
      ;;
  esac
done

# ============================================
# Welcome
# ============================================
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        🧲 MAGNET DEPLOYMENT           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Project:      $PROJECT_ID"
echo "  Service:      $SERVICE_NAME"
echo "  Region:       $REGION"
echo "  MongoDB:      ${MONGO_URI:-"(not configured)"}"
echo "  Real WhatsApp: $REAL_WHATSAPP"
echo ""

# ============================================
# Build Frontend
# ============================================
echo -e "${BLUE}📦 Building frontend...${NC}"
npm run build
echo -e "${GREEN}✓ Frontend built${NC}"
echo ""

# ============================================
# Prepare environment variables
# ============================================
echo -e "${BLUE}🔧 Preparing environment variables...${NC}"

ENV_VARS="MAGNET_SEND_REAL_WHATSAPP=${REAL_WHATSAPP}"

if [ -n "$MONGO_URI" ]; then
  ENV_VARS="${ENV_VARS},MONGO_URI=${MONGO_URI}"
fi

if [ -n "$OPENAI_KEY" ]; then
  ENV_VARS="${ENV_VARS},OPENAI_API_KEY=${OPENAI_KEY}"
fi

if [ -n "$DEEPSEEK_KEY" ]; then
  ENV_VARS="${ENV_VARS},DEEPSEEK_API_KEY=${DEEPSEEK_KEY}"
fi

if [ -n "$JWT_SECRET" ]; then
  ENV_VARS="${ENV_VARS},JWT_SECRET=${JWT_SECRET}"
fi

echo -e "${GREEN}✓ Environment configured${NC}"
echo ""

# ============================================
# Deploy to Cloud Run
# ============================================
echo -e "${BLUE}☁️ Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --set-env-vars="$ENV_VARS" \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --clear-base-image

# ============================================
# Get service URL
# ============================================
SERVICE_URL="https://${SERVICE_NAME}-${PROJECT_ID}.${REGION}.run.app"

# ============================================
# Verify deployment
# ============================================
echo ""
echo -e "${BLUE}🔍 Verifying deployment...${NC}"
sleep 5

HEALTH_CHECK=$(curl -s ${SERVICE_URL}/api/health || echo "")

if echo "$HEALTH_CHECK" | grep -q "ok"; then
  echo -e "${GREEN}✓ Health check passed${NC}"
else
  echo -e "${YELLOW}⚠ Health check failed (service may still be provisioning)${NC}"
fi

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    ✅ DEPLOYMENT COMPLETE              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "📱 ${YELLOW}URL${NC}: ${GREEN}${SERVICE_URL}${NC}"
echo -e "🔗 ${YELLOW}API${NC}: ${GREEN}${SERVICE_URL}/api${NC}"
echo -e "📊 ${YELLOW}Health${NC}: ${GREEN}${SERVICE_URL}/api/health${NC}"
echo ""
echo "Next steps:"
echo "  1. Open ${SERVICE_URL} in your browser"
echo "  2. Configure channels in Settings → Chat"
echo "  3. Register webhooks in Meta/WordPress dashboards"
echo ""
if [ "$REAL_WHATSAPP" = "false" ]; then
  echo -e "${YELLOW}⚠ IMPORTANT: Real WhatsApp is DISABLED${NC}"
  echo "   To enable: redeploy with --real-whatsapp flag"
fi
