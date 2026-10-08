# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:/tmp/build.db"
ENV BETTER_AUTH_URL="http://localhost:3000"
ENV PUBLIC_SITE_URL="http://localhost:3000"
ENV BETTER_AUTH_SECRET="build-only-secret-not-used-at-runtime"
RUN npm run build

FROM deps AS migrate
COPY prisma ./prisma
COPY lib ./lib
COPY scripts ./scripts
COPY tsconfig.json next.config.ts ./
RUN npx prisma generate \
    && mkdir -p /app/data \
    && chown node:node /app/data
USER node
CMD ["npm", "run", "db:init"]

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
