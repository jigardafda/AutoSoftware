<p align="center">
  <img src="frontend/public/logo.svg" alt="AutoSoftware" width="120" />
</p>

<h1 align="center">AutoSoftware</h1>

<p align="center">
  <strong>AI-powered code analysis and improvement</strong>
</p>

<p align="center">
  Connect your repositories, let AI scan for issues, and get automated improvements delivered as pull requests.
</p>

---

## What it does

AutoSoftware connects to your GitHub, GitLab, or Bitbucket repositories and continuously scans them for bugs, security issues, performance bottlenecks, and code quality improvements. When it finds something, it creates a task and can autonomously generate a fix as a pull request.

**Key features:**

- **Automated scanning** &mdash; Periodic AI-powered analysis of your codebase
- **Task management** &mdash; Tracks discovered issues with type, priority, and status
- **Autonomous fixes** &mdash; AI agent creates branches and opens pull requests
- **File browser** &mdash; GitHub-style code viewer with syntax highlighting
- **Project grouping** &mdash; Organize repos into projects with shared context documents
- **Usage tracking** &mdash; Monitor API token usage and costs per repo

## Architecture

```
frontend/    React + TypeScript + Vite (Tailwind CSS, shadcn/ui)
backend/     Fastify + Prisma + PostgreSQL
worker/      Background job processor (pg-boss)
shared/      Shared types and schemas
```

## Getting started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env   # fill in your credentials

# Run database migrations
npx prisma migrate dev

# Start all services (frontend + backend + worker)
npm run dev
```

## License

Private &mdash; All rights reserved.
