FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine
RUN apk add --no-cache tini curl python3 make g++ && \
    addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup . .
RUN npm rebuild --omit=dev
RUN apk del python3 make g++
USER appuser
EXPOSE 5000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
