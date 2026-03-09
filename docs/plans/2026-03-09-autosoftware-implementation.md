# AutoSoftware Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an automated software development platform that scans repos, generates tasks, and autonomously implements changes via Claude Agent SDK.

**Architecture:** Monorepo with React frontend, Fastify backend, and Node.js worker using Claude Agent SDK. PostgreSQL via Prisma, pg-boss for job queue. OAuth for GitHub/GitLab/Bitbucket.

**Tech Stack:** React, Vite, TailwindCSS, shadcn/ui, Fastify, Prisma, pg-boss, @anthropic-ai/claude-agent-sdk, TypeScript

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json` (workspace root)
- Create: `tsconfig.base.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/index.ts`
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/src/index.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`

**Step 1: Create root package.json with npm workspaces**

```json
{
  "name": "autosoftware",
  "private": true,
  "workspaces": ["packages/*", "backend", "worker", "frontend"],
  "scripts": {
    "dev:backend": "npm run dev -w backend",
    "dev:worker": "npm run dev -w worker",
    "dev:frontend": "npm run dev -w frontend",
    "db:migrate": "npx prisma migrate dev",
    "db:generate": "npx prisma generate",
    "build": "npm run build -w packages/shared && npm run build -w backend && npm run build -w worker"
  }
}
```

**Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

**Step 3: Create shared package**

`packages/shared/package.json`:
```json
{
  "name": "@autosoftware/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:
```typescript
export * from "./types.js";
export * from "./constants.js";
```

**Step 4: Create backend package**

`backend/package.json`:
```json
{
  "name": "@autosoftware/backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@autosoftware/shared": "*"
  }
}
```

`backend/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

`backend/src/index.ts`:
```typescript
console.log("Backend starting...");
```

**Step 5: Create worker package**

`worker/package.json`:
```json
{
  "name": "@autosoftware/worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@autosoftware/shared": "*"
  }
}
```

`worker/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

`worker/src/index.ts`:
```typescript
console.log("Worker starting...");
```

**Step 6: Create .gitignore**

```
node_modules/
dist/
.env
*.log
.DS_Store
```

**Step 7: Create .env.example**

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/autosoftware
ANTHROPIC_API_KEY=sk-ant-xxx
SESSION_SECRET=change-me-to-random-string
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITLAB_CLIENT_ID=
GITLAB_CLIENT_SECRET=
BITBUCKET_CLIENT_ID=
BITBUCKET_CLIENT_SECRET=
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000
```

**Step 8: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: autosoftware
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

**Step 9: Install root dependencies and verify**

Run: `npm install`
Run: `docker compose up -d`
Expected: PostgreSQL running on port 5432

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with monorepo workspaces"
```

---

### Task 2: Database Schema (Prisma)

**Files:**
- Create: `prisma/schema.prisma`
- Modify: root `package.json` (add prisma dep)

**Step 1: Install Prisma**

Run: `npm install -D prisma && npm install @prisma/client`

**Step 2: Create Prisma schema**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum OAuthProvider {
  github
  gitlab
  bitbucket
}

enum RepoStatus {
  idle
  scanning
  error
}

enum TaskType {
  improvement
  bugfix
  feature
  refactor
  security
}

enum TaskPriority {
  low
  medium
  high
  critical
}

enum TaskStatus {
  pending
  in_progress
  completed
  failed
  cancelled
}

enum TaskSource {
  auto_scan
  manual
}

enum ScanStatus {
  completed
  failed
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  accounts     Account[]
  repositories Repository[]
  tasks        Task[]
}

model Account {
  id                String        @id @default(cuid())
  userId            String
  provider          OAuthProvider
  providerAccountId String
  accessToken       String
  refreshToken      String?
  scopes            String?
  expiresAt         DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Repository {
  id             String     @id @default(cuid())
  userId         String
  provider       OAuthProvider
  providerRepoId String
  fullName       String
  cloneUrl       String
  defaultBranch  String     @default("main")
  isActive       Boolean    @default(true)
  scanInterval   Int        @default(60)
  lastScannedAt  DateTime?
  status         RepoStatus @default(idle)
  settings       Json       @default("{}")
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  tasks       Task[]
  scanResults ScanResult[]

  @@unique([provider, providerRepoId])
}

model Task {
  id                String       @id @default(cuid())
  repositoryId      String
  userId            String
  title             String
  description       String
  type              TaskType     @default(improvement)
  priority          TaskPriority @default(medium)
  status            TaskStatus   @default(pending)
  source            TaskSource   @default(manual)
  agentSessionId    String?
  pullRequestUrl    String?
  pullRequestStatus String?
  metadata          Json         @default("{}")
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  completedAt       DateTime?

  repository Repository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ScanResult {
  id           String     @id @default(cuid())
  repositoryId String
  scannedAt    DateTime   @default(now())
  status       ScanStatus
  summary      String?
  tasksCreated Int        @default(0)
  analysisData Json       @default("{}")

  repository Repository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
}
```

**Step 3: Run migration**

Run: `cp .env.example .env` (then fill in DATABASE_URL)
Run: `npx prisma migrate dev --name init`
Expected: Migration created and applied

**Step 4: Generate client**

Run: `npx prisma generate`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema with all data models"
```

---

### Task 3: Shared Types Package

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/constants.ts`

**Step 1: Create shared types**

`packages/shared/src/types.ts`:
```typescript
export type OAuthProvider = "github" | "gitlab" | "bitbucket";
export type RepoStatus = "idle" | "scanning" | "error";
export type TaskType = "improvement" | "bugfix" | "feature" | "refactor" | "security";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";
export type TaskSource = "auto_scan" | "manual";
export type ScanStatus = "completed" | "failed";

export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  providers: OAuthProvider[];
}

export interface RepositoryDTO {
  id: string;
  provider: OAuthProvider;
  fullName: string;
  defaultBranch: string;
  isActive: boolean;
  scanInterval: number;
  lastScannedAt: string | null;
  status: RepoStatus;
}

export interface TaskDTO {
  id: string;
  repositoryId: string;
  repositoryName: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  source: TaskSource;
  pullRequestUrl: string | null;
  pullRequestStatus: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ScanResultDTO {
  id: string;
  repositoryId: string;
  scannedAt: string;
  status: ScanStatus;
  summary: string | null;
  tasksCreated: number;
}

export interface CreateTaskInput {
  repositoryId: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
}

export interface ConnectRepoInput {
  provider: OAuthProvider;
  providerRepoId: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch?: string;
}

export interface UpdateRepoInput {
  isActive?: boolean;
  scanInterval?: number;
  settings?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiError {
  data?: never;
  error: { message: string; code?: string };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;
```

**Step 2: Create constants**

`packages/shared/src/constants.ts`:
```typescript
export const JOB_NAMES = {
  REPO_SCAN: "repo-scan",
  TASK_EXECUTE: "task-execute",
} as const;

export const DEFAULT_SCAN_INTERVAL_MINUTES = 60;
export const DEFAULT_SCAN_BUDGET_USD = 2.0;
export const DEFAULT_TASK_BUDGET_USD = 10.0;
export const MAX_RETRIES = 3;

export const OAUTH_CONFIGS = {
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userUrl: "https://api.github.com/user",
    reposUrl: "https://api.github.com/user/repos",
    scopes: "repo,read:user,user:email",
  },
  gitlab: {
    authUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    userUrl: "https://gitlab.com/api/v4/user",
    reposUrl: "https://gitlab.com/api/v4/projects?membership=true",
    scopes: "api read_user read_repository",
  },
  bitbucket: {
    authUrl: "https://bitbucket.org/site/oauth2/authorize",
    tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
    userUrl: "https://api.bitbucket.org/2.0/user",
    reposUrl: "https://api.bitbucket.org/2.0/repositories/{username}",
    scopes: "repository account pullrequest:write",
  },
} as const;
```

