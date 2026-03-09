# UI Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform AutoSoftware's vanilla frontend into a polished, data-dense, responsive application with light/dark theme, AI-first features, and professional UX using shadcn/ui + Tremor.

**Architecture:** shadcn/ui components (Radix primitives + Tailwind) for UI foundation, Tremor for charts/metrics, CSS variables for theming, context-based theme provider, new backend AI endpoints proxying to Claude API via @anthropic-ai/sdk. All pages fully responsive with mobile-first approach.

**Tech Stack:** React 19, Tailwind CSS v4, shadcn/ui, Tremor, Radix UI, Lucide icons, React Query, React Router, @anthropic-ai/sdk (backend)

**Design Reference:** `docs/plans/2026-03-09-ui-overhaul-design.md`

---

## Phase 1: Foundation (Tasks 1-4)

### Task 1: Install shadcn/ui and Dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/tsconfig.app.json`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/lib/utils.ts`
- Modify: `frontend/src/index.css`

**Step 1: Add path alias to tsconfig**

In `frontend/tsconfig.app.json`, add `baseUrl` and `paths`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Step 2: Add path alias to vite config**

In `frontend/vite.config.ts`, add resolve alias:

```typescript
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5001,
    proxy: {
      "/api": "http://localhost:5002",
    },
  },
});
```

**Step 3: Install dependencies**

```bash
cd frontend
npm install class-variance-authority clsx tailwind-merge
npm install @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-select @radix-ui/react-popover @radix-ui/react-separator @radix-ui/react-scroll-area @radix-ui/react-avatar @radix-ui/react-switch @radix-ui/react-checkbox @radix-ui/react-label @radix-ui/react-sheet
npm install cmdk sonner
npm install @tremor/react recharts
```

**Step 4: Create utils.ts**

Create `frontend/src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 5: Set up CSS variables and theme**

Replace `frontend/src/index.css` with full theme setup:

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-ai: var(--ai);
  --color-ai-foreground: var(--ai-foreground);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.55 0.18 265);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.965 0.001 286);
  --secondary-foreground: oklch(0.205 0.015 286);
  --muted: oklch(0.965 0.001 286);
  --muted-foreground: oklch(0.556 0.016 286);
  --accent: oklch(0.965 0.001 286);
  --accent-foreground: oklch(0.205 0.015 286);
  --destructive: oklch(0.577 0.245 27.33);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0.004 286);
  --input: oklch(0.922 0.004 286);
  --ring: oklch(0.55 0.18 265);
  --ai: oklch(0.65 0.15 300);
  --ai-foreground: oklch(0.985 0 0);
  --radius: 0.5rem;
}

.dark {
  --background: oklch(0.12 0.005 286);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.17 0.005 286);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.17 0.005 286);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.65 0.18 265);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.215 0.015 286);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.215 0.015 286);
  --muted-foreground: oklch(0.556 0.016 286);
  --accent: oklch(0.215 0.015 286);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.33);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.275 0.015 286);
  --input: oklch(0.275 0.015 286);
  --ring: oklch(0.65 0.18 265);
  --ai: oklch(0.7 0.15 300);
  --ai-foreground: oklch(0.985 0 0);
}

body {
  @apply bg-background text-foreground font-sans antialiased;
  font-size: 14px;
  line-height: 1.4;
}

* {
  @apply border-border;
}
```

**Step 6: Verify it compiles**

```bash
cd frontend && npm run build
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): install shadcn/ui, Tremor, and theme foundation"
```

---

### Task 2: Create Core shadcn/ui Components

Create all the base UI components that pages will use. Each component follows shadcn/ui patterns with Radix primitives + CVA variants.

