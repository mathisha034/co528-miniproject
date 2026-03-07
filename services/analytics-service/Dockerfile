# ---- Build Stage ----
FROM node:20-alpine AS builder

# Increase node memory to prevent OOM during build
ENV NODE_OPTIONS="--max-old-space-size=2048"

WORKDIR /app

COPY . .

# Install all deps (including dev for building)
RUN npm install --prefer-offline && npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

RUN apk upgrade --no-cache

# Security: non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built output and reinstall only prod deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --prefer-offline

USER appuser

EXPOSE 3000

CMD ["node", "dist/main"]
