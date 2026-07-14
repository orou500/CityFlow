FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini

COPY package.json ./

RUN npm install --omit=dev

COPY src/ ./src/

RUN mkdir -p logs

RUN addgroup -S bot && adduser -S bot -G bot
USER bot

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
