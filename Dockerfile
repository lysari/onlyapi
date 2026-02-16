# ── Stage 1: Install & Build ─────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json bunfig.toml ./
RUN bun install --frozen-lockfile

# Copy source
COPY tsconfig.json biome.json ./
COPY src/ src/

# Type check & build
RUN bun run check

# Create data directory (distroless has no shell)
RUN mkdir -p /app/data

# ── Stage 2: Production ─────────────────────────────────────────────────
FROM oven/bun:1.3-alpine

WORKDIR /app

# Copy only production artifacts
COPY --from=builder /app/src/ src/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/data/ data/

# Create non-root user
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

# Expose default port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Environment defaults
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/app/data/onlyapi.sqlite

CMD ["bun", "src/main.ts"]
