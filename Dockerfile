# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Install build deps for native modules (libsignal, mysql2, canvas)
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev libjpeg-turbo-dev giflib-dev

COPY package*.json .npmrc patches/ ./
# postinstall runs patch-package automatically
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Runtime libs for canvas (cairo/pango); no build tools needed since
# node_modules are copied pre-compiled from the builder stage.
RUN apk add --no-cache cairo pango libjpeg-turbo giflib && \
    addgroup -S zyra && adduser -S zyra -G zyra

WORKDIR /app

# Copy pre-built node_modules (patches already applied) and prune dev deps.
# Avoids re-running npm ci in runtime, so patch-package (devDep) is not needed.
COPY package*.json .npmrc ./
COPY --from=builder /build/node_modules ./node_modules
RUN npm prune --omit=dev --ignore-scripts

COPY --from=builder /build/dist ./dist/

RUN mkdir -p data/auth data/media data/antiban && \
    chown -R zyra:zyra /app

USER zyra

VOLUME ["/app/data"]

# Prometheus antiban metrics + health check
EXPOSE 9108 9109

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.WA_HEALTH_PORT || 9109) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENV NODE_ENV=production \
    WA_AUTH_DIR=data/auth \
    WA_ANTIBAN_STATE_DIR=data/antiban \
    WA_MEDIA_DOWNLOAD_DIR=data/media \
    WA_PRINT_QR=true \
    WA_ANTIBAN_ENABLED=true \
    WA_ANTIBAN_METRICS_ENABLED=true \
    WA_ANTIBAN_METRICS_HOST=0.0.0.0 \
    WA_ANTIBAN_METRICS_PORT=9108

CMD ["node", "dist/index.js"]
