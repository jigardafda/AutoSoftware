# Architecture

This document describes the architecture of AutoSoftware — how the pieces fit together, how data flows, and the key design decisions.

## Overview

AutoSoftware is a monorepo with four packages:

```
autosoftware/
├── frontend/          UI — React 19 SPA
├── backend/           API — Fastify 5 HTTP server
├── worker/            Jobs — Background processor
├── packages/shared/   Lib — Shared types and constants
└── prisma/            DB — Schema and migrations
```

All packages are managed via npm workspaces.

---

## System Diagram

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   Frontend   │     │  Git Provider │
│              │◀────│  (Vite/React)│     │ GitHub/GL/BB  │
└─────────────┘     └──────┬───────┘     └──────▲───────┘
                           │ /api/*              │
                           ▼                     │
                    ┌──────────────┐     ┌───────┴──────┐
                    │   Backend    │────▶│    Worker     │
                    │  (Fastify)   │     │  (pg-boss)   │
                    └──────┬───────┘     └──────┬───────┘
                           │                     │
                           ▼                     ▼
                    ┌──────────────┐     ┌──────────────┐
                    │  PostgreSQL  │     │  Claude API   │
                    │              │     │  (Anthropic)  │
                    └──────────────┘     └──────────────┘
```

**Frontend** serves the SPA and proxies API calls. **Backend** handles authentication, CRUD, and job scheduling. **Worker** processes background jobs (scanning, planning, execution) using Claude AI. **PostgreSQL** stores all persistent state. **Git providers** supply repository data and receive pull requests.

---

## Frontend

| | |
|---|---|
| **Framework** | React 19 + TypeScript |
| **Build** | Vite |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Data fetching** | TanStack React Query |
| **Routing** | React Router DOM |
| **Icons** | Lucide React |
| **Toasts** | Sonner |
| **Charts** | Recharts |

### Routes

| Path | Page | Description |
|------|------|-------------|
| `/login` | Login | OAuth provider selection (public) |
| `/dashboard` | Dashboard | Stats overview |
| `/repos` | Repos | Connected repository list |
| `/repos/:id` | RepoDetail | File browser + settings |
| `/tasks` | Tasks | Task list with filters |
| `/tasks/:id` | TaskDetail | Task detail + planning UI |
| `/scans` | Scans | Scan history |
| `/scans/:id` | ScanDetail | Scan detail + logs |
| `/projects` | Projects | Project list |
| `/projects/:id` | ProjectDetail | Project detail + documents |
| `/activity` | Activity | Activity event feed |
| `/queues` | Queues | Job queue dashboard |
| `/settings` | Settings | API keys + integrations |

All routes except `/login` are wrapped in a `ProtectedRoute` component that checks authentication state.

### Key Modules

- **`lib/api.ts`** — Typed fetch wrapper organized by domain (`api.repos.*`, `api.tasks.*`, etc.). Returns `{ data: T }` on success, throws on error.
- **`lib/auth.tsx`** — React context providing `useAuth()` hook with `{ user, loading, logout, refetch }`. Session checked via `GET /api/auth/me`.
- **`lib/theme.tsx`** — Dark/light mode provider backed by Tailwind CSS classes.

---

## Backend

| | |
|---|---|
| **Framework** | Fastify 5 |
| **ORM** | Prisma (with `@prisma/adapter-pg`) |
| **Database** | PostgreSQL 16 |
| **Session** | Signed cookie (`session_token`, 30-day expiry) |

### API Routes

All routes are prefixed with `/api/` except embed routes.

| Route file | Prefix | Auth | Purpose |
|------------|--------|------|---------|
| `auth.ts` | `/api/auth` | No | OAuth login, callback, session, logout |
| `repos.ts` | `/api/repos` | Yes | Repository CRUD, file browsing, scan triggers |
| `tasks.ts` | `/api/tasks` | Yes | Task CRUD, planning state, answer submission |
| `scans.ts` | `/api/scans` | Yes | Scan results and logs |
| `ai.ts` | `/api/ai` | Yes | AI commands and insights |
| `activity.ts` | `/api/activity` | Yes | Activity event history |
| `queues.ts` | `/api/queues` | Yes | Job queue monitoring |
| `api-keys.ts` | `/api/api-keys` | Yes | API key management |
| `projects.ts` | `/api/projects` | Yes | Projects, documents, embed config |
| `integrations.ts` | `/api/integrations` | Yes | External service connections |
| `embed.ts` | `/embed` | No | Public embed widget endpoints |

### Response Format

```typescript
// Success
{ data: T }

// Error
{ error: { message: string; code?: string } }
```

### Services

| Service | File | Purpose |
|---------|------|---------|
| **OAuth** | `services/oauth.ts` | Auth URL generation, code exchange, user info fetching |
| **Git Providers** | `services/git-providers.ts` | Unified API for listing repos and creating PRs across GitHub, GitLab, Bitbucket |
| **Repo FS** | `services/repo-fs.ts` | File browsing with path traversal protection (`safePath()`) |
| **Scheduler** | `services/scheduler.ts` | pg-boss wrapper for queueing and scheduling jobs |
| **Integrations** | `services/integrations/` | Registry of provider adapters (Linear, Jira, Asana, Azure DevOps, Sentry, GitHub Issues) |

### Authentication Flow

1. User clicks "Sign in with GitHub/GitLab/Bitbucket"
2. Backend generates OAuth state, stores in signed cookie, redirects to provider
3. Provider redirects back with code → backend exchanges for access token
4. User is upserted by email, account credentials stored encrypted
5. Session token (user ID) set in signed cookie (30-day expiry)
6. All subsequent requests validated via `requireAuth` hook

---

## Worker

| | |
|---|---|
| **Job queue** | pg-boss (PostgreSQL-backed) |
| **AI** | Anthropic SDK + Claude Agent SDK |
| **Git** | simple-git |

### Jobs

| Job | Concurrency | Retries | Timeout | What it does |
|-----|-------------|---------|---------|-------------|
| `repo-scan` | 1 | 3 | 30 min | Clones repo, runs Claude analysis, creates tasks |
| `task-plan` | 1 | 3 | 15 min | Generates implementation plan, asks clarifying questions |
| `task-execute` | 1 | 3 | 60 min | Creates worktree, implements fix via Agent SDK, opens PR |
| `embed-screen` | 2 | 2 | 5 min | Evaluates submission quality, scores, asks follow-ups |
| `embed-convert` | 1 | 2 | 5 min | Converts approved submissions into tasks |

Retries use exponential backoff. Jobs are deduplicated using `singletonKey`.

### Execution Flow

```
repo-scan:
  clone/pull repo → Claude analyzes code → create Task rows → log results

task-plan:
  load repo context → Claude generates questions → save PlanningQuestion rows
  → status: awaiting_input (or planned if no questions needed)

task-execute:
  create git worktree → Claude Agent SDK implements fix
  → commit changes → create PR via Git provider API → update task with PR URL

embed-screen:
  load submission → Claude Haiku scores quality (1-10)
  → approved/rejected/needs_input → queue follow-up questions if needed

embed-convert:
  load approved submission → create Task row → link submission to task
```

### Budget Controls

Each job type has a default token budget (configurable via environment):

| Job | Default Budget |
|-----|---------------|
| Scan | $2.00 |
| Task execution | $10.00 |
| Planning | $1.00 |
| Embed screening | $0.05 |

---

## Shared Package

`packages/shared/` contains types and constants used by both backend and worker.

### Types (`types.ts`)

Key type unions and enums:

```
OAuthProvider       = "github" | "gitlab" | "bitbucket"
TaskType            = "improvement" | "bugfix" | "feature" | "refactor" | "security"
TaskPriority        = "low" | "medium" | "high" | "critical"
TaskStatus          = "planning" | "awaiting_input" | "planned" | "pending"
                    | "in_progress" | "completed" | "failed" | "cancelled"
TaskSource          = "auto_scan" | "manual" | "external_import" | "embed"
IntegrationProvider = "linear" | "github_issues" | "jira" | "sentry"
                    | "azure_devops" | "asana"
EmbedScreeningStatus = "pending" | "screening" | "needs_input" | "scored"
                     | "approved" | "rejected"
```

### Constants (`constants.ts`)

- Job names, default budgets
- Model pricing (Claude Sonnet, Opus, Haiku — input/output rates per million tokens)
- `estimateCost()` function for token-to-USD conversion
- OAuth URL templates per provider
- Integration provider metadata

### Encryption (`encryption.ts`)

- **Algorithm:** AES-256-GCM with random 12-byte IV
- **Format:** `base64(iv):base64(authTag):base64(ciphertext)`
- Used to encrypt API keys and integration tokens at rest

---

## Database

PostgreSQL 16 with Prisma ORM. The schema has **24 models**.

### Entity Relationship Diagram

```
User
 ├── Account[]              OAuth credentials (GitHub, GitLab, Bitbucket)
 ├── Repository[]            Connected repos
 │    ├── Task[]             Discovered issues
 │    │    ├── PlanningQuestion[]   Clarification Q&A
 │    │    └── TaskExternalLink     Link to external tracker
 │    ├── ScanResult[]       Scan history
 │    │    └── ScanLog[]     Execution logs
 │    └── ProjectRepository[]
 ├── Project[]               Repo grouping
 │    ├── ProjectRepository[]
 │    ├── ProjectDocument[]  Context documents
 │    ├── IntegrationLink[]  External project mappings
 │    ├── EmbedConfig        Widget configuration
 │    └── EmbedSubmission[]  External submissions
 │         └── EmbedQuestion[]  Clarification for submissions
 ├── Integration[]           External service connections
 ├── ApiKey[]                Encrypted Anthropic keys
 │    └── ApiKeyUsage[]      Token/cost tracking
 ├── AiInsight[]             AI recommendations
 └── ActivityEvent[]         Audit trail
```

### Key Design Decisions

- **Encrypted tokens:** OAuth tokens and API keys are encrypted with AES-256-GCM before storage. The encryption secret is provided via environment variable.
- **Multi-provider accounts:** A user can link multiple OAuth accounts. Users are matched by email across providers.
- **Task lifecycle:** Tasks flow through `planning → awaiting_input → planned → pending → in_progress → completed/failed`. The `planningRound` counter tracks clarification iterations.
- **Embed screening:** External submissions go through AI scoring before becoming tasks. The `scoreThreshold` on `EmbedConfig` controls the approval cutoff.
- **Soft job deduplication:** pg-boss `singletonKey` prevents duplicate scans for the same repository.

---

## Infrastructure

### Docker

The project provides both development and production Docker Compose configurations.

**Development** (`docker-compose.yml`):
- PostgreSQL 16 on port 5432

**Production** (`docker-compose.prod.yml`):
- PostgreSQL with health checks
- Migrate service runs `prisma migrate deploy` before app starts
- Backend on port 6002, Frontend on port 6001
- Worker shares a workspace volume with backend
- Service dependency ordering ensures correct startup

**Dockerfile** — Multi-stage build:

```
Stage 1: base        → Copy source, install dependencies
Stage 2: shared      → Build shared package
Stage 3: prisma      → Generate Prisma client
Stage 4: backend     → Run backend with tsx
Stage 5: worker      → Install git, run worker with tsx
Stage 6: frontend    → Build Vite app, serve with nginx
```

### Nginx

The nginx configuration (`nginx.conf`) handles:

- Serving the React SPA from `/usr/share/nginx/html`
- Reverse proxying `/api/*` and `/embed/*` to backend (port 5002) with 300s timeouts
- SPA fallback (`try_files $uri $uri/ /index.html`)
- Static asset caching (1 year, immutable)
- Gzip compression

---

## Configuration

### Backend (`backend/src/config.ts`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection |
| `SESSION_SECRET` | Yes | — | Cookie signing |
| `API_KEY_ENCRYPTION_SECRET` | Yes | — | Encrypt stored API keys |
| `ANTHROPIC_API_KEY` | No | — | Fallback AI key |
| `FRONTEND_URL` | No | `http://localhost:5001` | CORS + redirects |
| `BACKEND_URL` | No | `http://localhost:5002` | OAuth callbacks |
| `PORT` | No | `5002` | Server port |
| `WORK_DIR` | No | `/tmp/autosoftware-workspaces` | Repo clone directory |
| `GITHUB_CLIENT_ID/SECRET` | No | — | GitHub OAuth |
| `GITLAB_CLIENT_ID/SECRET` | No | — | GitLab OAuth |
| `BITBUCKET_CLIENT_ID/SECRET` | No | — | Bitbucket OAuth |

### Worker (`worker/src/config.ts`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection |
| `ANTHROPIC_API_KEY` | Yes | — | AI API access |
| `API_KEY_ENCRYPTION_SECRET` | Yes | — | Decrypt user API keys |
| `WORK_DIR` | No | `/tmp/autosoftware-workspaces` | Repo clone directory |
| `DEFAULT_SCAN_BUDGET` | No | `$2.00` | Max cost per scan |
| `DEFAULT_TASK_BUDGET` | No | `$10.00` | Max cost per execution |
| `DEFAULT_PLAN_BUDGET` | No | `$1.00` | Max cost per planning |

---

## Data Flow

### Repository Scan

```
User connects repo
  → Backend stores repo + encrypted OAuth token
  → Scheduler queues repo-scan job (recurring or on-demand)
  → Worker clones/pulls repo
  → Claude analyzes codebase
  → Worker creates Task rows for discovered issues
  → ScanResult + ScanLogs saved
  → ActivityEvent recorded
```

### Task Execution

```
User (or scan) creates task
  → task-plan job queued
  → Claude generates clarifying questions
  → Task status: awaiting_input
  → User answers questions in UI
  → task-plan re-queued with answers
  → Claude produces final plan
  → Task status: planned
  → User triggers execution
  → task-execute job queued
  → Worker creates git worktree + branch
  → Claude Agent SDK implements changes
  → Worker commits + pushes + creates PR
  → Task updated with PR URL
```

### Embed Submission

```
External user fills embed widget form
  → POST /embed/:projectId/submit
  → embed-screen job queued
  → Claude Haiku scores submission (1-10)
  → Score ≥ threshold → approved → embed-convert job
  → Score < threshold → rejected (or needs_input for follow-up)
  → embed-convert creates Task from submission
```

### Integration Sync

```
User connects external service (Linear, Jira, etc.)
  → OAuth flow stores encrypted tokens
  → User maps integration to project
  → Import items from external service as tasks
  → TaskExternalLink tracks the association
```
