# Production Dockerfile for training-app
#
# This image is intended for running the application in production.
# It copies the full application directory (filtered by .dockerignore),
# so any runtime-relevant files must be present in the repository and
# not excluded there. Note that README.md and jest.config.cjs are
# intentionally excluded as they are not used at runtime.

# Build stage: install dependencies
FROM node:20-alpine AS build

WORKDIR /usr/src/app

# Install dependencies based on lockfile for reproducible builds
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy the rest of the application source
COPY . .

# Runtime stage: minimal image with production deps only
FROM node:20-alpine AS runtime

# Create and use a non-root user for least-privilege execution
RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp

WORKDIR /usr/src/app

# Copy installed production dependencies and application code
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app .

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

USER nodeapp

CMD ["node", "src/server.js"]
