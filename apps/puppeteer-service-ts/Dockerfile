FROM node:18-slim

# Install system dependencies for Chromium and font rendering.
# We do NOT install google-chrome-stable from the Google APT repo because that
# repo only publishes an amd64 package — the build would fail on arm64.
# Instead we install the shared libraries that any Chromium binary needs, plus
# the font packages we want, and let `npx playwright install --with-deps chromium`
# (below) download the correct Chromium binary for the current architecture.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        fonts-freefont-ttf \
        fonts-ipafont-gothic \
        fonts-kacst \
        fonts-liberation \
        fonts-noto \
        fonts-symbola \
        fonts-thai-tlwg \
        fonts-wqy-zenhei \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libc6 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libexpat1 \
        libfontconfig1 \
        libgbm1 \
        libgcc1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libstdc++6 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxrandr2 \
        libxrender1 \
        libxss1 \
        libxtst6 \
        lsb-release \
        wget \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files first for better layer caching
COPY ./package.json ./pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Install Playwright Chromium binaries (used by Hero under the hood)
RUN npx playwright install --with-deps chromium

# Build the application
RUN pnpm run build

# Runtime configuration
ARG PORT=3000
ENV PORT=${PORT}
ENV PLAYWRIGHT_BROWSERS_PATH=/app/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

EXPOSE ${PORT}

CMD ["pnpm", "start"]
