# AutoSoftware - Automated Software Development System

## Overview

An automated development platform that continuously analyzes code repositories, generates improvement tasks, and autonomously implements changes via the Claude Agent SDK. Users connect their GitHub, GitLab, and Bitbucket accounts, and the system periodically scans repos to identify bugs, security issues, performance improvements, and missing tests. It then executes these tasks autonomously, creates pull requests, and runs validations.

## Architecture

### Stack
- **Frontend:** React + Vite + TailwindCSS + shadcn/ui
- **Backend:** Fastify (Node.js/TypeScript)
- **Worker:** Node.js process using `@anthropic-ai/claude-agent-sdk`
- **Database:** PostgreSQL + Prisma ORM
- **Job Queue:** pg-boss (PostgreSQL-based)
- **Auth:** OAuth 2.0 (GitHub, GitLab, Bitbucket)
- **Monorepo:** Shared TypeScript types across all packages

### Structure
```
AutoSoftware/
├── frontend/          # React + Vite SPA
├── backend/           # Fastify API server
├── worker/            # Claude Agent SDK workers
├── packages/shared/   # Shared types, schemas, constants
├── prisma/            # Database schema + migrations
├── docker-compose.yml # PostgreSQL for local dev
└── package.json       # Workspace root
```

### System Diagram
```
Frontend (React) ─── REST API ───> Backend (Fastify)
                                      │
                                      │ pg-boss jobs
                                      │
                                   Worker Process
                                   ├── Repo Scanner (Agent SDK)
                                   ├── Task Executor (Agent SDK)
                                   └── PR Creator (Git + API)
                                      │
                                   PostgreSQL
                                   (Users, Repos, Tasks, Jobs)
```

## Data Model

### User
- id, email, name, avatarUrl
- createdAt, updatedAt

### Account (OAuth connections)
- id, userId, provider (github|gitlab|bitbucket)
- providerAccountId, accessToken (encrypted), refreshToken (encrypted)
- scopes, expiresAt

### Repository
- id, userId, provider, providerRepoId
- fullName, cloneUrl, defaultBranch
- isActive, scanInterval (default 60 min)
- lastScannedAt, status (idle|scanning|error)
- settings (JSON)

### Task
- id, repositoryId, userId
- title, description, type (improvement|bugfix|feature|refactor|security)
- priority (low|medium|high|critical), status (pending|in_progress|completed|failed|cancelled)
- source (auto_scan|manual)
- agentSessionId, pullRequestUrl, pullRequestStatus
- metadata (JSON), createdAt, updatedAt, completedAt

### ScanResult
- id, repositoryId
- scannedAt, status (completed|failed)
- summary, tasksCreated, analysisData (JSON)

## Worker Design

### Repo Scan Job
- Triggered hourly per active repo via pg-boss cron
- Clones/pulls repo to temp directory
- Uses Claude Agent SDK with tools: Read, Glob, Grep, Bash, WebSearch, WebFetch, Agent
- Budget: $2.00 default (configurable per repo)
- Parses structured output → creates Task records

### Task Execution Job
- Triggered when task status set to pending
- Creates git worktree for isolated changes
- Uses Claude Agent SDK with full tool access: Read, Edit, Write, Bash, Glob, Grep, WebSearch, WebFetch, Agent
- permissionMode: "bypassPermissions" (runs in isolated worktree)
- Budget: $10.00 default (configurable per task)
- After completion: pushes branch, creates PR via platform API

### Safety & Isolation
- Each task runs in disposable git worktree
- Budget caps prevent runaway costs
- All agent actions logged for audit
- Failed jobs retry up to 3 times with exponential backoff
- Worktrees cleaned up after completion

## Frontend Views

1. **Login** - OAuth buttons for GitHub, GitLab, Bitbucket
2. **Dashboard** - Overview: repos, recent tasks, active scans, PR status
3. **Repositories** - List repos, toggle scanning, configure intervals, trigger manual scans
4. **Tasks** - Table view with filters (repo, status, type, priority). Create manual tasks.
5. **Task Detail** - Description, agent logs, PR link, files changed, status timeline
6. **Settings** - OAuth connections, API keys, budgets, notifications

## API Endpoints

### Auth
- GET /api/auth/login/:provider - Initiate OAuth flow
- GET /api/auth/callback/:provider - OAuth callback
- GET /api/auth/me - Current user
- POST /api/auth/logout - Logout

### Repositories
- GET /api/repos - List user repos
- POST /api/repos - Connect a repo
- PATCH /api/repos/:id - Update repo settings
- DELETE /api/repos/:id - Disconnect repo
- POST /api/repos/:id/scan - Trigger manual scan

### Tasks
- GET /api/tasks - List tasks (filterable)
- POST /api/tasks - Create manual task
- PATCH /api/tasks/:id - Update task (priority, status)
- DELETE /api/tasks/:id - Cancel/delete task
- GET /api/tasks/:id - Task detail with logs

### Scan Results
- GET /api/repos/:id/scans - List scan results for a repo
- GET /api/scans/:id - Scan detail
