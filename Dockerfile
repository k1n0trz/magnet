# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build frontend only (TypeScript in server runs at runtime)
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies (includes tsx for runtime TS execution)
RUN npm ci --omit=dev && npm install --save tsx

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy server source (will run with tsx loader)
COPY server ./server

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 0

# Run the production Express app
CMD ["npx", "tsx", "server/server.ts"]
