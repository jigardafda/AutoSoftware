# AutoSoftware UI Overhaul Design

## Decisions

- **Component library:** shadcn/ui (Radix + Tailwind)
- **Charts:** Tremor
- **Visual style:** Data-dense (compact, information-rich)
- **Theme:** Light/dark/system with CSS variables
- **Responsive:** Equal parity across desktop, tablet, mobile
- **AI approach:** Command palette + chat drawer + embedded insights, all end-to-end functional
- **Icons:** Lucide React (existing)

## Design System

### Colors (CSS Variables)

- Light: white bg, zinc-100 surfaces, zinc-950 text
- Dark: zinc-950 bg, zinc-900 surfaces, zinc-50 text
- Primary: indigo-500 (actions, links)
- Success: emerald, Warning: amber, Error: red
- AI surfaces: violet/purple tint to distinguish AI content

### Typography

- System font stack (Inter if available)
- 14px base, 12px secondary
- Compact line heights for data density

### Spacing

- 12px/16px gaps between cards
- 8px internal padding
- Dense tables: 32px row height

### Responsive Breakpoints

- Mobile (<640px): Single column, bottom nav, collapsible panels
- Tablet (640-1024px): 2-column grid, sidebar as drawer
- Desktop (>1024px): Full sidebar + multi-column layouts

## Layout

### Desktop

- Left sidebar (240px, collapsible to 64px): Logo, nav items, user avatar/dropdown
- Top header (48px): Breadcrumbs left, Cmd+K trigger + theme toggle + notifications + user menu right
- Main content: Full width, independent scroll

### Mobile

- Bottom tab bar: Dashboard, Repos, Tasks, Activity, More
- "More" opens sheet: Settings, Profile, Theme, Logout
- Top header: Logo left, Cmd+K + notifications right
- Modals become full-screen sheets

### Navigation Items

- Dashboard (LayoutDashboard icon)
- Repositories (GitBranch icon)
- Tasks (CheckCircle icon)
- Scans (Search icon)
- Activity (Activity icon)
- Settings (Settings icon)

## Pages

### Login

- OAuth buttons for GitHub/GitLab/Bitbucket
- Animated gradient background, theme-aware
- Logo + tagline

### Dashboard

- **Top metrics row:** 6 Tremor metric cards with sparklines — Repos, Pending, In Progress, Completed, Failed, Active Scans
- **Charts row (2-col):** Task completion area chart, tasks by type donut chart
- **Activity feed:** Real-time scrolling events — scans, tasks, PRs with timestamps and links
- **AI Insights panel** (right column desktop): Smart suggestions, trend alerts, scan recommendations. Pre-computed and cached.

### Repositories

- **Table view** (default): Name, Provider icon, Status, Last Scan, Tasks Found, Scan Interval, Actions
- **Card view** toggle
- Inline actions: Scan Now, Pause, Settings, Delete
- **Bulk scan:** Select multiple repos, "Scan Selected"
- Connect repo: Dialog with provider tabs, searchable list, one-click connect
- Row click → side drawer: scan history chart, recent tasks, settings

### Tasks

- **Filterable table:** Status, Type, Priority, Source, Repository as filter chips
- Sortable columns, bulk actions (cancel, re-run)
- Create task: Sheet with repo selector, title, description, type, priority
- Status badges, PR link column with status
- Row click → Task detail page

### Task Detail

- Header: Title, status badge, priority, timestamps
- Tabs: Overview | Agent Log | PR | Commits
- Overview: Description, AI summary, metadata
- Agent Log: Scrollable execution log
- PR: Status, link, diff stats
- Commits: List with messages and hashes

### Scans (new)

- Scan history table across all repos
- Duration, tasks found, status
- Click → scan detail with AI analysis summary

### Activity (new)

- Full-page real-time activity feed
- Filter by event type and repo

### Settings

- **Profile tab:** Avatar, name, email, providers connect/disconnect
- **Preferences tab:** Theme, default scan interval, notifications
- **API tab:** API key status (masked), budget display

### User Profile

- Stats: tasks created, PRs opened, repos connected
- Activity history

## AI Features

### Command Palette (Cmd+K)

- Backend: `POST /api/ai/command` — Claude parses natural language intent, returns action
- Actions: scan repo, create task, show filtered tasks, navigate
- Also fuzzy search across repos/tasks/scans
- Recent commands history
- Frontend executes returned action (API call + navigation)

### AI Chat (Cmd+J)

- Backend: `POST /api/ai/chat` — streaming response
- Context-aware: current page, selected repo/task
- Answers: "What's wrong with repo X?", "Summarize scan results", "What to prioritize?"
- Backend proxies to Claude API with user context
- Streaming rendered in slide-in drawer

### Embedded AI Insights

- Backend: `GET /api/ai/insights` — cached, regenerated on scan completion
- Dashboard: Suggestions panel (stale repos, trends, priorities)
- Task cards: AI confidence, estimated complexity
- Repo page: Health indicator from scan results
- Stored in `AiInsight` DB table, not real-time calls

### Manual Scan Triggers

- Repos table: "Scan Now" button per row
- Repo detail drawer: Prominent scan button
- Command palette: "scan {repo-name}"
- Dashboard: Quick-scan on repo cards
- Bulk: Select repos → "Scan Selected"

## New Backend Endpoints

- `POST /api/ai/command` — parse natural language command
- `POST /api/ai/chat` — streaming AI chat
- `GET /api/ai/insights` — cached AI insights
- `GET /api/activity` — activity feed (aggregated events)

## New DB Model

```
model AiInsight {
  id           String   @id @default(cuid())
  userId       String
  type         String   // "suggestion" | "trend" | "alert"
  title        String
  description  String
  metadata     Json?
  dismissed    Boolean  @default(false)
  createdAt    DateTime @default(now())
  expiresAt    DateTime?
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ActivityEvent {
  id           String   @id @default(cuid())
  userId       String
  type         String   // "scan_started" | "scan_completed" | "task_created" | "task_completed" | "pr_opened" | "pr_merged"
  entityId     String?
  entityType   String?  // "repository" | "task" | "scan"
  title        String
  metadata     Json?
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Dependencies to Add

- shadcn/ui (via CLI init)
- @radix-ui/* (installed by shadcn)
- tremor (@tremor/react)
- class-variance-authority (shadcn dep)
- @anthropic-ai/sdk (backend, for AI chat/commands)
