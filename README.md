<p align="center">
  <img src="frontend/public/logo.svg" alt="AutoSoftware" width="120" />
</p>

<h1 align="center">AutoSoftware</h1>

<p align="center">
  <strong>AI-powered code analysis, improvement, and interactive development platform</strong>
</p>

<p align="center">
  Connect your repositories or local folders &mdash; scan for issues, collaborate with AI agents in real-time workspaces, and ship fixes as pull requests.
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#workspaces">Workspaces</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#contributing">Contributing</a> &bull;
  <a href="#license">License</a>
</p>

---

## Features

### Core Platform
- **Automated scanning** &mdash; Periodic AI-powered analysis of your codebase for bugs, security issues, performance bottlenecks, and code quality improvements
- **Task management** &mdash; Tracks discovered issues with type, priority, and status
- **Autonomous fixes** &mdash; AI agent creates branches and opens pull requests using the Claude Agent SDK
- **File browser** &mdash; GitHub-style code viewer with syntax highlighting
- **Project grouping** &mdash; Organize repos into projects with shared context documents
- **External integrations** &mdash; Sync tasks with Linear, Jira, Asana, Azure DevOps, Sentry, and GitHub Issues
- **Embeddable widget** &mdash; Collect feature requests and bug reports from external users, with AI-powered screening and automatic task conversion
- **API key management** &mdash; Per-repository usage and cost tracking
- **Job queue dashboard** &mdash; Monitor background jobs in real time
- **Activity feed** &mdash; Full event stream and audit trail

### Interactive Workspaces
- **Real-time AI collaboration** &mdash; Chat with AI coding agents in a split-pane IDE-like environment
- **Multi-agent support** &mdash; Choose from 7 supported agents: Claude Code, OpenAI Codex, Cursor, GitHub Copilot, Gemini CLI, Amp, and Aider
- **Agent Client Protocol (ACP)** &mdash; Standardized protocol for spawning and communicating with coding agents
- **Git worktree isolation** &mdash; Each workspace gets an isolated git worktree so agents can't interfere with each other
- **Live terminal output** &mdash; Real-time streaming of agent activity via WebSocket
- **Advanced diff viewer** &mdash; Side-by-side and unified diff views powered by `@git-diff-view/react`
- **Browser preview** &mdash; Embedded iframe preview of your dev server with URL bar, navigation, and device emulation (Desktop/Tablet/Mobile)
- **Element inspection** &mdash; Ctrl+Shift+Click on any element in the browser preview to capture its selector, dimensions, and styles, then reference it in chat
- **Approval workflow** &mdash; Review and approve/reject agent actions (file edits, shell commands) before they execute

### Local Mode
- **Run anywhere with NPX** &mdash; `npx auto-software` starts the full platform locally with zero configuration
- **Embedded PostgreSQL** &mdash; No database setup required; an embedded PostgreSQL instance manages data automatically
- **Local folder support** &mdash; Work with any local project folder, not just Git repositories
- **Auto-login** &mdash; Single-user mode with automatic authentication

## Quick Start

Run AutoSoftware locally with a single command &mdash; no database, no OAuth, no configuration required:

```bash
npx auto-software
```

This will:
1. Start an embedded PostgreSQL database
2. Run database migrations automatically
3. Launch the backend API and frontend
4. Open your browser at **http://localhost:8001**

### Options

```bash
npx auto-software --port 8002          # Backend port (default: 8002)
npx auto-software --frontend-port 8001 # Frontend port (default: 8001)
npx auto-software --data-dir ~/mydata  # Data directory (default: ~/.auto-software)
npx auto-software --no-open            # Don't open browser automatically
```

## Getting Started

### Prerequisites (Cloud/Self-Hosted Mode)

