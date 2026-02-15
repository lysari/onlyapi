# ── Stage 1: Install & Build ─────────────────────────────────────────────
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json bunfig.toml ./
RUN bun install --frozen-lockfile --production=false

# Copy source
COPY tsconfig.json biome.json ./
COPY src/ src/

# Type check & build
RUN bun run check
RUN bun build src/main.ts --target=bun --outdir=dist --minify

# ── Stage 2: Production ─────────────────────────────────────────────────
FROM oven/bun:1.1-distroless

WORKDIR /app

# Copy only production artifacts
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/package.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data

# Non-root user (distroless runs as nonroot by default)
USER nonroot

# Expose default port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "--eval", "const r = await fetch('http://localhost:3000/health'); process.exit(r.ok ? 0 : 1)"]

# Environment defaults
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/app/data/onlyapi.sqlite

CMD ["bun", "dist/main.js"]
