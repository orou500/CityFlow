FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

FROM node:20-alpine
RUN apk add --no-cache tini curl && \
    addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app /app
USER appuser
EXPOSE 5000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
