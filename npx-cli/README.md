# @boltic/auto-software

**Put your entire software team on autopilot — the 100x engineer you dreamt of.**

AutoSoftware is an autonomous software engineering platform. AI agents scan your codebases, plan features, write production code, review PRs, and ship — all from a single command.

## Quick Start

```bash
npx @boltic/auto-software
```

That's it. A full engineering dashboard launches at `http://localhost:8001` with an embedded database — no Docker, no config files, no setup.

## Features

### Autonomous Task Execution
Create a task, assign it to an AI agent, and watch it plan, code, and open a PR — end to end. Supports multi-step workflows across branches and repositories.

### AI-Powered Code Review
Review any pull request with a single command:

```bash
npx @boltic/auto-software review https://github.com/org/repo/pull/123
```

Works with **GitHub**, **GitLab**, and **Bitbucket** or any local git repository as well. Uses whichever AI agent you have installed — Claude Code, Codex, Gemini, Aider, or Amp.

### Live Workspaces
Interactive coding workspaces with:
- Real-time chat with AI agents
- Integrated terminal (full PTY)
- Browser preview with element inspector
- File explorer and diff viewer
- Git operations and PR creation

### Repository Management
Connect repositories via GitHub CLI or PATs. Full file browsing, branch management, and commit history.

### Codebase Scanning
AI-powered scans that analyze your codebase and generate actionable improvement tasks — bugs, security issues, refactors, and feature suggestions.

### Analytics Dashboard
Track engineering velocity, cost, ROI, and AI agent performance across all your projects and repositories.

## Commands

### `start` (default)

```bash
npx @boltic/auto-software [start] [options]
```

Starts the local AutoSoftware server.

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <number>` | `8002` | Backend API port |
| `--frontend-port <number>` | `8001` | Frontend dashboard port |
| `--no-open` | — | Don't auto-open browser |
| `--data-dir <path>` | `~/.auto-software` | Local data storage directory |
| `-f, --force` | — | Kill existing instance before starting |

### `review <pr-url>`

```bash
npx @boltic/auto-software review <pr-url> [options]
```

Runs an AI-powered code review on a pull request.

| Option | Description |
|--------|-------------|
| `--agent <id>` | Agent to use: `claude-code`, `codex`, `gemini`, `aider`, `amp` |
| `--gitlab-token <token>` | GitLab personal access token |
| `--bitbucket-token <token>` | Bitbucket app password |
| `--data-dir <path>` | Local data storage directory |

**Supported PR URLs:**
- GitHub: `https://github.com/owner/repo/pull/123`
- GitLab: `https://gitlab.com/owner/repo/-/merge_requests/123`
- Bitbucket: `https://bitbucket.org/owner/repo/pull-requests/123`

## Requirements

- **Node.js 22+**
- An AI coding agent installed (any one of):
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`)
  - [OpenAI Codex](https://github.com/openai/codex) (`codex`)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) (`gemini`)
  - [Aider](https://aider.chat) (`aider`)
  - [Amp](https://ampcode.com) (`amp`)

## How It Works

AutoSoftware bundles a full-stack application into a single npm package:

- **Frontend** — React dashboard with real-time workspace UI
- **Backend** — Fastify API server with WebSocket support
- **Worker** — Background task processor for scans and code generation
- **Database** — Embedded PostgreSQL (auto-managed, zero config)

Everything runs locally on your machine. Your code never leaves your environment.

## Data Storage

All data is stored locally at `~/.auto-software/` by default:

```
~/.auto-software/
  config.json        # Generated secrets
  auto-software.db   # Embedded PostgreSQL data
```

Use `--data-dir` to customize the location.

## License

MIT