**Step 3: Build shared package**

Run: `npm run build -w packages/shared`
Expected: `packages/shared/dist/` created with .js and .d.ts files

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add shared types and constants package"
```

---

### Task 4: Backend Core Setup

**Files:**
- Create: `backend/src/index.ts`
- Create: `backend/src/config.ts`
- Create: `backend/src/db.ts`
- Create: `backend/src/plugins/cors.ts`
- Create: `backend/src/plugins/session.ts`

**Step 1: Install backend dependencies**

Run in backend/:
```bash
cd backend && npm install fastify @fastify/cors @fastify/cookie @fastify/session @prisma/client dotenv connect-pg-simple pg-boss
```
```bash
npm install -D tsx @types/node @types/connect-pg-simple
```

**Step 2: Create config.ts**

`backend/src/config.ts`:
```typescript
import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  databaseUrl: process.env.DATABASE_URL!,
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  backendUrl: process.env.BACKEND_URL || "http://localhost:3000",
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  },
  gitlab: {
    clientId: process.env.GITLAB_CLIENT_ID || "",
    clientSecret: process.env.GITLAB_CLIENT_SECRET || "",
  },
  bitbucket: {
    clientId: process.env.BITBUCKET_CLIENT_ID || "",
    clientSecret: process.env.BITBUCKET_CLIENT_SECRET || "",
  },
};
```

**Step 3: Create db.ts**

`backend/src/db.ts`:
```typescript
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

**Step 4: Create Fastify server with plugins**

`backend/src/index.ts`:
```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { repoRoutes } from "./routes/repos.js";
import { taskRoutes } from "./routes/tasks.js";
import { scanRoutes } from "./routes/scans.js";
import { schedulerService } from "./services/scheduler.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: config.frontendUrl,
  credentials: true,
});

await app.register(cookie, {
  secret: config.sessionSecret,
  parseOptions: {},
});

// Simple cookie-based auth - store userId in signed cookie
app.decorateRequest("userId", "");
app.addHook("preHandler", async (request, reply) => {
  const token = request.cookies.session_token;
  if (token) {
    const unsigned = request.unsignCookie(token);
    if (unsigned.valid && unsigned.value) {
      request.userId = unsigned.value;
    }
  }
});

// Auth guard for protected routes
app.decorate("requireAuth", async (request: any, reply: any) => {
  if (!request.userId) {
    reply.code(401).send({ error: { message: "Unauthorized" } });
  }
});

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(repoRoutes, { prefix: "/api/repos" });
await app.register(taskRoutes, { prefix: "/api/tasks" });
await app.register(scanRoutes, { prefix: "/api/scans" });

app.get("/api/health", async () => ({ status: "ok" }));

await schedulerService.start();

await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`Backend running on port ${config.port}`);

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await schedulerService.stop();
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  });
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: backend core setup with Fastify, config, and DB"
```

---

### Task 5: Backend OAuth Routes

**Files:**
- Create: `backend/src/routes/auth.ts`
- Create: `backend/src/services/oauth.ts`

**Step 1: Create OAuth service**

`backend/src/services/oauth.ts`:
```typescript
import type { OAuthProvider } from "@autosoftware/shared";
import { config } from "../config.js";
import { OAUTH_CONFIGS } from "@autosoftware/shared";

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

interface OAuthUserInfo {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

function getClientCredentials(provider: OAuthProvider) {
  return {
    clientId: config[provider].clientId,
    clientSecret: config[provider].clientSecret,
  };
}

export function getAuthUrl(provider: OAuthProvider, state: string): string {
  const oauthConfig = OAUTH_CONFIGS[provider];
  const { clientId } = getClientCredentials(provider);
  const redirectUri = `${config.backendUrl}/api/auth/callback/${provider}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    ...(provider === "bitbucket"
      ? { response_type: "code" }
      : { response_type: "code", scope: oauthConfig.scopes }),
  });

  return `${oauthConfig.authUrl}?${params}`;
}

export async function exchangeCode(
  provider: OAuthProvider,
  code: string
): Promise<OAuthTokenResponse> {
  const oauthConfig = OAUTH_CONFIGS[provider];
  const { clientId, clientSecret } = getClientCredentials(provider);
  const redirectUri = `${config.backendUrl}/api/auth/callback/${provider}`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (provider === "bitbucket") {
    headers["Authorization"] =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  }

  const res = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  return res.json();
}

export async function getUserInfo(
  provider: OAuthProvider,
  accessToken: string
): Promise<OAuthUserInfo> {
  const oauthConfig = OAUTH_CONFIGS[provider];

  const res = await fetch(oauthConfig.userUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!res.ok) throw new Error("Failed to fetch user info");
  const data = await res.json();

  switch (provider) {
    case "github": {
      let email = data.email;
      if (!email) {
        const emailRes = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        });
        if (emailRes.ok) {
          const emails = await emailRes.json();
          const primary = emails.find((e: any) => e.primary);
          email = primary?.email || emails[0]?.email;
        }
      }
      return { id: String(data.id), email, name: data.name, avatarUrl: data.avatar_url };
    }
    case "gitlab":
      return { id: String(data.id), email: data.email, name: data.name, avatarUrl: data.avatar_url };
    case "bitbucket":
      return {
        id: data.account_id || data.uuid,
        email: data.email || `${data.username}@bitbucket.org`,
        name: data.display_name,
        avatarUrl: data.links?.avatar?.href || null,
      };
  }
}
```

**Step 2: Create auth routes**

`backend/src/routes/auth.ts`:
```typescript
import type { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { getAuthUrl, exchangeCode, getUserInfo } from "../services/oauth.js";
import type { OAuthProvider } from "@autosoftware/shared";

const validProviders = new Set(["github", "gitlab", "bitbucket"]);

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { provider: string } }>(
    "/login/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      if (!validProviders.has(provider)) {
        return reply.code(400).send({ error: { message: "Invalid provider" } });
      }

      const state = crypto.randomBytes(16).toString("hex");
      reply.setCookie("oauth_state", state, {
        path: "/",
        httpOnly: true,
        signed: true,
        maxAge: 600,
      });

      const url = getAuthUrl(provider as OAuthProvider, state);
      return reply.redirect(url);
    }
  );

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string } }>(
    "/callback/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      const { code, state } = request.query;

      if (!validProviders.has(provider) || !code || !state) {
        return reply.redirect(`${config.frontendUrl}/login?error=invalid_request`);
      }

      const savedState = request.unsignCookie(request.cookies.oauth_state || "");
      if (!savedState.valid || savedState.value !== state) {
        return reply.redirect(`${config.frontendUrl}/login?error=invalid_state`);
      }

      try {
        const tokens = await exchangeCode(provider as OAuthProvider, code);
        const userInfo = await getUserInfo(provider as OAuthProvider, tokens.access_token);

        // Upsert user
        const user = await prisma.user.upsert({
          where: { email: userInfo.email },
          create: {
            email: userInfo.email,
            name: userInfo.name,
            avatarUrl: userInfo.avatarUrl,
          },
          update: {
            name: userInfo.name || undefined,
            avatarUrl: userInfo.avatarUrl || undefined,
          },
        });

        // Upsert account
        await prisma.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: provider as OAuthProvider,
              providerAccountId: userInfo.id,
            },
          },
          create: {
            userId: user.id,
            provider: provider as OAuthProvider,
            providerAccountId: userInfo.id,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            expiresAt: tokens.expires_in
              ? new Date(Date.now() + tokens.expires_in * 1000)
              : null,
          },
          update: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || undefined,
            expiresAt: tokens.expires_in
              ? new Date(Date.now() + tokens.expires_in * 1000)
              : undefined,
          },
        });

        reply.clearCookie("oauth_state", { path: "/" });
        reply.setCookie("session_token", user.id, {
          path: "/",
          httpOnly: true,
          signed: true,
          maxAge: 60 * 60 * 24 * 30, // 30 days
          sameSite: "lax",
        });

        return reply.redirect(`${config.frontendUrl}/dashboard`);
      } catch (err) {
        app.log.error(err);
        return reply.redirect(`${config.frontendUrl}/login?error=auth_failed`);
      }
    }
  );

  app.get("/me", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      include: { accounts: { select: { provider: true } } },
    });

    if (!user) {
      return reply.code(401).send({ error: { message: "User not found" } });
    }

    return {
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        providers: user.accounts.map((a) => a.provider),
      },
    };
  });

  app.post("/logout", async (request, reply) => {
    reply.clearCookie("session_token", { path: "/" });
    return { data: { success: true } };
  });
};
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: OAuth routes for GitHub, GitLab, Bitbucket"
```

---

### Task 6: Backend Repository & Task Routes

**Files:**
- Create: `backend/src/routes/repos.ts`
- Create: `backend/src/routes/tasks.ts`
- Create: `backend/src/routes/scans.ts`
- Create: `backend/src/services/git-providers.ts`

**Step 1: Create git providers service**

`backend/src/services/git-providers.ts`:
```typescript
import type { OAuthProvider } from "@autosoftware/shared";

