FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

FROM node:22-alpine
RUN apk add --no-cache tini curl python3 make g++ && \
    addgroup -S bot && adduser -S bot -G bot
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
RUN npm rebuild --omit=dev
RUN mkdir -p logs
RUN apk del python3 make g++
USER bot

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
