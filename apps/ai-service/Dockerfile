FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src

RUN npm install
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8001

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8001

CMD ["node", "dist/index.js"]
