# AutoSoftware: Vibe Kanban Feature Parity Design Spec

**Date**: 2026-03-14
**Status**: Approved
**Priority Order**: NPX CLI → ACP Multi-Model → Workspaces → Browser Preview → Diff Viewer → Library Upgrades

---

## 1. NPX Standalone Local Mode

### Goal
`npx auto-software` launches the full application locally with zero configuration. No Docker, no manual PostgreSQL setup.

### Architecture
- New `npx-cli/` package in the monorepo
- Uses `embedded-postgres` npm package to bundle a PostgreSQL instance
- Fastify serves both API and static frontend (Vite build output)
- Worker runs in-process (same Node.js process)
- Data stored in `~/.auto-software/` (database, cloned repos, config)

### Package Structure
```
npx-cli/
├── package.json          # name: "auto-software", bin: { "auto-software": "./bin/cli.js" }
├── bin/
│   └── cli.js            # Entry point — parses args, boots embedded-postgres, starts server
├── src/
│   ├── local-server.ts   # Unified Fastify server (API + static files + worker in-process)
│   ├── embedded-db.ts    # embedded-postgres lifecycle (init, start, stop, cleanup)
│   ├── local-repos.ts    # Local folder scanning + GitHub PAT repo access
│   └── local-auth.ts     # No-auth pass-through for single-user local mode
```

### CLI Interface
```bash
npx auto-software                    # Start local server, auto-opens browser
npx auto-software --port 4000        # Custom port
npx auto-software --no-open          # Don't auto-open browser
npx auto-software --data-dir ~/mydata # Custom data directory
```

### Repository Access in Local Mode
1. **Local folders (primary)**: User adds any folder path. Auto-detects `.git/`, extracts remote URL, branch info. Non-git folders treated as plain directories.
2. **GitHub via PAT (optional)**: User pastes a Personal Access Token in settings. Used to list/clone repos via GitHub API. No OAuth callback server needed.

### Key Decisions
- **Embedded PostgreSQL**: Keeps entire backend code identical between local and cloud. No SQLite adapter, no queue reimplementation, no schema changes.
- **Single process**: Backend + worker + static serving in one Node.js process for simplicity.
- **No auth locally**: Single-user mode, auto-creates a local user on first boot.
- **Data directory**: `~/.auto-software/data/` for PostgreSQL data, `~/.auto-software/repos/` for cloned repos, `~/.auto-software/config.json` for local settings.
- **Graceful shutdown**: Stops embedded PostgreSQL cleanly on SIGINT/SIGTERM.

### Schema Changes
- Add `local` to `OAuthProvider` enum for locally-added folders
- Add `localPath` field to `Repository` model (nullable, used only for local folders)

---

## 2. Multi-Model Support via Agent Client Protocol (ACP)

### Goal
Support 10+ coding agents (Claude, Codex, Cursor, Copilot, Gemini, etc.) via the standardized Agent Client Protocol.

### Architecture
```
Backend
├── services/
│   ├── acp/
│   │   ├── agent-registry.ts      # Agent configs, auto-detection, capabilities
│   │   ├── acp-session.ts         # ACP session lifecycle (spawn, communicate, cleanup)
│   │   ├── acp-protocol.ts        # ACP message types, serialization, event parsing
│   │   └── adapters/
│   │       ├── claude-adapter.ts   # Claude Code ACP native
│   │       ├── codex-adapter.ts   # OpenAI Codex protocol → ACP adapter
│   │       ├── cursor-adapter.ts  # Cursor CLI → ACP adapter
│   │       ├── copilot-adapter.ts # GitHub Copilot → ACP adapter
│   │       ├── gemini-adapter.ts  # Gemini CLI → ACP adapter
│   │       └── generic-adapter.ts # Generic CLI → ACP fallback
├── routes/
│   └── agents.ts                  # Agent CRUD, detection, session management APIs
```

### Agent Registry
```typescript
interface AgentConfig {
  id: string;              // "claude-code", "codex", "cursor", etc.
  name: string;            // Display name
  command: string;         // CLI command to check/spawn
  args: string[];          // Default CLI arguments for ACP mode
  protocol: "acp" | "codex" | "custom"; // Native protocol
  available: boolean;      // Auto-detected on startup
  models?: string[];       // Available models for this agent
  icon: string;            // Icon identifier for frontend
  capabilities: {
    fileEdit: boolean;
    terminal: boolean;
    browser: boolean;
    approval: boolean;
    streaming: boolean;
  };
}
```