interface ProviderRepo {
  id: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  description: string | null;
  isPrivate: boolean;
}

export async function listRemoteRepos(
  provider: OAuthProvider,
  accessToken: string
): Promise<ProviderRepo[]> {
  switch (provider) {
    case "github": {
      const res = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100",
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
      );
      if (!res.ok) throw new Error("Failed to fetch GitHub repos");
      const data = await res.json();
      return data.map((r: any) => ({
        id: String(r.id),
        fullName: r.full_name,
        cloneUrl: r.clone_url,
        defaultBranch: r.default_branch || "main",
        description: r.description,
        isPrivate: r.private,
      }));
    }
    case "gitlab": {
      const res = await fetch(
        "https://gitlab.com/api/v4/projects?membership=true&order_by=last_activity_at&per_page=100",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch GitLab repos");
      const data = await res.json();
      return data.map((r: any) => ({
        id: String(r.id),
        fullName: r.path_with_namespace,
        cloneUrl: r.http_url_to_repo,
        defaultBranch: r.default_branch || "main",
        description: r.description,
        isPrivate: r.visibility === "private",
      }));
    }
    case "bitbucket": {
      const userRes = await fetch("https://api.bitbucket.org/2.0/user", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) throw new Error("Failed to fetch Bitbucket user");
      const user = await userRes.json();
      const username = user.username;

      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${username}?pagelen=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch Bitbucket repos");
      const data = await res.json();
      return (data.values || []).map((r: any) => ({
        id: r.uuid,
        fullName: r.full_name,
        cloneUrl: r.links?.clone?.find((c: any) => c.name === "https")?.href || "",
        defaultBranch: r.mainbranch?.name || "main",
        description: r.description,
        isPrivate: r.is_private,
      }));
    }
  }
}

export async function createPullRequest(
  provider: OAuthProvider,
  accessToken: string,
  repoFullName: string,
  opts: { title: string; body: string; head: string; base: string }
): Promise<{ url: string }> {
  switch (provider) {
    case "github": {
      const res = await fetch(`https://api.github.com/repos/${repoFullName}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: opts.title, body: opts.body, head: opts.head, base: opts.base }),
      });
      if (!res.ok) throw new Error(`GitHub PR creation failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.html_url };
    }
    case "gitlab": {
      const projectId = encodeURIComponent(repoFullName);
      const res = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/merge_requests`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: opts.title,
          description: opts.body,
          source_branch: opts.head,
          target_branch: opts.base,
        }),
      });
      if (!res.ok) throw new Error(`GitLab MR creation failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.web_url };
    }
    case "bitbucket": {
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${repoFullName}/pullrequests`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: opts.title,
            description: opts.body,
            source: { branch: { name: opts.head } },
            destination: { branch: { name: opts.base } },
          }),
        }
      );
      if (!res.ok) throw new Error(`Bitbucket PR creation failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.links?.html?.href || "" };
    }
  }
}
```

**Step 2: Create repo routes**

`backend/src/routes/repos.ts`:
```typescript
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { listRemoteRepos } from "../services/git-providers.js";
import { schedulerService } from "../services/scheduler.js";
import type { ConnectRepoInput, UpdateRepoInput, OAuthProvider } from "@autosoftware/shared";