**Files to create:**
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/card.tsx`
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/label.tsx`
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/components/ui/sheet.tsx`
- `frontend/src/components/ui/dropdown-menu.tsx`
- `frontend/src/components/ui/tabs.tsx`
- `frontend/src/components/ui/table.tsx`
- `frontend/src/components/ui/tooltip.tsx`
- `frontend/src/components/ui/select.tsx`
- `frontend/src/components/ui/separator.tsx`
- `frontend/src/components/ui/scroll-area.tsx`
- `frontend/src/components/ui/avatar.tsx`
- `frontend/src/components/ui/switch.tsx`
- `frontend/src/components/ui/checkbox.tsx`
- `frontend/src/components/ui/textarea.tsx`
- `frontend/src/components/ui/skeleton.tsx`
- `frontend/src/components/ui/sonner.tsx` (toast notifications)
- `frontend/src/components/ui/command.tsx` (cmdk-based command palette)

**Step 1:** Create each component file following the shadcn/ui pattern. These are standard shadcn/ui components — use the exact patterns from the shadcn/ui source with CSS variable colors (`bg-primary`, `text-foreground`, etc.) and CVA variants.

Key component notes:
- **button.tsx**: Variants — default, destructive, outline, secondary, ghost, link. Sizes — default, sm, lg, icon
- **badge.tsx**: Variants — default, secondary, destructive, outline
- **table.tsx**: Dense styling with 32px row height
- **command.tsx**: Uses `cmdk` library, will power the Cmd+K palette
- **sheet.tsx**: Uses Radix dialog, will power mobile nav and drawers

**Step 2: Verify build**

```bash
cd frontend && npm run build
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): add shadcn/ui base components"
```

---

### Task 3: Theme Provider and Toggle

**Files:**
- Create: `frontend/src/lib/theme.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Create theme provider**

Create `frontend/src/lib/theme.tsx`:

```typescript
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as Theme) || "system";
    }
    return "system";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const root = document.documentElement;

    function applyTheme(t: Theme) {
      const resolved =
        t === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : t;
      root.classList.toggle("dark", resolved === "dark");
      setResolvedTheme(resolved);
    }

    applyTheme(theme);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  const setTheme = (t: Theme) => {
    localStorage.setItem("theme", t);
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
```

**Step 2: Wrap App with ThemeProvider**

In `frontend/src/App.tsx`, wrap everything in `<ThemeProvider>`:

```typescript
import { ThemeProvider } from "./lib/theme";

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

**Step 3: Verify theme toggle works**

Open browser console, run `document.documentElement.classList.toggle('dark')` and confirm colors change.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): add theme provider with light/dark/system support"
```

---

### Task 4: Responsive Layout Shell

**Files:**
- Rewrite: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/Header.tsx`
- Create: `frontend/src/components/MobileNav.tsx`
- Create: `frontend/src/components/ThemeToggle.tsx`

**Step 1: Create ThemeToggle component**

`frontend/src/components/ThemeToggle.tsx` — Dropdown with Sun/Moon/Monitor icons. Uses `useTheme()` hook. Three options: Light, Dark, System.

**Step 2: Create Sidebar component**

`frontend/src/components/Sidebar.tsx`:
- 240px width, collapsible to 64px with toggle button
- Nav items: Dashboard, Repositories, Tasks, Scans, Activity, Settings
- Each nav item: icon + label (label hidden when collapsed)
- Active state: primary background tint
- User avatar + name at bottom, click opens dropdown (Profile, Settings, Logout)
- Sidebar state stored in localStorage
- Hidden on mobile (<1024px)

**Step 3: Create Header component**

`frontend/src/components/Header.tsx`:
- 48px height, sticky top
- Left: Breadcrumbs (auto-generated from current route)
- Right: Cmd+K search button (kbd hint), theme toggle, notifications bell (future), user avatar dropdown
- Mobile: hamburger menu replaces breadcrumbs

**Step 4: Create MobileNav component**

`frontend/src/components/MobileNav.tsx`:
- Fixed bottom bar, visible only on mobile (<1024px)
- 5 tabs: Dashboard, Repos, Tasks, Activity, More
- "More" opens a Sheet with: Settings, Profile, Theme toggle, Logout
- Active tab highlighted with primary color

**Step 5: Rewrite Layout.tsx**

`frontend/src/components/Layout.tsx`:
- Combines Sidebar + Header + MobileNav + Outlet
- Desktop: sidebar left, header top, main content scrollable
- Tablet: sidebar as drawer (triggered from header hamburger)
- Mobile: no sidebar, bottom nav, header simplified
- Uses Tailwind responsive breakpoints: `lg:` for desktop, `md:` for tablet

**Step 6: Verify all breakpoints**

Open browser, resize through mobile/tablet/desktop. Confirm:
- Desktop: sidebar visible, header shows breadcrumbs
- Tablet: sidebar hidden, hamburger in header opens drawer
- Mobile: bottom nav visible, compact header

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): responsive layout with sidebar, header, and mobile nav"
```

---

## Phase 2: Pages (Tasks 5-11)

### Task 5: Login Page Redesign

**Files:**
- Rewrite: `frontend/src/pages/Login.tsx`

**Step 1: Redesign login page**