### Auto-Detection
On server startup and on-demand via API:
- Check `which <command>` / `where <command>` for each registered agent
- Run `<command> --version` to verify
- Cache results, re-check on demand via `/api/agents/detect`

### ACP Session Lifecycle
1. **Create session**: Spawn agent process with ACP flags + workspace worktree path
2. **Stream events**: Parse ACP JSON events (text, tool_calls, file_changes, approval_requests)
3. **Send messages**: Forward user chat messages as ACP input
4. **Handle approvals**: Surface approval requests to frontend, send approve/reject back
5. **Cleanup**: Kill process, cleanup temp files on session end

### API Routes
```
GET    /api/agents              # List all agents with availability
POST   /api/agents/detect       # Re-detect available agents
GET    /api/agents/:id          # Get agent details
POST   /api/agents/sessions     # Create new ACP session
POST   /api/agents/sessions/:id/message   # Send message to session
POST   /api/agents/sessions/:id/approve   # Approve/reject agent action
DELETE /api/agents/sessions/:id  # End session
WS     /ws/agent/:sessionId     # Stream agent events
```

### Key Decisions
- **ACP as primary protocol**: Agents supporting ACP natively get first-class support. Others get thin adapter wrappers.
- **Per-workspace agent selection**: Users pick agent when creating a workspace.
- **Fallback to API mode**: Existing Anthropic SDK integration stays for autonomous execution.
- **Agent auto-detection**: No manual configuration required — UI shows what's available.

---

## 3. Workspaces (Interactive Execution Environments)

### Goal
Add interactive, collaborative AI sessions where user and agent work together in real-time with terminal, file changes, and approval workflows.

### Architecture
Workspaces are a **parallel mode** alongside existing autonomous execution. Users choose "Execute autonomously" or "Open workspace."

### Database Models (New)
```prisma
enum WorkspaceStatus {
  creating
  active
  paused
  completed
  error
}

model Workspace {
  id            String          @id @default(cuid())
  userId        String
  taskId        String?         // Optional link to existing task
  repositoryId  String?         // For remote repos
  projectId     String?
  name          String
  description   String          @default("")
  status        WorkspaceStatus @default(creating)
  agentId       String          @default("claude-code") // Which agent to use
  agentModel    String?         // Specific model override
  worktreePath  String?         // Git worktree path
  worktreeBranch String?        // Branch created for this workspace
  localPath     String?         // For local folder workspaces
  settings      Json            @default("{}")
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  completedAt   DateTime?

  user       User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  task       Task?             @relation(fields: [taskId], references: [id], onDelete: SetNull)
  repository Repository?       @relation(fields: [repositoryId], references: [id], onDelete: SetNull)
  project    Project?          @relation(fields: [projectId], references: [id], onDelete: SetNull)
  sessions   WorkspaceSession[]

  @@index([userId, status])
}

model WorkspaceSession {
  id           String   @id @default(cuid())
  workspaceId  String
  agentPid     Int?     // OS process ID of agent
  status       String   @default("active") // active, completed, error
  startedAt    DateTime @default(now())
  endedAt      DateTime?

  workspace Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  messages  WorkspaceMessage[]

  @@index([workspaceId])
}

model WorkspaceMessage {
  id        String   @id @default(cuid())
  sessionId String
  role      String   // "user" | "agent" | "system" | "approval"
  content   String
  metadata  Json     @default("{}") // tool calls, file changes, approval details
  createdAt DateTime @default(now())

  session WorkspaceSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
}
```

### Backend Services
```
backend/src/
├── services/
│   ├── workspace/
│   │   ├── workspace-manager.ts    # Create, setup, teardown workspaces
│   │   ├── worktree-manager.ts     # Git worktree create/delete/list
│   │   ├── session-manager.ts      # ACP session lifecycle within workspace
│   │   └── file-watcher.ts         # Watch workspace files for changes
├── routes/
│   └── workspaces.ts               # Workspace CRUD + session APIs
├── websocket/
│   └── workspace-stream.ts         # WebSocket streaming for workspace events
```

