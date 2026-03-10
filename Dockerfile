# Stage 1: base — install all deps + copy source
FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json prisma.config.ts ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY worker/package.json worker/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .

# Stage 2: shared — build the shared package
FROM base AS shared
RUN npm run build -w packages/shared

# Stage 3: prisma — generate Prisma client
FROM shared AS prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npx prisma generate

# Stage 4: backend — run with tsx
FROM prisma AS backend
EXPOSE 5002
CMD ["npx", "tsx", "backend/src/index.ts"]

# Stage 5: worker — needs git for simple-git
FROM prisma AS worker
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
CMD ["npx", "tsx", "worker/src/index.ts"]

# Stage 6: frontend-build — build Vite app
FROM prisma AS frontend-build
RUN npm run build -w frontend

# Stage 7: frontend — serve with nginx
FROM nginx:1.27-alpine AS frontend
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