- Animated gradient background (subtle CSS animation on a gradient)
- Centered card with frosted glass effect (`backdrop-blur`)
- AutoSoftware logo/wordmark at top
- Tagline: "AI-powered code analysis and improvement"
- Three OAuth buttons using shadcn Button component with provider icons and colors
- Theme-aware (works in both light and dark)
- Fully responsive — card takes full width on mobile with padding

**Step 2: Verify**

Navigate to `/login`, check in both themes, check mobile view.

**Step 3: Commit**

```bash
git commit -m "feat(ui): redesign login page with gradient background"
```

---

### Task 6: Dashboard Page

**Files:**
- Rewrite: `frontend/src/pages/Dashboard.tsx`
- Create: `frontend/src/components/dashboard/MetricCard.tsx`
- Create: `frontend/src/components/dashboard/TaskChart.tsx`
- Create: `frontend/src/components/dashboard/TaskTypeChart.tsx`
- Create: `frontend/src/components/dashboard/ActivityFeed.tsx`
- Create: `frontend/src/components/dashboard/AiInsights.tsx`

**Step 1: Create MetricCard component**

Uses Tremor's metric display pattern. Shows:
- Label, value, trend delta (up/down arrow + percentage), sparkline
- Compact design, fits 6 across on desktop, 3 on tablet, 2 on mobile

**Step 2: Create TaskChart component**

Tremor AreaChart showing task completions over last 30 days. Data from tasks list grouped by date.

**Step 3: Create TaskTypeChart component**

Tremor DonutChart showing task breakdown by type (improvement, bugfix, feature, refactor, security).

**Step 4: Create ActivityFeed component**

Scrollable list of recent events. For now, derive from tasks and scans data (real ActivityEvent model comes later in Phase 3). Each event: icon, title, relative timestamp, link.

**Step 5: Create AiInsights component**

Panel with AI-generated suggestions. For now, static/computed insights:
- Repos not scanned in 7+ days
- Tasks that have been pending for 3+ days
- Failed tasks that need attention
- Styled with violet/purple AI tint

**Step 6: Compose Dashboard page**

Layout:
- **Desktop (3-column grid):** Metrics row (full width, 6 cols) → Charts row (2 cols left, insights right) → Activity feed (full width)
- **Tablet:** Metrics (3 cols) → Charts stacked → Insights → Activity
- **Mobile:** Metrics (2 cols) → Charts stacked → Insights → Activity

**Step 7: Verify with real data**

Connect a repo, trigger a scan, confirm metrics and charts reflect reality.

**Step 8: Commit**

```bash
git commit -m "feat(ui): data-dense dashboard with metrics, charts, activity feed, AI insights"
```

---

### Task 7: Repositories Page

**Files:**
- Rewrite: `frontend/src/pages/Repos.tsx`
- Create: `frontend/src/components/repos/RepoTable.tsx`
- Create: `frontend/src/components/repos/RepoCard.tsx`
- Create: `frontend/src/components/repos/ConnectRepoDialog.tsx`
- Create: `frontend/src/components/repos/RepoDetailDrawer.tsx`

**Step 1: Create RepoTable component**

shadcn Table with columns: Checkbox (for bulk select), Name (with provider icon), Status badge, Last Scan (relative time), Tasks Found count, Scan Interval, Actions dropdown (Scan Now, Pause/Resume, Delete). Dense 32px rows. Sortable headers.

**Step 2: Create RepoCard component**

Alternative card view. Shows repo name, provider, status, last scan, task count, quick actions. Grid layout.

**Step 3: Create ConnectRepoDialog component**

shadcn Dialog. Tabs for each connected provider. Searchable list of available repos. One-click connect button per repo. Loading states.

**Step 4: Create RepoDetailDrawer component**

shadcn Sheet (right side). Shows:
- Repo header (name, provider, status)
- Scan Now button (prominent)
- Mini chart of scan history
- Recent tasks list
- Settings (scan interval, active toggle)

**Step 5: Compose Repos page**

- Header: Title "Repositories", view toggle (table/card), "Connect Repository" button
- Bulk actions bar (appears when checkboxes selected): "Scan Selected", "Delete Selected"
- Table or Card grid based on toggle
- Click row → opens RepoDetailDrawer

**Step 6: Verify**

Connect repo, scan, check table, card view, drawer, bulk actions.

**Step 7: Commit**

```bash
git commit -m "feat(ui): repositories page with table/card views, connect dialog, detail drawer"
```

---

### Task 8: Tasks Page