### API Routes
```
GET    /api/workspaces                        # List user's workspaces
POST   /api/workspaces                        # Create workspace
GET    /api/workspaces/:id                    # Get workspace details
PATCH  /api/workspaces/:id                    # Update workspace
DELETE /api/workspaces/:id                    # Delete workspace + cleanup worktree
POST   /api/workspaces/:id/sessions           # Start new agent session
POST   /api/workspaces/:id/sessions/:sid/send # Send message to agent
POST   /api/workspaces/:id/sessions/:sid/approve # Approve/reject
POST   /api/workspaces/:id/sessions/:sid/stop # Stop agent session
GET    /api/workspaces/:id/files              # List workspace files
GET    /api/workspaces/:id/diff               # Get git diff of workspace changes
POST   /api/workspaces/:id/terminal           # Create terminal session
WS     /ws/workspace/:id                      # Stream workspace events (agent output, file changes, terminal)
```

### Frontend Pages & Components
```
frontend/src/
├── pages/
│   └── Workspaces.tsx              # Workspace list page
│   └── WorkspaceDetail.tsx         # Workspace execution environment
├── components/
│   └── workspace/
│       ├── WorkspaceLayout.tsx     # Split-pane layout (chat | terminal+files+browser)
│       ├── WorkspaceChat.tsx       # Chat with agent (message input, history, approvals)
│       ├── WorkspaceTerminal.tsx   # xterm.js terminal (uses existing TerminalOutput)
│       ├── WorkspaceFiles.tsx      # File tree + diff viewer for workspace changes
│       ├── WorkspaceBrowser.tsx    # Browser preview iframe (Section 4)
│       ├── AgentSelector.tsx       # Agent picker dropdown with availability badges
│       ├── ApprovalCard.tsx        # Approve/reject agent action card
│       ├── CreateWorkspaceDialog.tsx # Create workspace modal
│       └── WorkspaceStatusBar.tsx  # Status bar showing agent, branch, session info
```

