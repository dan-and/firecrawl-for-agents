FROM node:22-slim AS base

# Create app directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm corepack@latest
RUN corepack enable

# Install build dependencies early (git needed for pnpm to install from git repos)
RUN apt-get update -qq && \
    apt-get install -y \
    ca-certificates \
    curl \
    gcc \
    git \
    python3 \
    && update-ca-certificates

# Copy package files
COPY ./package.json ./pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install Go 1.24.1 (apt golang-go only ships 1.19 in Debian bookworm; 1.23+ is required for golang.org/x/net >=0.36.0)
ARG TARGETOS=linux
RUN GOVERSION=1.24.1 && \
    GOARCH_DL=$([ "$(uname -m)" = "aarch64" ] && echo "arm64" || echo "amd64") && \
    curl -fsSL "https://dl.google.com/go/go${GOVERSION}.${TARGETOS}-${GOARCH_DL}.tar.gz" | tar -C /usr/local -xz && \
    ln -sf /usr/local/go/bin/go /usr/bin/go && \
    ln -sf /usr/local/go/bin/gofmt /usr/bin/gofmt

# Copy the rest of the application
COPY . ./

# Build Go module
COPY ./src/lib/go-html-to-md/ ./src/lib/go-html-to-md/
ARG TARGETARCH
RUN cd src/lib/go-html-to-md && \
    CGO_ENABLED=1 GOOS=linux GOARCH=${TARGETARCH} go build -mod=mod -o html-to-markdown.so -buildmode=c-shared . && \
    chmod +x html-to-markdown.so

# Build the application
RUN pnpm run build

# Install runtime dependencies
RUN apt-get install --no-install-recommends -y \
    chromium \
    chromium-sandbox \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives

# Environment setup
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"
ARG PORT=8080
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["pnpm", "start"]
