FROM --platform=$BUILDPLATFORM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:20-alpine
RUN apk add --no-cache tini curl && \
    addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup . .
RUN npm rebuild --omit=dev
USER appuser
EXPOSE 5000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