export const repoRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // List connected repos
  app.get("/", async (request) => {
    const repos = await prisma.repository.findMany({
      where: { userId: request.userId },
      orderBy: { updatedAt: "desc" },
    });
    return { data: repos };
  });

  // List available remote repos from a provider
  app.get<{ Params: { provider: string } }>(
    "/available/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      const account = await prisma.account.findFirst({
        where: { userId: request.userId, provider: provider as OAuthProvider },
      });
      if (!account) {
        return reply.code(404).send({ error: { message: "Provider not connected" } });
      }
      const repos = await listRemoteRepos(provider as OAuthProvider, account.accessToken);
      return { data: repos };
    }
  );

  // Connect a repo
  app.post<{ Body: ConnectRepoInput }>("/", async (request, reply) => {
    const { provider, providerRepoId, fullName, cloneUrl, defaultBranch } = request.body;

    const existing = await prisma.repository.findUnique({
      where: { provider_providerRepoId: { provider, providerRepoId } },
    });
    if (existing) {
      return reply.code(409).send({ error: { message: "Repository already connected" } });
    }

    const repo = await prisma.repository.create({
      data: {
        userId: request.userId,
        provider,
        providerRepoId,
        fullName,
        cloneUrl,
        defaultBranch: defaultBranch || "main",
      },
    });

    // Schedule scanning
    await schedulerService.scheduleRepoScan(repo.id, repo.scanInterval);

    return reply.code(201).send({ data: repo });
  });

  // Update repo settings
  app.patch<{ Params: { id: string }; Body: UpdateRepoInput }>(
    "/:id",
    async (request, reply) => {
      const repo = await prisma.repository.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

      const updated = await prisma.repository.update({
        where: { id: repo.id },
        data: request.body,
      });

      if (request.body.scanInterval !== undefined || request.body.isActive !== undefined) {
        if (updated.isActive) {
          await schedulerService.scheduleRepoScan(updated.id, updated.scanInterval);
        } else {
          await schedulerService.cancelRepoScan(updated.id);
        }
      }

      return { data: updated };
    }
  );

  // Delete/disconnect repo
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    await schedulerService.cancelRepoScan(repo.id);
    await prisma.repository.delete({ where: { id: repo.id } });
    return { data: { success: true } };
  });

  // Trigger manual scan
  app.post<{ Params: { id: string } }>("/:id/scan", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    await schedulerService.triggerScan(repo.id);
    return { data: { queued: true } };
  });

  // Get scan results for a repo
  app.get<{ Params: { id: string } }>("/:id/scans", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    const scans = await prisma.scanResult.findMany({
      where: { repositoryId: repo.id },
      orderBy: { scannedAt: "desc" },
      take: 20,
    });
    return { data: scans };
  });
};
```

**Step 3: Create task routes**

`backend/src/routes/tasks.ts`:
```typescript
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { schedulerService } from "../services/scheduler.js";
import type { CreateTaskInput, UpdateTaskInput } from "@autosoftware/shared";

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  app.get<{
    Querystring: {
      repositoryId?: string;
      status?: string;
      type?: string;
      priority?: string;
    };
  }>("/", async (request) => {
    const { repositoryId, status, type, priority } = request.query;
    const where: any = { userId: request.userId };
    if (repositoryId) where.repositoryId = repositoryId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (priority) where.priority = priority;

    const tasks = await prisma.task.findMany({
      where,
      include: { repository: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: tasks.map((t) => ({
        ...t,
        repositoryName: t.repository.fullName,
        repository: undefined,
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: { repository: { select: { fullName: true } } },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });
    return { data: { ...task, repositoryName: task.repository.fullName } };
  });

  app.post<{ Body: CreateTaskInput }>("/", async (request, reply) => {
    const { repositoryId, title, description, type, priority } = request.body;

    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    const task = await prisma.task.create({
      data: {
        repositoryId,
        userId: request.userId,
        title,
        description,
        type,
        priority,
        source: "manual",
      },
    });

    // Queue for execution
    await schedulerService.queueTaskExecution(task.id);

    return reply.code(201).send({ data: task });
  });

  app.patch<{ Params: { id: string }; Body: UpdateTaskInput }>(
    "/:id",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: request.body,
      });
      return { data: updated };
    }
  );

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "cancelled" },
    });
    return { data: { success: true } };
  });
};
```

**Step 4: Create scan routes**

`backend/src/routes/scans.ts`:
```typescript
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const scan = await prisma.scanResult.findUnique({
      where: { id: request.params.id },
      include: { repository: { select: { userId: true } } },
    });
    if (!scan || scan.repository.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Scan not found" } });
    }
    return { data: scan };
  });
};
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: backend routes for repos, tasks, and scans"
```

---

### Task 7: Backend Scheduler Service (pg-boss)

**Files:**
- Create: `backend/src/services/scheduler.ts`

**Step 1: Create scheduler service**

`backend/src/services/scheduler.ts`:
```typescript
import PgBoss from "pg-boss";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { JOB_NAMES } from "@autosoftware/shared";

let boss: PgBoss;

