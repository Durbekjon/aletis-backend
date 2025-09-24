# syntax=docker/dockerfile:1.7

# -------- Base deps (build) --------
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# -------- Build --------
FROM deps AS build
WORKDIR /app
COPY . .

# Generate Prisma client and build NestJS
RUN npx prisma generate \
  && npm run build

# -------- Production runtime --------
FROM node:20-slim AS runner
WORKDIR /app

# Ensure OpenSSL is available for Prisma engines
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Only prod deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built app and required assets
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Entrypoint script to run migrations and start server
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

## Prepare writable directories and permissions for non-root runtime
RUN mkdir -p /app/logs && chown -R node:node /app

USER node

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/main.js"]


