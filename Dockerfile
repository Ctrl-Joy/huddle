# Huddle: one container serving the API, the realtime gateway and the built web app.
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
RUN npm run build

# Database, uploads and the generated JWT secret live here; mount a volume at /data.
ENV NODE_ENV=production \
    PORT=8080 \
    HUDDLE_DB=/data/huddle.db \
    HUDDLE_UPLOADS=/data/uploads
VOLUME /data
EXPOSE 8080

CMD ["npm", "start"]
