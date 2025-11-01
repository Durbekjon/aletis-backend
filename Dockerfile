# Multi-stage build for production

# Stage 1: Dependencies
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY . .

# Generate Prisma Client
RUN yarn prisma:generate

# Build the application
RUN yarn build

# Stage 3: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && \
    yarn cache clean

# Copy Prisma files
COPY prisma ./prisma

# Copy built application
COPY --from=build /app/dist ./dist

# Copy templates
COPY templates ./templates

# Create directory for uploads
RUN mkdir -p public/uploads

# Generate Prisma Client in production image
RUN yarn prisma:generate

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run database migrations and start the application
CMD ["sh", "-c", "yarn prisma:migrate:deploy && node dist/main"]