**Files:**
- Rewrite: `frontend/src/pages/Tasks.tsx`
- Create: `frontend/src/components/tasks/TaskTable.tsx`
- Create: `frontend/src/components/tasks/TaskFilters.tsx`
- Create: `frontend/src/components/tasks/CreateTaskSheet.tsx`

**Step 1: Create TaskFilters component**

Filter chips/badges above the table. Filters: Status (all/pending/in_progress/completed/failed), Type (all types), Priority (all priorities), Source (auto/manual), Repository (dropdown). Each filter is a shadcn Select or toggle group.

**Step 2: Create TaskTable component**

shadcn Table. Columns: Checkbox, Status icon, Title (with repo name below), Type badge, Priority badge, Source badge, PR link (icon if exists), Created (relative), Actions dropdown. Dense rows. Click row → navigate to `/tasks/:id`.

**Step 3: Create CreateTaskSheet component**

shadcn Sheet (right side). Form fields: Repository (select), Title (input), Description (textarea), Type (select), Priority (select). Submit creates task via API.

**Step 4: Compose Tasks page**

- Header: Title "Tasks", task count, "New Task" button
- TaskFilters row
- TaskTable
- Bulk actions: Cancel selected, Re-run selected

**Step 5: Commit**

```bash
git commit -m "feat(ui): tasks page with filters, table, and create sheet"
```

---

### Task 9: Task Detail Page

**Files:**
- Rewrite: `frontend/src/pages/TaskDetail.tsx`

**Step 1: Redesign task detail**

- **Header section:** Back button, title, status badge (with animation for in_progress), priority badge, timestamps (created, completed)
- **Tabs** (shadcn Tabs):
  - **Overview:** Description card, AI summary card (violet tint), metadata
  - **Agent Log:** Scrollable monospace log of agent actions (from metadata if available)
  - **Pull Request:** PR status badge, link, diff stats (additions/deletions)
  - **Commits:** Table of commits with hash (truncated), message, link
- Auto-refresh when status is `in_progress` (every 3s, already exists)
- Error display with red card if failed

**Step 2: Verify with a real task**

Create a task, run it, check all tabs render correctly.

**Step 3: Commit**

```bash
git commit -m "feat(ui): task detail page with tabs for overview, agent log, PR, commits"
```

---

### Task 10: Scans Page (New)

**Files:**
- Create: `frontend/src/pages/Scans.tsx`
- Modify: `frontend/src/App.tsx` (add route)
- Modify: `frontend/src/lib/api.ts` (add scans list endpoint)

**Step 1: Add backend endpoint for all scans**

In `backend/src/routes/scans.ts`, add a `GET /` route that returns all scans for the authenticated user (via their repos), ordered by `scannedAt` desc.

**Step 2: Add API client method**

In `frontend/src/lib/api.ts`, add `scans.list()`.

**Step 3: Create Scans page**

shadcn Table with columns: Repository name, Scanned At (relative), Status badge, Tasks Created count, Summary (truncated). Click row → expand or navigate to scan detail showing full AI analysis summary.

**Step 4: Add route**

In `App.tsx`, add `/scans` route inside the protected layout.

**Step 5: Commit**

```bash
git commit -m "feat(ui): add scans page with scan history table"
```

---

### Task 11: Activity Page (New) and Settings Redesign

