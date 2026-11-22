FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates util-linux \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HEALTH_HOST=0.0.0.0 HEALTH_PORT=8000 DATABASE_PATH=/mnt/bot/state/bot.sqlite TEMP_DIR=/app/tmp
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/data /app/tmp /app/backups && chown -R node:node /app/data /app/tmp /app/backups
ENV GPT_SOVITS_URL=https://pope-polymer-restructuring-sizes.trycloudflare.com \
    GPT_SOVITS_PROMPT_TEXT="私は姫乃きさら。担当は原画。このくらいでいいでしょ？"
COPY deploy/koyeb-start.sh /app/koyeb-start.sh
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["/bin/sh", "/app/koyeb-start.sh"]
