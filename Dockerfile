# syntax=docker/dockerfile:1.7

# Share the media tools with the builder so ffmpeg-static can use the installed
# musl-compatible binary instead of downloading another FFmpeg distribution.
FROM node:22-alpine AS media-base
RUN apk add --no-cache ca-certificates chromium-headless-shell ffmpeg font-dejavu
RUN chromium-headless-shell --version && ffprobe -version && ffmpeg -version
ENV FFMPEG_BIN=/usr/bin/ffmpeg

# Step 1: Build stage
FROM media-base AS builder

WORKDIR /app

# Copy package management files (only yarn.lock to avoid npm conflicts)
COPY package.json yarn.lock ./

# Install ALL dependencies (including devDependencies needed for build)
# NODE_ENV must NOT be "production" here so devDeps are installed
ENV NODE_ENV=development
# The VPS uses CPU rendering. ONNX otherwise downloads CUDA libraries even
# when no GPU is installed; keep its CPU runtime and all application packages.
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip yarn install --frozen-lockfile

# Copy the entire workspace (excluding files in .dockerignore)
COPY . .

# Remove package-lock.json if it exists (avoid conflicts with yarn.lock)
RUN rm -f package-lock.json

# Show Node.js and Yarn versions for debugging
RUN node --version && yarn --version

# Build the Vite frontend SPA and bundle the Express server using esbuild
# Increase Node.js heap size to avoid OOM errors on large bundles
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN yarn build

# Step 2: Production runner stage (keeps the final image lightweight)
FROM media-base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3005
ENV HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium-headless-shell

# Copy package files first to leverage Docker build cache for node_modules
COPY --from=builder /app/package.json /app/yarn.lock ./
COPY docker/prune-onnx-platforms.mjs /tmp/prune-onnx-platforms.mjs

# Install production dependencies and remove the download cache in the same layer.
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip yarn install --production --frozen-lockfile \
    && node /tmp/prune-onnx-platforms.mjs \
    && rm -rf /root/.cache/ffmpeg-static-nodejs /tmp/prune-onnx-platforms.mjs

# Fail the image build before deployment if Sharp or its bundled musl libvips is missing.
RUN node -e "const sharp = require('sharp'); console.log('sharp', sharp.versions.sharp, 'libvips', sharp.versions.vips)"

# Copy only the compiled output directory from builder
COPY --from=builder /app/dist ./dist

# Expose Express server port
EXPOSE 3005

# Run the bundled production server
CMD ["node", "dist/server.cjs"]
