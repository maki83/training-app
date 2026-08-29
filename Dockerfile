# Production Dockerfile for training-app
# Node.js 20 Alpine as requested
FROM node:20-alpine AS base

WORKDIR /usr/src/app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy application source (tests and docs are excluded via .dockerignore)
COPY . .

# Create non-root user
RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp \
  && chown -R nodeapp:nodeapp /usr/src/app

USER nodeapp

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
