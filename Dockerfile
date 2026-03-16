# Stage 1: Install all workspace dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/email/package.json ./packages/email/
COPY apps/api/package.json ./apps/api/
COPY apps/cli/package.json ./apps/cli/
COPY apps/web/package.json ./apps/web/

RUN npm ci --ignore-scripts


# Stage 2: Build TypeScript for all packages and apps/api
FROM deps AS build
WORKDIR /app

# Copy source files
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY apps/cli/ ./apps/cli/
COPY apps/web/ ./apps/web/
COPY templates/ ./templates/

# Build all TypeScript (composite project references handle order)
RUN npm run build


# Stage 3: Production image
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Copy workspace manifests for production install
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/email/package.json ./packages/email/
COPY apps/api/package.json ./apps/api/
COPY apps/cli/package.json ./apps/cli/
COPY apps/web/package.json ./apps/web/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled JavaScript from build stage
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/email/dist ./packages/email/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Copy static frontend (no compilation needed)
COPY --from=build /app/apps/web/public ./apps/web/public

# Copy tutor prompt template (loaded at runtime)
COPY --from=build /app/templates ./templates

# The API server is the only process
EXPOSE ${PORT:-3000}
CMD ["node", "apps/api/dist/index.js"]
