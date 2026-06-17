FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3011

EXPOSE 3011

CMD ["node", "src/app.js"]
