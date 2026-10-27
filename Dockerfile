FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV FOLIO_WORKSPACE=/data/workspace

EXPOSE 4321

CMD ["npx", "tsx", "src/server/index.ts"]
