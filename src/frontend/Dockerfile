# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Build-time arguments for network configuration
# CARDANO_NETWORK: mainnet | preprod | preview
ARG CARDANO_NETWORK=mainnet
ARG BACKEND_URL=http://localhost:8080
ARG BLOCKFROST_PROJECT_ID=""
# Public origin of THIS deployment (e.g. https://preview.uplc.link) —
# social cards resolve og:image/og:url against it
ARG BASE_URL=https://uplc.link

# Set environment variables for Next.js build
# These are baked into the static build at compile time
ENV NEXT_PUBLIC_CARDANO_NETWORK=$CARDANO_NETWORK
ENV NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL
ENV NEXT_PUBLIC_BLOCKFROST_PROJECT_ID=$BLOCKFROST_PROJECT_ID
ENV NEXT_PUBLIC_BASE_URL=$BASE_URL

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Create public directory if it doesn't exist
RUN mkdir -p public

# Build Next.js application
RUN npm run build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

# Install system dependencies for git and compilation
RUN apt-get update && apt-get install -y \
    git \
    curl \
    bash \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Aiken v1.0.28/29-alpha binaries link OpenSSL 1.1, which bookworm no longer
# ships — install libssl1.1 side-by-side with libssl3 so verifications pinned
# to those compiler versions still build. Latest deb resolved from the pool
# listing (falls back to the archive mirror when bullseye security retires).
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    for base in \
      http://security.debian.org/debian-security/pool/updates/main/o/openssl \
      http://archive.debian.org/debian-security/pool/updates/main/o/openssl; do \
      deb="$(curl -fsSL "$base/" | grep -oE "libssl1\.1_1\.1\.1[a-z0-9.+~-]*_${arch}\.deb" | sort -uV | tail -n1)" || continue; \
      [ -n "$deb" ] || continue; \
      if curl -fsSL -o /tmp/libssl1.1.deb "$base/$deb"; then break; fi; \
    done; \
    dpkg -i /tmp/libssl1.1.deb; \
    rm -f /tmp/libssl1.1.deb

# Set up environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs

# Install Rust and Cargo (required for aikup)
# RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
# ENV PATH="/root/.cargo/bin:${PATH}"

# Install aikup (Aiken version manager) as root
RUN curl --proto '=https' --tlsv1.2 -LsSf https://install.aiken-lang.org | sh

# Update PATH to include Aiken binaries
ENV PATH="/root/.aiken/bin:${PATH}"

# Pre-install common Aiken versions to speed up verification
RUN aikup install v1.0.0 || true
RUN aikup install v1.1.0 || true
RUN aikup install v1.1.17 || true
RUN aikup install v1.1.19 || true
RUN aikup install v1.1.21 || true
RUN aikup install v1.1.22 || true

# Set default Aiken version
# RUN aikup default v1.1.22 || true

# Copy built application from builder
COPY --from=builder --chown=root:root /app/.next/standalone ./
COPY --from=builder --chown=root:root /app/.next/static ./.next/static
COPY --from=builder --chown=root:root /app/public ./public

# Note: Running as root for now to allow Aiken builds and git operations
# In production, consider running builds in a separate service with proper sandboxing

# Expose port
EXPOSE 3000

# Set hostname
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]
