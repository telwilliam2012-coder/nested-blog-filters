FROM node:22-alpine AS base
RUN apk add --no-cache openssl sqlite
WORKDIR /app

FROM base AS build
COPY . .
RUN npm ci \
    && DATABASE_URL=file:/tmp/build.sqlite npm run db:generate \
    && npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