**Files:**
- Create: `frontend/src/pages/Activity.tsx`
- Rewrite: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/App.tsx` (add route)

**Step 1: Create Activity page**

Full-page activity feed. For now, derive events from tasks and scans (sorted by date). Each event: icon (by type), title, description, relative timestamp, link to entity. Filter bar: event type, repo.

**Step 2: Redesign Settings page**

shadcn Tabs layout:
- **Profile tab:** Avatar (shadcn Avatar), name, email (read-only from OAuth). Connected providers list with connect/disconnect buttons.
- **Preferences tab:** Theme selector (Light/Dark/System using radio group), default scan interval input, notification toggles (future)
- **API tab:** Anthropic API key status (green checkmark if env var set, masked display), budget display (scan budget, task budget)

**Step 3: Add Activity route**

In `App.tsx`, add `/activity` route.

**Step 4: Commit**

```bash
git commit -m "feat(ui): add activity page and redesign settings with tabs"
```

---

## Phase 3: AI Features (Tasks 12-15)

### Task 12: Database Models and Backend AI Endpoints

**Files:**
- Modify: `prisma/schema.prisma` (add AiInsight, ActivityEvent models)
- Create: `backend/src/routes/ai.ts`
- Create: `backend/src/routes/activity.ts`
- Modify: `backend/src/index.ts` (register new routes)

**Step 1: Add Prisma models**

Add `AiInsight` and `ActivityEvent` models to schema as specified in the design doc. Run migration:

```bash
npx prisma migrate dev --name add-ai-and-activity-models
```

**Step 2: Create activity routes**

`backend/src/routes/activity.ts`:
- `GET /` — returns activity events for user, paginated, with optional `type` and `repoId` query filters. Falls back to deriving events from tasks/scans if ActivityEvent table is empty.

**Step 3: Create AI routes**

`backend/src/routes/ai.ts`:
- `POST /command` — receives `{ text: string }`, uses Anthropic SDK to parse intent, returns `{ action: string, params: object }`. Actions: "scan", "create_task", "navigate", "search".
- `POST /chat` — receives `{ message: string, context?: object }`, streams response from Claude via SSE. Backend builds system prompt with user's repo/task context.
- `GET /insights` — returns cached AiInsight records for user, filtered by `dismissed: false` and `expiresAt > now`.

**Step 4: Register routes**

In `backend/src/index.ts`:
```typescript
import { aiRoutes } from "./routes/ai.js";
import { activityRoutes } from "./routes/activity.js";

