FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app

# Copy package.json and install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy built frontend and server code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/tsconfig.json ./

# Install tsx globally to run the server
RUN npm install -g tsx

# Create directory for SQLite database
RUN mkdir -p /data
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["tsx", "server.ts"]