export const schedulerService = {
  async start() {
    boss = new PgBoss(config.databaseUrl);
    await boss.start();
    console.log("pg-boss scheduler started");

    // Re-schedule all active repos on startup
    const activeRepos = await prisma.repository.findMany({
      where: { isActive: true },
    });
    for (const repo of activeRepos) {
      await this.scheduleRepoScan(repo.id, repo.scanInterval);
    }
  },

  async stop() {
    if (boss) await boss.stop();
  },

  async scheduleRepoScan(repoId: string, intervalMinutes: number) {
    const scheduleId = `scan-${repoId}`;
    // Remove existing schedule if any
    await boss.unschedule(scheduleId).catch(() => {});

    await boss.schedule(
      scheduleId,
      `*/${intervalMinutes} * * * *`,
      { repoId },
      { name: JOB_NAMES.REPO_SCAN }
    );
    console.log(`Scheduled scan for repo ${repoId} every ${intervalMinutes} minutes`);
  },

  async cancelRepoScan(repoId: string) {
    const scheduleId = `scan-${repoId}`;
    await boss.unschedule(scheduleId).catch(() => {});
  },

  async triggerScan(repoId: string) {
    await boss.send(JOB_NAMES.REPO_SCAN, { repoId }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInMinutes: 30,
    });
  },

  async queueTaskExecution(taskId: string) {
    await boss.send(JOB_NAMES.TASK_EXECUTE, { taskId }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInMinutes: 60,
    });
  },

  getBoss() {
    return boss;
  },
};
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: pg-boss scheduler for repo scans and task execution"
```

---

### Task 8: Worker Core + Repo Scanner

**Files:**
- Create: `worker/src/index.ts`
- Create: `worker/src/config.ts`
- Create: `worker/src/handlers/scan.ts`
- Create: `worker/src/services/repo-manager.ts`

**Step 1: Install worker dependencies**

```bash
cd worker && npm install @anthropic-ai/claude-agent-sdk @prisma/client pg-boss dotenv simple-git
npm install -D tsx @types/node
```

**Step 2: Create worker config**

`worker/src/config.ts`:
```typescript
import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  workDir: process.env.WORK_DIR || "/tmp/autosoftware-workspaces",
  defaultScanBudget: parseFloat(process.env.DEFAULT_SCAN_BUDGET || "2.0"),
  defaultTaskBudget: parseFloat(process.env.DEFAULT_TASK_BUDGET || "10.0"),
};
```

**Step 3: Create repo manager**

`worker/src/services/repo-manager.ts`:
```typescript
import { simpleGit } from "simple-git";
import { mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { config } from "../config.js";

export async function cloneOrPullRepo(
  repoId: string,
  cloneUrl: string,
  accessToken: string,
  provider: string
): Promise<string> {
  const repoDir = path.join(config.workDir, "repos", repoId);
  await mkdir(path.dirname(repoDir), { recursive: true });

  // Inject token into clone URL
  let authedUrl = cloneUrl;
  if (provider === "github" || provider === "gitlab") {
    authedUrl = cloneUrl.replace("https://", `https://oauth2:${accessToken}@`);
  } else if (provider === "bitbucket") {
    authedUrl = cloneUrl.replace("https://", `https://x-token-auth:${accessToken}@`);
  }

  const git = simpleGit();

  if (existsSync(path.join(repoDir, ".git"))) {
    // Pull latest
    const repoGit = simpleGit(repoDir);
    await repoGit.pull();
  } else {
    await git.clone(authedUrl, repoDir);
  }

  return repoDir;
}

export async function createWorktree(
  repoDir: string,
  branchName: string
): Promise<string> {
  const worktreeDir = path.join(config.workDir, "worktrees", branchName);
  await mkdir(path.dirname(worktreeDir), { recursive: true });

  const git = simpleGit(repoDir);
  await git.raw(["worktree", "add", "-b", branchName, worktreeDir]);

  return worktreeDir;
}

export async function cleanupWorktree(repoDir: string, worktreeDir: string) {
  try {
    const git = simpleGit(repoDir);
    await git.raw(["worktree", "remove", worktreeDir, "--force"]);
  } catch {
    // Force remove directory if worktree remove fails
    await rm(worktreeDir, { recursive: true, force: true });
  }
}
```

**Step 4: Create scan handler**

`worker/src/handlers/scan.ts`:
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { PrismaClient } from "@prisma/client";
import { cloneOrPullRepo } from "../services/repo-manager.js";
import { config } from "../config.js";

const prisma = new PrismaClient();

interface ScanTask {
  title: string;
  description: string;
  type: "improvement" | "bugfix" | "feature" | "refactor" | "security";
  priority: "low" | "medium" | "high" | "critical";
}

export async function handleRepoScan(job: { data: { repoId: string } }) {
  const { repoId } = job.data;
  console.log(`Starting scan for repo ${repoId}`);

  const repo = await prisma.repository.findUnique({
    where: { id: repoId },
    include: {
      user: {
        include: { accounts: true },
      },
    },
  });

  if (!repo || !repo.isActive) {
    console.log(`Repo ${repoId} not found or inactive, skipping scan`);
    return;
  }

  const account = repo.user.accounts.find((a) => a.provider === repo.provider);
  if (!account) {
    console.error(`No account found for provider ${repo.provider}`);
    return;
  }

  // Mark as scanning
  await prisma.repository.update({
    where: { id: repoId },
    data: { status: "scanning" },
  });

  let scanResult;

  try {
    // Clone or pull the repo
    const repoDir = await cloneOrPullRepo(
      repoId,
      repo.cloneUrl,
      account.accessToken,
      repo.provider
    );

    // Run Claude Agent SDK to analyze the repo
    let analysisText = "";

    for await (const message of query({
      prompt: `You are a senior software engineer performing a code review and analysis of this repository.

Analyze the codebase thoroughly and identify actionable improvements. Look for:
1. **Security vulnerabilities** - SQL injection, XSS, hardcoded secrets, insecure dependencies
2. **Bugs** - Logic errors, race conditions, unhandled edge cases, null pointer issues
3. **Performance issues** - N+1 queries, memory leaks, unnecessary computations, missing indexes
4. **Code quality** - Dead code, duplicated logic, overly complex functions, missing error handling
5. **Missing tests** - Untested critical paths, low coverage areas
6. **Refactoring opportunities** - Functions that are too long, unclear naming, architectural improvements

For each finding, provide a clear, actionable task. Be specific about which files and what changes are needed.

IMPORTANT: Respond with ONLY a JSON array of tasks. Each task must have these fields:
- title: Short, descriptive title (max 100 chars)
- description: Detailed description of what to do, including file paths and specific changes
- type: One of "security", "bugfix", "improvement", "refactor", "feature"
- priority: One of "critical", "high", "medium", "low"

Example response format:
[
  {
    "title": "Fix SQL injection in user search endpoint",
    "description": "In src/routes/users.ts line 45, the search query uses string interpolation...",
    "type": "security",
    "priority": "critical"
  }
]

Respond with ONLY the JSON array, no other text.`,
      options: {
        allowedTools: ["Read", "Glob", "Grep", "Bash", "WebSearch", "WebFetch", "Agent"],
        permissionMode: "bypassPermissions",
        maxTurns: 25,
        maxBudgetUsd: config.defaultScanBudget,
        cwd: repoDir,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        analysisText = message.result;
      }
    }

    // Parse the analysis into tasks
    let tasks: ScanTask[] = [];
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        tasks = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("Failed to parse scan results:", parseErr);
    }

    // Create tasks in DB
    let tasksCreated = 0;
    for (const task of tasks) {
      await prisma.task.create({
        data: {
          repositoryId: repoId,
          userId: repo.userId,
          title: task.title,
          description: task.description,
          type: task.type,
          priority: task.priority,
          source: "auto_scan",
        },
      });
      tasksCreated++;
    }

    // Save scan result
    scanResult = await prisma.scanResult.create({
      data: {
        repositoryId: repoId,
        status: "completed",
        summary: `Found ${tasksCreated} potential improvements`,
        tasksCreated,
        analysisData: { rawAnalysis: analysisText, tasks },
      },
    });

    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "idle", lastScannedAt: new Date() },
    });

    console.log(`Scan complete for ${repo.fullName}: ${tasksCreated} tasks created`);
  } catch (err) {
    console.error(`Scan failed for repo ${repoId}:`, err);

    await prisma.scanResult.create({
      data: {
        repositoryId: repoId,
        status: "failed",
        summary: err instanceof Error ? err.message : "Unknown error",
        analysisData: {},
      },
    });

    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "error" },
    });

    throw err; // Let pg-boss handle retries
  }
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: worker repo scanner with Claude Agent SDK"
```

---

### Task 9: Worker Task Executor + PR Creator

**Files:**
- Create: `worker/src/handlers/execute.ts`

**Step 1: Create task execution handler**

`worker/src/handlers/execute.ts`:
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { PrismaClient } from "@prisma/client";
import { simpleGit } from "simple-git";
import { cloneOrPullRepo, createWorktree, cleanupWorktree } from "../services/repo-manager.js";
import { createPullRequest } from "./pr-creator.js";
import { config } from "../config.js";

const prisma = new PrismaClient();

export async function handleTaskExecution(job: { data: { taskId: string } }) {
  const { taskId } = job.data;
  console.log(`Starting execution for task ${taskId}`);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      repository: {
        include: {
          user: { include: { accounts: true } },
        },
      },
    },
  });

  if (!task || task.status === "cancelled") {
    console.log(`Task ${taskId} not found or cancelled, skipping`);
    return;
  }

  const repo = task.repository;
  const account = repo.user.accounts.find((a) => a.provider === repo.provider);
  if (!account) {
    throw new Error(`No account found for provider ${repo.provider}`);
  }

  // Mark task as in progress
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "in_progress" },
  });

  const branchName = `autosoftware/${task.type}/${taskId.slice(0, 8)}`;
  let worktreeDir: string | null = null;
  let repoDir: string | null = null;

  try {
    // Clone/pull the repo
    repoDir = await cloneOrPullRepo(
      repo.id,
      repo.cloneUrl,
      account.accessToken,
      repo.provider
    );

    // Create an isolated worktree
    worktreeDir = await createWorktree(repoDir, branchName);

    // Run Claude Agent SDK to implement the task
    let resultText = "";
    let sessionId: string | undefined;

    for await (const message of query({
      prompt: `You are an expert software engineer. Implement the following task in this codebase:

## Task: ${task.title}

${task.description}

## Instructions:
1. Read the relevant files to understand the current codebase
2. Plan your changes carefully
3. Implement the changes with clean, well-structured code
4. Run any existing tests to make sure nothing is broken: look for test scripts in package.json, Makefile, etc.
5. If you created new functionality, add tests for it
6. Make sure the code compiles/lints if the project has those checks
7. Commit your changes with a clear, descriptive commit message

## Rules:
- Follow existing code style and conventions
- Don't break existing functionality
- Write clean, readable code
- Add comments only where the logic is non-obvious
- If you encounter issues, fix them and continue`,
      options: {
        allowedTools: [
          "Read", "Edit", "Write", "Bash", "Glob", "Grep",
          "WebSearch", "WebFetch", "Agent",
        ],
        permissionMode: "bypassPermissions",
        maxTurns: 60,
        maxBudgetUsd: config.defaultTaskBudget,
        cwd: worktreeDir,
      },
    })) {
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
      }
      if (message.type === "result") {
        if (message.subtype === "success") {
          resultText = message.result;
        } else {
          throw new Error(`Agent stopped: ${message.subtype}`);
        }
      }
    }

    // Check if any commits were made
    const git = simpleGit(worktreeDir);
    const log = await git.log({ maxCount: 5 });

    if (log.total === 0) {
      throw new Error("Agent did not make any commits");
    }

    // Push the branch
    await git.push("origin", branchName, ["--set-upstream"]);

    // Create PR
    const pr = await createPullRequest(
      repo.provider,
      account.accessToken,
      repo.fullName,
      {
        title: `[AutoSoftware] ${task.title}`,
        body: `## Automated Changes\n\n${task.description}\n\n---\n\n### Agent Summary\n\n${resultText}\n\n---\n*Generated by AutoSoftware*`,
        head: branchName,
        base: repo.defaultBranch,
      }
    );

    // Update task with success
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "completed",
        completedAt: new Date(),
        pullRequestUrl: pr.url,
        pullRequestStatus: "open",
        agentSessionId: sessionId,
        metadata: {
          resultSummary: resultText,
          branch: branchName,
          commits: log.all.map((c) => ({ hash: c.hash, message: c.message })),
        },
      },
    });

    console.log(`Task ${taskId} completed. PR: ${pr.url}`);
  } catch (err) {
    console.error(`Task ${taskId} failed:`, err);

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "failed",
        metadata: {
          error: err instanceof Error ? err.message : "Unknown error",
          branch: branchName,
        },
      },
    });

    throw err; // Let pg-boss retry
  } finally {
    // Cleanup worktree
    if (repoDir && worktreeDir) {
      await cleanupWorktree(repoDir, worktreeDir).catch(() => {});
    }
  }
}
```

**Step 2: Extract PR creator (re-export from shared service)**

`worker/src/handlers/pr-creator.ts`:
```typescript
import type { OAuthProvider } from "@autosoftware/shared";