### Workspace Layout
Three-panel resizable layout:
1. **Left panel**: Chat with agent (messages, approvals, send input)
2. **Right top**: Terminal (xterm.js showing agent's terminal output)
3. **Right bottom**: Files & Diff (workspace file tree + changed files with diff view)
4. **Optional bottom**: Browser preview (iframe, toggleable)

### Key Decisions
- **Git worktree isolation**: Each workspace creates a new git worktree on a dedicated branch.
- **Parallel mode**: Workspaces exist alongside autonomous execution. Users choose per-task.
- **Session persistence**: All messages persisted to DB. Can resume workspaces.
- **Agent selection**: Choose agent at workspace creation time.
- **Local folder support**: Workspaces work with both remote repos and local folders.

---

## 4. Built-in Browser Preview (Local Mode Only)

### Goal
Embed a browser preview of the user's dev server inside the workspace, with DevTools-style element inspection and chat referencing.

### Architecture
- **Proxy server**: Fastify route that proxies `localhost:<user_port>` to avoid CORS issues
- **iframe rendering**: Frontend embeds the proxied URL in a sandboxed iframe
- **DevTools bridge**: Inject a small script into proxied HTML that enables click-to-inspect
- **Chat integration**: Inspected elements generate a context snippet sent with the next chat message

### Backend
```
backend/src/
├── services/
│   └── browser-preview/
│       ├── preview-proxy.ts        # HTTP proxy for user's dev server
│       └── devtools-bridge.js      # Injected script for element inspection
├── routes/
│   └── preview.ts                  # Proxy route + config endpoints
```

### Frontend Components
```
frontend/src/components/workspace/
├── WorkspaceBrowser.tsx            # Main browser preview component
├── BrowserToolbar.tsx              # URL bar, back/forward, refresh, device selector
├── DevToolsOverlay.tsx             # Element inspection overlay
└── ElementRefBadge.tsx             # Badge showing referenced element in chat
```

### Proxy Route
```
GET /api/preview/:workspaceId/*     # Proxies to user's dev server
```
The workspace stores the user's dev server port (e.g., 3000). The proxy injects `devtools-bridge.js` into HTML responses.

### DevTools Bridge Protocol
The injected script:
1. Listens for `Ctrl+Shift+Click` to enter inspect mode
2. Highlights hovered elements with an overlay
3. On click, captures: tag name, CSS selector, classes, dimensions, text content, screenshot region
4. Sends captured data to parent via `postMessage`
5. Frontend creates an `ElementRef` context object attached to the next chat message

### Device Emulation
Resize the iframe to standard device sizes:
- Desktop (1920x1080)
- Tablet (768x1024)
- Mobile (375x812)

### Key Decisions
- **Local mode only**: No cloud proxy for security/complexity reasons.
- **Proxy injection**: DevTools bridge script injected server-side into HTML responses.
- **postMessage communication**: iframe ↔ parent frame via structured messages.
- **Element context in chat**: Referenced elements become structured metadata on messages, not pasted HTML.

---

## 5. Advanced Diff Viewer

### Goal
Replace inline code diffs with a proper git diff viewer using `@git-diff-view/react`.

### Implementation
- Install `@git-diff-view/react` and `@git-diff-view/core`
- Create `DiffViewer` component that renders unified/split diffs
- Use in: workspace file changes, task execution output, PR review

### Components
```
frontend/src/components/diff/
├── DiffViewer.tsx          # Main diff component wrapping @git-diff-view/react
├── DiffFileList.tsx        # List of changed files with stats (+/- lines)
└── DiffInlineComment.tsx   # Inline comment on diff lines (future)
```

### Integration Points
- `WorkspaceFiles.tsx` — show diffs for workspace changes
- `LiveFilePreview.tsx` — replace current preview with proper diffs
- `TaskDetail.tsx` — show execution diffs

---

## 6. Library Upgrades

### New Dependencies to Add (frontend/package.json)
```json
{
  "@git-diff-view/react": "latest",
  "@git-diff-view/core": "latest",
  "@lexical/react": "latest",
  "@lexical/markdown": "latest",
  "@lexical/code": "latest",
  "@lexical/list": "latest",
  "lexical": "latest",
  "framer-motion": "latest",
  "react-virtuoso": "latest",
  "zustand": "latest",
  "immer": "latest",
  "@phosphor-icons/react": "latest",
  "@dnd-kit/core": "latest",
  "@dnd-kit/sortable": "latest",
  "@dnd-kit/utilities": "latest"
}
```

### Usage Plan
| Library | Where Used |
|---------|-----------|
| `@git-diff-view/react` | DiffViewer component |
| `lexical` | Workspace chat input (rich text, markdown, code blocks) |
| `framer-motion` | Page transitions, panel animations, workspace layout |
| `react-virtuoso` | Long message lists in chat, file trees, task lists |
| `zustand` | Workspace local state, UI preferences, panel sizes |
| `immer` | Complex state updates in zustand stores |
| `@phosphor-icons/react` | Agent icons, workspace icons, additional icon variety |
| `@dnd-kit` | Kanban-style task drag, workspace panel reordering |

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. **NPX CLI Package**: Create `npx-cli/`, embedded-postgres, CLI entry point, static serving
2. **Schema Updates**: Add Workspace models, local repo support, agent fields
3. **Library Installation**: Install all new frontend dependencies

### Phase 2: Agent Infrastructure (Week 2-3)
4. **Agent Registry**: Agent configs, auto-detection, availability API
5. **ACP Protocol Layer**: Message types, event parsing, session lifecycle
6. **Agent Adapters**: Claude (native ACP), Codex, Cursor, generic fallback
7. **Agent API Routes**: CRUD, detection, session management

### Phase 3: Workspaces (Week 3-5)
8. **Workspace Backend**: Manager, worktree handling, session management
9. **Workspace API Routes**: Full CRUD + session + file + diff endpoints
10. **Workspace WebSocket**: Real-time streaming of agent events
11. **Workspace Frontend**: Layout, chat, terminal, file tree, agent selector
12. **Local Folder Support**: Add local folder repos in local mode

### Phase 4: Browser & Diff (Week 5-6)
13. **Browser Preview Proxy**: Proxy server, DevTools bridge injection
14. **Browser Preview UI**: iframe, toolbar, device emulation, inspect mode
15. **Element Chat Referencing**: Capture inspected elements, attach to messages
16. **Diff Viewer**: DiffViewer component, integrate in workspace + task detail

### Phase 5: Polish & Libraries (Week 6-7)
17. **Lexical Chat Input**: Rich text editor for workspace chat
18. **Framer Motion**: Animations for workspace transitions, panel resizing
19. **React Virtuoso**: Virtualize chat messages, file lists
20. **Zustand Stores**: Workspace state, UI preferences
21. **dnd-kit**: Drag-and-drop in task views
22. **Phosphor Icons**: Agent icons, workspace status icons

### Phase 6: Testing & Release (Week 7-8)
23. **Playwright E2E Tests**: Full test suite for all new features
24. **NPX Package Publishing**: Prepare for npm publish
25. **Documentation**: Update README, add workspace docs
