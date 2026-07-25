# LedgerMind frontend — Next.js 16 (App Router, React 19)
FROM node:20-slim AS builder

WORKDIR /app

# Install deps from the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so they must
# be present as env during `npm run build` (passed as build args from compose/CI).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

COPY . .
RUN npm run build

# ── Runtime image ──
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy the built app + production deps.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

# `next start` serves the production build. (For a smaller image later, switch
# next.config to `output: "standalone"` and copy only .next/standalone — left as a
# follow-up so this scaffold needs no config changes on this Next.js version.)
CMD ["npm", "run", "start"]