export async function createPullRequest(
  provider: OAuthProvider,
  accessToken: string,
  repoFullName: string,
  opts: { title: string; body: string; head: string; base: string }
): Promise<{ url: string }> {
  switch (provider) {
    case "github": {
      const res = await fetch(`https://api.github.com/repos/${repoFullName}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: opts.title,
          body: opts.body,
          head: opts.head,
          base: opts.base,
        }),
      });
      if (!res.ok) throw new Error(`GitHub PR failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.html_url };
    }
    case "gitlab": {
      const projectId = encodeURIComponent(repoFullName);
      const res = await fetch(
        `https://gitlab.com/api/v4/projects/${projectId}/merge_requests`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: opts.title,
            description: opts.body,
            source_branch: opts.head,
            target_branch: opts.base,
          }),
        }
      );
      if (!res.ok) throw new Error(`GitLab MR failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.web_url };
    }
    case "bitbucket": {
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${repoFullName}/pullrequests`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: opts.title,
            description: opts.body,
            source: { branch: { name: opts.head } },
            destination: { branch: { name: opts.base } },
          }),
        }
      );
      if (!res.ok) throw new Error(`Bitbucket PR failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.links?.html?.href || "" };
    }
  }
}
```

**Step 3: Wire up worker main entry**

`worker/src/index.ts`:
```typescript
import PgBoss from "pg-boss";
import { config } from "./config.js";
import { handleRepoScan } from "./handlers/scan.js";
import { handleTaskExecution } from "./handlers/execute.js";
import { JOB_NAMES } from "@autosoftware/shared";
import { mkdir } from "fs/promises";

// Ensure work directories exist
await mkdir(config.workDir, { recursive: true });

const boss = new PgBoss(config.databaseUrl);

boss.on("error", (err) => console.error("pg-boss error:", err));

await boss.start();
console.log("Worker started, listening for jobs...");

// Register handlers
await boss.work(JOB_NAMES.REPO_SCAN, { teamConcurrency: 2 }, handleRepoScan as any);
await boss.work(JOB_NAMES.TASK_EXECUTE, { teamConcurrency: 1 }, handleTaskExecution as any);

console.log(`Registered handlers for: ${JOB_NAMES.REPO_SCAN}, ${JOB_NAMES.TASK_EXECUTE}`);

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down worker...`);
    await boss.stop();
    process.exit(0);
  });
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: worker task executor and PR creator with Agent SDK"
```

---

### Task 10: Frontend Scaffolding

**Files:**
- Scaffold: `frontend/` via Vite

**Step 1: Create Vite React app**

Run from project root:
```bash
npm create vite@latest frontend -- --template react-ts
```

**Step 2: Install frontend dependencies**

```bash
cd frontend
npm install react-router-dom @tanstack/react-query lucide-react clsx tailwind-merge
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Configure Tailwind**

Update `frontend/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
```

Update `frontend/src/index.css`:
```css
@import "tailwindcss";
```

**Step 4: Create API client**

`frontend/src/lib/api.ts`:
```typescript
const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Request failed");
  return data.data;
}

export const api = {
  auth: {
    me: () => request<any>("/auth/me"),
    logout: () => request<any>("/auth/logout", { method: "POST" }),
  },
  repos: {
    list: () => request<any[]>("/repos"),
    available: (provider: string) => request<any[]>(`/repos/available/${provider}`),
    connect: (body: any) => request<any>("/repos", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) =>
      request<any>(`/repos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/repos/${id}`, { method: "DELETE" }),
    scan: (id: string) => request<any>(`/repos/${id}/scan`, { method: "POST" }),
    scans: (id: string) => request<any[]>(`/repos/${id}/scans`),
  },
  tasks: {
    list: (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return request<any[]>(`/tasks${qs}`);
    },
    get: (id: string) => request<any>(`/tasks/${id}`),
    create: (body: any) => request<any>("/tasks", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) =>
      request<any>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/tasks/${id}`, { method: "DELETE" }),
  },
  scans: {
    get: (id: string) => request<any>(`/scans/${id}`),
  },
};
```

**Step 5: Create auth context**

`frontend/src/lib/auth.tsx`:
```typescript
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "./api";

interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  providers: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: frontend scaffolding with Vite, Tailwind, API client, auth"
```

---

### Task 11: Frontend Pages - Login & Layout

**Files:**
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/components/Layout.tsx`

**Step 1: Create Login page**

