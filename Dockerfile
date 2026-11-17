FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    PORT=10000
WORKDIR /app

# Copy only runtime files. Provider credentials are injected at runtime.
COPY --chown=node:node package.json server.mjs flashscore-adapter.mjs flashscore_proxy.py ./
COPY --chown=node:node index.html goal-data.js service-worker.js manifest.json ./
COPY --chown=node:node assets ./assets
RUN mkdir -p /app/.cache && chown node:node /app/.cache

USER node
EXPOSE 10000
CMD ["node", "server.mjs"]