- **Node.js** 22+
- **PostgreSQL** 16+
- **Anthropic API key** ([get one here](https://console.anthropic.com/))
- OAuth credentials for at least one Git provider (GitHub, GitLab, or Bitbucket)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/autosoftware.git
cd autosoftware

# Install dependencies
npm install

# Configure environment
cp .env.example .env
```

Edit `.env` and fill in the required values:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `SESSION_SECRET` | Random string &mdash; generate with `openssl rand -hex 32` |
| `API_KEY_ENCRYPTION_SECRET` | Random string &mdash; generate with `openssl rand -hex 32` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` | GitLab OAuth app credentials (optional) |
| `BITBUCKET_CLIENT_ID` / `BITBUCKET_CLIENT_SECRET` | Bitbucket OAuth app credentials (optional) |
| `FRONTEND_URL` | Frontend URL (default: `http://localhost:5001`) |
| `BACKEND_URL` | Backend URL (default: `http://localhost:5002`) |

You need at least one Git provider configured to log in.

```bash
# Run database migrations
npx prisma migrate dev

# Start all services (frontend + backend + worker)
npm run dev
```

The app will be available at **http://localhost:5001**.

### Individual Services

```bash
npm run dev:backend    # Backend API (port 5002)
npm run dev:worker     # Background job processor
npm run dev:frontend   # Frontend dev server (port 5001)
```

### Other Commands

```bash
npm run build          # Build all packages
npm run typecheck      # Type-check all packages
npm run db:migrate     # Run Prisma migrations
npm run db:generate    # Regenerate Prisma client
```

## Workspaces

Workspaces are interactive AI development environments where you collaborate with a coding agent in real time.

### How It Works

1. **Create a workspace** &mdash; Select a repository or local folder and choose an AI agent
2. **Start a session** &mdash; The agent process spawns in an isolated git worktree
3. **Collaborate** &mdash; Send messages, review file changes, approve actions, and preview results in a split-pane UI
4. **Ship** &mdash; When done, review the diff and merge or create a PR

### Supported Agents

| Agent | Protocol | Auto-detected |
|-------|----------|---------------|
| Claude Code | ACP | Yes (`claude` CLI) |
| OpenAI Codex | Codex | Yes (`codex` CLI) |
| Cursor | Custom | Yes (`cursor` CLI) |
| GitHub Copilot | Custom | Yes (`github-copilot-cli`) |
| Gemini CLI | Custom | Yes (`gemini` CLI) |
| Amp | Custom | Yes (`amp` CLI) |
| Aider | Custom | Yes (`aider` CLI) |

Agents are auto-detected at startup. Only agents installed on your system will be available.

### Browser Preview

The workspace includes an embedded browser preview that proxies your local dev server. Set a dev server port in workspace settings to enable it.

- **Device emulation** &mdash; Switch between Desktop (100%), Tablet (768px), and Mobile (375px)
- **Element inspection** &mdash; Toggle inspect mode, then click any element to capture its CSS selector, bounding box, computed styles, and attributes. The selection is passed back to the chat for referencing in conversations with the agent.

## Docker

### Development

```bash
docker-compose up
```

This starts PostgreSQL alongside the application services.

### Production

```bash
docker-compose -f docker-compose.prod.yml up
```

The production setup uses a multi-stage Docker build with nginx as a reverse proxy for the frontend.

## Architecture

```
autosoftware/
├── frontend/          React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
├── backend/           Fastify 5 + Prisma ORM + PostgreSQL
│   └── services/
│       ├── acp/              Agent Client Protocol (registry, sessions, protocol)
│       ├── workspace/        Workspace manager (git worktrees, diff)
│       └── browser-preview/  Preview proxy + DevTools bridge injection
├── worker/            Background jobs via pg-boss + Claude Agent SDK
├── npx-cli/           Standalone NPX package with embedded PostgreSQL
├── packages/shared/   Shared types and constants
└── prisma/            Database schema and migrations
```

### How it works

1. **Connect** &mdash; Sign in with GitHub/GitLab/Bitbucket or run locally with `npx auto-software`
2. **Scan** &mdash; AI analyzes your codebase on a schedule (or on demand) and creates tasks for discovered issues
3. **Workspace** &mdash; Open an interactive workspace to collaborate with an AI agent on any task
4. **Fix** &mdash; The agent creates a branch, applies fixes, and opens a pull request &mdash; with your approval at every step

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, zustand, @git-diff-view/react, framer-motion, react-virtuoso |
| Backend | Fastify 5, Prisma, PostgreSQL 16, WebSocket |
| Worker | pg-boss, Claude Agent SDK, simple-git |
| AI | Agent Client Protocol (ACP), multi-agent support (Claude Code, Codex, Cursor, Copilot, Gemini, Amp, Aider) |
| Local Mode | embedded-postgres, Commander CLI, http-proxy |
| Infra | Docker, nginx, OpenSSL |

### Optional Integrations

Configure these in `.env` to enable two-way sync with external services:

- **Linear** &mdash; `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET`
- **Jira** &mdash; `JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET`
- **Asana** &mdash; `ASANA_CLIENT_ID` / `ASANA_CLIENT_SECRET`
- **Azure DevOps** &mdash; `AZURE_DEVOPS_CLIENT_ID` / `AZURE_DEVOPS_CLIENT_SECRET`
- **Sentry** and **GitHub Issues** are configured through the app's settings UI.

## Self-Hosting

See [SECURITY.md](SECURITY.md) for security best practices when self-hosting, including TLS, secrets management, and database hardening.

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Push to the branch and open a pull request

## Security

If you discover a security vulnerability, please report it responsibly. See [SECURITY.md](SECURITY.md) for details.

## License

[MIT](LICENSE) &copy; AutoSoftware Contributors