`frontend/src/pages/Login.tsx`:
```tsx
import { Github } from "lucide-react";

export function Login() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-white text-center mb-2">AutoSoftware</h1>
        <p className="text-zinc-400 text-center mb-8">
          Automated code analysis and improvement
        </p>

        <div className="space-y-3">
          <a
            href="/api/auth/login/github"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
          >
            <Github size={20} />
            Continue with GitHub
          </a>
          <a
            href="/api/auth/login/gitlab"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" />
            </svg>
            Continue with GitLab
          </a>
          <a
            href="/api/auth/login/bitbucket"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M.778 1.213a.768.768 0 00-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 00.77-.646l3.27-20.03a.768.768 0 00-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z" />
            </svg>
            Continue with Bitbucket
          </a>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create Layout component**

`frontend/src/components/Layout.tsx`:
```tsx
import { Link, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { LayoutDashboard, GitFork, ListTodo, Settings, LogOut } from "lucide-react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/repos", label: "Repositories", icon: GitFork },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white">AutoSoftware</h1>
        </div>

        <nav className="flex-1 px-3">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                  active
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-3">
            {user?.avatarUrl && (
              <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{user?.name || user?.email}</p>
            </div>
            <button onClick={logout} className="text-zinc-400 hover:text-white">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

**Step 3: Create App with routing**

`frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Repos } from "./pages/Repos";
import { Tasks } from "./pages/Tasks";
import { TaskDetail } from "./pages/TaskDetail";
import { SettingsPage } from "./pages/Settings";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/repos" element={<Repos />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: frontend login, layout, and routing"
```

---

### Task 12: Frontend Dashboard Page

**Files:**
- Create: `frontend/src/pages/Dashboard.tsx`

**Step 1: Create Dashboard**

`frontend/src/pages/Dashboard.tsx`:
```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { GitFork, ListTodo, CheckCircle, AlertCircle, Clock, Loader2 } from "lucide-react";

export function Dashboard() {
  const { data: repos } = useQuery({ queryKey: ["repos"], queryFn: api.repos.list });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });

  const stats = {
    totalRepos: repos?.length || 0,
    activeScans: repos?.filter((r: any) => r.status === "scanning").length || 0,
    pendingTasks: tasks?.filter((t: any) => t.status === "pending").length || 0,
    inProgress: tasks?.filter((t: any) => t.status === "in_progress").length || 0,
    completed: tasks?.filter((t: any) => t.status === "completed").length || 0,
    failed: tasks?.filter((t: any) => t.status === "failed").length || 0,
  };

  const recentTasks = (tasks || []).slice(0, 10);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Repositories", value: stats.totalRepos, icon: GitFork, color: "text-blue-400" },
          { label: "Pending Tasks", value: stats.pendingTasks, icon: Clock, color: "text-yellow-400" },
          { label: "In Progress", value: stats.inProgress, icon: Loader2, color: "text-purple-400" },
          { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-green-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className={color} />
              <span className="text-sm text-zinc-400">{label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent Tasks */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-white font-medium">Recent Tasks</h3>
          <Link to="/tasks" className="text-sm text-blue-400 hover:text-blue-300">
            View all
          </Link>
        </div>
        <div className="divide-y divide-zinc-800">
          {recentTasks.length === 0 ? (
            <p className="px-4 py-8 text-center text-zinc-500">No tasks yet. Connect a repository to get started.</p>
          ) : (
            recentTasks.map((task: any) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors"
              >
                {task.status === "completed" ? (
                  <CheckCircle size={16} className="text-green-400" />
                ) : task.status === "failed" ? (
                  <AlertCircle size={16} className="text-red-400" />
                ) : task.status === "in_progress" ? (
                  <Loader2 size={16} className="text-purple-400 animate-spin" />
                ) : (
                  <Clock size={16} className="text-yellow-400" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{task.title}</p>
                  <p className="text-xs text-zinc-500">{task.repositoryName}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  task.priority === "critical" ? "bg-red-500/20 text-red-400" :
                  task.priority === "high" ? "bg-orange-500/20 text-orange-400" :
                  task.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-zinc-700 text-zinc-400"
                }`}>
                  {task.priority}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: frontend dashboard with stats and recent tasks"
```

---

### Task 13: Frontend Repos Page

**Files:**
- Create: `frontend/src/pages/Repos.tsx`

**Step 1: Create Repos page**

`frontend/src/pages/Repos.tsx`:
```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  GitFork, Plus, Scan, Trash2, ToggleLeft, ToggleRight, Loader2, Check,
} from "lucide-react";

