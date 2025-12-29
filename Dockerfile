FROM node:20-slim

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    bash \
    ca-certificates \
    gnupg \
    postgresql-client \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (for managing other containers)
# Uses official Docker installation script
RUN curl -fsSL https://get.docker.com -o get-docker.sh && \
    sh get-docker.sh && \
    rm get-docker.sh

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Google Cloud SDK (requires Python)
# Create python symlink for gcloud SDK installer
RUN ln -s /usr/bin/python3 /usr/bin/python \
    && curl -sSL https://sdk.cloud.google.com | bash -s -- --disable-prompts \
    && /root/google-cloud-sdk/install.sh --quiet \
    && ln -s /root/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud \
    && ln -s /root/google-cloud-sdk/bin/gsutil /usr/local/bin/gsutil \
    && ln -s /root/google-cloud-sdk/bin/docker-credential-gcloud /usr/local/bin/docker-credential-gcloud \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for running Claude Code
# Claude Code refuses to run with --dangerously-skip-permissions as root for security
# Add appuser to docker group for Docker socket access
RUN useradd -m -u 1001 -s /bin/bash appuser \
    && usermod -aG docker appuser \
    && mkdir -p /workspace /app/credentials \
    && chown -R appuser:appuser /app /workspace

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Install Playwright browsers (required for UI/UX testing in workspaces)
# This allows SCAR to run E2E tests in cloned projects
RUN npx -y playwright install --with-deps chromium

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm prune --production

# Fix permissions for appuser
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Create .codex directory for Codex authentication
RUN mkdir -p /home/appuser/.codex

# Configure git to trust /workspace directory
# This prevents "fatal: detected dubious ownership" errors when git operations
# are performed in mounted volumes or repos cloned by different users
RUN git config --global --add safe.directory /workspace && \
    git config --global --add safe.directory '/workspace/*'

# Expose port
EXPOSE 3000

# Setup Codex authentication and GCP authentication (if enabled), then start app
CMD ["sh", "-c", "npm run setup-auth && ([ \"$GCP_ENABLED\" = \"true\" ] && node dist/scripts/setup-gcp-auth.js || true) && npm start"]
