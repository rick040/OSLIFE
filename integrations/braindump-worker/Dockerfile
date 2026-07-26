# OSLIFE braindump media worker
# node + ffmpeg + yt-dlp. Deploy to Fly.io / Railway / Render / a small VPS.
FROM node:22-slim

# ffmpeg for audio extraction/transcode; python3 + pip for yt-dlp.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages -U yt-dlp \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
# Headless Chromium, for Pinterest only (notePinterestPin() in server.mjs):
# Pinterest's bot-management hard-blocks plain HTTP fetches (and even yt-dlp
# with valid cookies), so pulling a pin's title/image needs a real browser
# render instead. Instagram/YouTube don't use this at all.
RUN npx playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*
COPY server.mjs ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