export function Repos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showConnect, setShowConnect] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  const { data: repos, isLoading } = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos.list,
  });

  const { data: availableRepos, isLoading: loadingAvailable } = useQuery({
    queryKey: ["available-repos", selectedProvider],
    queryFn: () => api.repos.available(selectedProvider),
    enabled: !!selectedProvider,
  });

  const connectMutation = useMutation({
    mutationFn: api.repos.connect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
    },
  });

  const scanMutation = useMutation({
    mutationFn: (id: string) => api.repos.scan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.repos.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: api.repos.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });

  const connectedIds = new Set((repos || []).map((r: any) => `${r.provider}:${r.providerRepoId}`));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Repositories</h2>
        <button
          onClick={() => setShowConnect(!showConnect)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          <Plus size={16} />
          Connect Repository
        </button>
      </div>

      {/* Connect Panel */}
      {showConnect && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="flex gap-2 mb-4">
            {(user?.providers || []).map((p: string) => (
              <button
                key={p}
                onClick={() => setSelectedProvider(p)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedProvider === p
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {loadingAvailable && <p className="text-zinc-400 text-sm">Loading repositories...</p>}

          {availableRepos && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {availableRepos.map((repo: any) => {
                const isConnected = connectedIds.has(`${selectedProvider}:${repo.id}`);
                return (
                  <div
                    key={repo.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800"
                  >
                    <div>
                      <p className="text-sm text-white">{repo.fullName}</p>
                      <p className="text-xs text-zinc-500">{repo.description || "No description"}</p>
                    </div>
                    {isConnected ? (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <Check size={14} /> Connected
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          connectMutation.mutate({
                            provider: selectedProvider as any,
                            providerRepoId: repo.id,
                            fullName: repo.fullName,
                            cloneUrl: repo.cloneUrl,
                            defaultBranch: repo.defaultBranch,
                          })
                        }
                        className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Connected Repos List */}
      {isLoading ? (
        <p className="text-zinc-400">Loading...</p>
      ) : (repos || []).length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <GitFork size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-400">No repositories connected yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(repos || []).map((repo: any) => (
            <div
              key={repo.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4"
            >
              <GitFork size={20} className="text-zinc-400" />
              <div className="flex-1">
                <p className="text-white font-medium">{repo.fullName}</p>
                <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                  <span>{repo.provider}</span>
                  <span>Scan every {repo.scanInterval}m</span>
                  {repo.lastScannedAt && (
                    <span>Last scan: {new Date(repo.lastScannedAt).toLocaleString()}</span>
                  )}
                  {repo.status === "scanning" && (
                    <span className="text-purple-400 flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Scanning
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => scanMutation.mutate(repo.id)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Trigger scan"
                >
                  <Scan size={16} />
                </button>
                <button
                  onClick={() =>
                    toggleMutation.mutate({ id: repo.id, isActive: !repo.isActive })
                  }
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  title={repo.isActive ? "Pause scanning" : "Resume scanning"}
                >
                  {repo.isActive ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
                </button>
                <button
                  onClick={() => {
                    if (confirm("Disconnect this repository?")) deleteMutation.mutate(repo.id);
                  }}
                  className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Disconnect"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: frontend repositories page with connect/manage"
```

---

### Task 14: Frontend Tasks & Task Detail Pages

**Files:**
- Create: `frontend/src/pages/Tasks.tsx`
- Create: `frontend/src/pages/TaskDetail.tsx`
- Create: `frontend/src/pages/Settings.tsx`

**Step 1: Create Tasks page**

`frontend/src/pages/Tasks.tsx`:
```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import {
  Plus, CheckCircle, AlertCircle, Clock, Loader2, X,
} from "lucide-react";

export function Tasks() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({
    repositoryId: "",
    title: "",
    description: "",
    type: "improvement" as const,
    priority: "medium" as const,
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", filters],
    queryFn: () => api.tasks.list(filters),
  });

  const { data: repos } = useQuery({ queryKey: ["repos"], queryFn: api.repos.list });

  const createMutation = useMutation({
    mutationFn: api.tasks.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowCreate(false);
      setNewTask({ repositoryId: "", title: "", description: "", type: "improvement", priority: "medium" });
    },
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle size={16} className="text-green-400" />;
      case "failed": return <AlertCircle size={16} className="text-red-400" />;
      case "in_progress": return <Loader2 size={16} className="text-purple-400 animate-spin" />;
      default: return <Clock size={16} className="text-yellow-400" />;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Tasks</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
        >
          <Plus size={16} /> New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", "pending", "in_progress", "completed", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilters(s === "all" ? {} : { status: s })}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              (s === "all" && !filters.status) || filters.status === s
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-medium">Create Task</h3>
            <button onClick={() => setShowCreate(false)} className="text-zinc-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-3">
            <select
              value={newTask.repositoryId}
              onChange={(e) => setNewTask({ ...newTask, repositoryId: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select repository</option>
              {(repos || []).map((r: any) => (
                <option key={r.id} value={r.id}>{r.fullName}</option>
              ))}
            </select>
            <input
              placeholder="Task title"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Description - be specific about what changes to make"
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-3">
              <select
                value={newTask.type}
                onChange={(e) => setNewTask({ ...newTask, type: e.target.value as any })}
                className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
              >
                {["improvement", "bugfix", "feature", "refactor", "security"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
                className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
              >
                {["low", "medium", "high", "critical"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => createMutation.mutate(newTask)}
              disabled={!newTask.repositoryId || !newTask.title || !newTask.description}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
            >
              Create & Queue for Execution
            </button>
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {isLoading ? (
          <p className="px-4 py-8 text-center text-zinc-500">Loading tasks...</p>
        ) : (tasks || []).length === 0 ? (
          <p className="px-4 py-8 text-center text-zinc-500">No tasks found.</p>
        ) : (
          (tasks || []).map((task: any) => (
            <Link
              key={task.id}
              to={`/tasks/${task.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors"
            >
              {statusIcon(task.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{task.title}</p>
                <div className="flex gap-2 text-xs text-zinc-500 mt-0.5">
                  <span>{task.repositoryName}</span>
                  <span>{task.type}</span>
                  <span>{task.source === "auto_scan" ? "Auto" : "Manual"}</span>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                task.priority === "critical" ? "bg-red-500/20 text-red-400" :
                task.priority === "high" ? "bg-orange-500/20 text-orange-400" :
                task.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                "bg-zinc-700 text-zinc-400"
              }`}>
                {task.priority}
              </span>
              {task.pullRequestUrl && (
                <span className="text-xs text-blue-400">PR</span>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create TaskDetail page**

`frontend/src/pages/TaskDetail.tsx`:
```tsx
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  ArrowLeft, CheckCircle, AlertCircle, Clock, Loader2, ExternalLink,
} from "lucide-react";

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: () => api.tasks.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const t = query.state.data;
      return t?.status === "in_progress" ? 3000 : false;
    },
  });

  if (isLoading) return <p className="text-zinc-400">Loading...</p>;
  if (!task) return <p className="text-zinc-400">Task not found.</p>;

  const metadata = task.metadata || {};

  return (
    <div>
      <Link
        to="/tasks"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-4"
      >
        <ArrowLeft size={16} /> Back to Tasks
      </Link>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">{task.title}</h2>
            <div className="flex gap-2 text-sm text-zinc-400">
              <span>{task.repositoryName}</span>
              <span>|</span>
              <span>{task.type}</span>
              <span>|</span>
              <span>{task.source === "auto_scan" ? "Auto-generated" : "Manual"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {task.status === "completed" && <CheckCircle className="text-green-400" />}
            {task.status === "failed" && <AlertCircle className="text-red-400" />}
            {task.status === "in_progress" && <Loader2 className="text-purple-400 animate-spin" />}
            {task.status === "pending" && <Clock className="text-yellow-400" />}
            <span className="text-white capitalize">{task.status.replace("_", " ")}</span>
          </div>
        </div>

        <div className="bg-zinc-800 rounded-lg p-4 text-sm text-zinc-300 whitespace-pre-wrap mb-4">
          {task.description}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-zinc-500">Priority</span>
            <p className="text-white capitalize">{task.priority}</p>
          </div>
          <div>
            <span className="text-zinc-500">Created</span>
            <p className="text-white">{new Date(task.createdAt).toLocaleString()}</p>
          </div>
          {task.completedAt && (
            <div>
              <span className="text-zinc-500">Completed</span>
              <p className="text-white">{new Date(task.completedAt).toLocaleString()}</p>
            </div>
          )}
          {task.pullRequestUrl && (
            <div>
              <span className="text-zinc-500">Pull Request</span>
              <a
                href={task.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                View PR <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Agent Output */}
      {metadata.resultSummary && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
          <h3 className="text-white font-medium mb-3">Agent Summary</h3>
          <div className="bg-zinc-950 rounded-lg p-4 text-sm text-zinc-300 whitespace-pre-wrap font-mono">
            {metadata.resultSummary}
          </div>
        </div>
      )}

      {/* Commits */}
      {metadata.commits && metadata.commits.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-white font-medium mb-3">Commits</h3>
          <div className="space-y-2">
            {metadata.commits.map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <code className="text-zinc-500 font-mono">{c.hash.slice(0, 7)}</code>
                <span className="text-zinc-300">{c.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error info */}
      {metadata.error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-6">
          <h3 className="text-red-400 font-medium mb-3">Error</h3>
          <p className="text-red-300 text-sm">{metadata.error}</p>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create Settings page**

`frontend/src/pages/Settings.tsx`:
```tsx
import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <h3 className="text-white font-medium mb-4">Profile</h3>
        <div className="flex items-center gap-4">
          {user?.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="w-16 h-16 rounded-full" />
          )}
          <div>
            <p className="text-white text-lg">{user?.name || "No name"}</p>
            <p className="text-zinc-400">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <h3 className="text-white font-medium mb-4">Connected Providers</h3>
        <div className="space-y-3">
          {["github", "gitlab", "bitbucket"].map((provider) => {
            const connected = user?.providers.includes(provider);
            return (
              <div key={provider} className="flex items-center justify-between">
                <span className="text-white capitalize">{provider}</span>
                {connected ? (
                  <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full">
                    Connected
                  </span>
                ) : (
                  <a
                    href={`/api/auth/login/${provider}`}
                    className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                  >
                    Connect
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-medium mb-4">Environment</h3>
        <p className="text-sm text-zinc-400">
          Ensure these environment variables are set on the server:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-zinc-500 font-mono">
          <li>ANTHROPIC_API_KEY</li>
          <li>DATABASE_URL</li>
          <li>GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET</li>
          <li>GITLAB_CLIENT_ID / GITLAB_CLIENT_SECRET</li>
          <li>BITBUCKET_CLIENT_ID / BITBUCKET_CLIENT_SECRET</li>
        </ul>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: frontend tasks, task detail, and settings pages"
```

---

### Task 15: Integration & Verification

**Step 1: Add Fastify type augmentation**

Create `backend/src/types.ts`:
```typescript
import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
```

**Step 2: Verify everything builds**

Run from root:
```bash
npm run build -w packages/shared
npm run build -w backend
npm run build -w worker
cd frontend && npm run build
```

**Step 3: Test local development**

Terminal 1: `docker compose up -d`
Terminal 2: `npm run dev:backend`
Terminal 3: `npm run dev:worker`
Terminal 4: `npm run dev:frontend`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: type augmentation and build verification"
```