await app.register(aiRoutes, { prefix: "/api/ai" });
await app.register(activityRoutes, { prefix: "/api/activity" });
```

**Step 5: Install Anthropic SDK in backend**

```bash
cd backend && npm install @anthropic-ai/sdk
```

**Step 6: Commit**

```bash
git commit -m "feat: add AI command/chat/insights and activity backend endpoints"
```

---

### Task 13: Command Palette (Cmd+K)

**Files:**
- Create: `frontend/src/components/CommandPalette.tsx`
- Modify: `frontend/src/App.tsx` (add palette)
- Modify: `frontend/src/lib/api.ts` (add AI endpoints)

**Step 1: Add API methods**

In `frontend/src/lib/api.ts`:
```typescript
ai: {
  command: (text: string) => request<any>("/ai/command", { method: "POST", body: JSON.stringify({ text }) }),
  insights: () => request<any[]>("/ai/insights"),
},
activity: {
  list: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : "";
    return request<any[]>(`/activity${qs}`);
  },
},
```

**Step 2: Create CommandPalette component**

Uses `cmdk` library (already in `command.tsx` ui component). Features:
- Opens with Cmd+K (Mac) / Ctrl+K (Windows)
- Search input at top
- Groups: Quick Actions (Scan repo, Create task, Toggle theme), Navigation (Dashboard, Repos, Tasks...), Recent (last 5 commands stored in localStorage)
- AI mode: if input doesn't match any command, send to `/api/ai/command` and execute returned action
- Uses `useNavigate()` for navigation actions, `api.repos.scan()` for scan actions, etc.
- Fuzzy matching against repo names and task titles from React Query cache

**Step 3: Add to App.tsx**

Render `<CommandPalette />` inside the BrowserRouter (needs access to navigate).

**Step 4: Verify end-to-end**

Press Cmd+K, type "scan", select a repo, confirm scan triggers. Type "tasks", confirm navigation. Type natural language, confirm AI parses and executes.

**Step 5: Commit**

```bash
git commit -m "feat(ui): add command palette with fuzzy search and AI commands"
```

---

### Task 14: AI Chat Drawer (Cmd+J)

**Files:**
- Create: `frontend/src/components/AiChat.tsx`
- Modify: `frontend/src/components/Header.tsx` (add chat trigger)
- Modify: `frontend/src/lib/api.ts` (add streaming chat)

**Step 1: Add streaming chat API**

In `frontend/src/lib/api.ts`, add a non-standard method that uses EventSource/fetch with streaming:

```typescript
ai: {
  // ... existing
  chat: async function* (message: string, context?: object) {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value);
    }
  },
},
```

**Step 2: Create AiChat component**

Sheet from right side, 400px wide (full screen on mobile). Features:
- Message list (user messages right-aligned, AI messages left-aligned with violet tint)
- Input at bottom with send button
- Streaming response renders incrementally
- Keyboard shortcut: Cmd+J to toggle
- Context-aware: passes current route/page info
- Chat history persisted in component state (reset on close)
- Markdown rendering for AI responses (basic: bold, code, lists)

**Step 3: Add trigger to Header**

AI chat icon button in header, opens the drawer. Also shows Cmd+J hint on hover.

**Step 4: Verify end-to-end**

Open chat, ask "What repos do I have?", confirm streaming response with real data.

**Step 5: Commit**

```bash
git commit -m "feat(ui): add AI chat drawer with streaming responses"
```

---

### Task 15: Embedded AI Insights

**Files:**
- Modify: `frontend/src/components/dashboard/AiInsights.tsx` (connect to real API)
- Create: `backend/src/services/insights-generator.ts`
- Modify: `worker/src/handlers/scan.ts` (trigger insight generation after scan)

**Step 1: Create insights generator service**

`backend/src/services/insights-generator.ts`:
- Function `generateInsights(userId: string)` — queries user's repos, tasks, scans, sends summary to Claude, parses structured response into AiInsight records
- Called after scan completion (from worker) and on-demand via `POST /api/ai/insights/refresh`
- Insights have 24h expiry, are regenerated on next scan

**Step 2: Connect dashboard AiInsights to API**

Replace static insights with `useQuery` call to `/api/ai/insights`. Each insight card: icon (by type), title, description, dismiss button, action button (e.g., "Scan Now" for stale repo insight).

**Step 3: Trigger insights after scan**

In `worker/src/handlers/scan.ts`, after creating ScanResult, call insights generator endpoint or directly invoke the function.

**Step 4: Commit**

```bash
git commit -m "feat: embedded AI insights generated after scans"
```

---

## Phase 4: Polish (Tasks 16-18)

### Task 16: Toast Notifications

**Files:**
- Modify: `frontend/src/App.tsx` (add Sonner Toaster)
- Modify all pages to use `toast()` for success/error feedback

**Step 1: Add Toaster**

In `App.tsx`, add `<Toaster />` from sonner. Configure theme-aware (uses `resolvedTheme`).

**Step 2: Add toasts to all actions**

- Repo connected: "Repository connected successfully"
- Scan triggered: "Scan queued for {repo}"
- Task created: "Task created successfully"
- Errors: "Failed to connect repository: {error}"
- Use `toast.success()`, `toast.error()`, `toast.loading()` patterns

**Step 3: Commit**

```bash
git commit -m "feat(ui): add toast notifications for all user actions"
```

---

### Task 17: Loading States and Skeletons

**Files:**
- Modify all pages to add skeleton loading states

**Step 1: Add skeleton loading to every page**

- Dashboard: Skeleton metric cards, skeleton chart areas, skeleton feed items
- Repos: Skeleton table rows
- Tasks: Skeleton table rows
- Task Detail: Skeleton header, skeleton tabs
- Settings: Skeleton profile card

Use the `Skeleton` component created in Task 2. Pattern:

```tsx
if (isLoading) return <DashboardSkeleton />;
```

**Step 2: Add empty states**

When data is empty (no repos, no tasks), show helpful empty state with illustration/icon and CTA button (e.g., "Connect your first repository").

**Step 3: Commit**

```bash
git commit -m "feat(ui): add skeleton loading states and empty states"
```

---

### Task 18: Final Responsive Polish and Testing

**Files:**
- Various touch-ups across all components

**Step 1: Test all breakpoints**

Go through every page at:
- 375px (iPhone SE)
- 768px (iPad)
- 1024px (iPad landscape)
- 1440px (desktop)
- 1920px (large desktop)

Fix any overflow, truncation, or layout issues.

**Step 2: Test theme consistency**

Toggle between light, dark, system. Verify every page, every component, every chart renders correctly in both themes.

**Step 3: Test all interactions**

- Login → Dashboard → Connect repo → Scan → View tasks → Task detail → Settings
- Command palette (Cmd+K) → search, navigate, AI command
- AI Chat (Cmd+J) → ask question, get streaming response
- Mobile: bottom nav, all pages, sheets instead of dialogs
- Bulk actions on repos and tasks

**Step 4: Performance check**

```bash
cd frontend && npm run build
```

Check bundle size. Should be under 500KB gzipped. If larger, check for unnecessary imports.

**Step 5: Final commit**

```bash
git commit -m "feat(ui): responsive polish and cross-browser testing"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1. Foundation | 1-4 | shadcn/ui, theme, responsive layout |
| 2. Pages | 5-11 | All pages redesigned + new pages |
| 3. AI Features | 12-15 | Command palette, chat, insights |
| 4. Polish | 16-18 | Toasts, skeletons, responsive testing |

**Total: 18 tasks.** Each task is independently committable and testable.
