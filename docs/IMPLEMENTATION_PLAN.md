# AutoSoftware Phase 1 & 2 Implementation Plan

## Context

The user wants to build Phase 1 and Phase 2 features from the ROADMAP.md (excluding AI: Security), plus a new Analytics Dashboard for tracking lines of code changed and engineering hours saved at user/project/task levels.

**Current Architecture:**
- Backend: Fastify 5.8.2 + PostgreSQL + Prisma + pg-boss job queue
- Frontend: React 19 + React Query + Radix UI + Tailwind CSS v4
- Worker: Separate Node.js process with Claude Agent SDK
- No WebSocket infrastructure (currently uses HTTP polling)

---

## Implementation Order

Given dependencies and user impact, build in this order:

| Priority | Feature | Why This Order |
|----------|---------|----------------|
| 1 | Analytics Dashboard | Immediately useful, tracks ROI, attracts users |
| 2 | WebSocket Infrastructure | Foundation for all real-time features |
| 3 | Real-Time Updates | Live task/scan progress (depends on #2) |
| 4 | Team Presence | Online indicators, viewing badges (depends on #2) |
| 5 | AI Analysis Depth | Smarter scans, better findings |
| 6 | AI Accuracy | Confidence scores, severity calibration |
| 7 | AI Performance Analysis | N+1, memory leaks, bundle analysis |
| 8 | Dry-Run Mode | Preview changes before execution |
| 9 | Multi-File Operations | Coordinated refactoring |
| 10 | Error Recovery | Auto-retry, self-healing |
| 11 | Context Awareness | Code style matching |
| 12 | Live Execution View | Agent activity feed (depends on #2) |
| 13 | Agent Swarm | Parallel task execution |
| 14 | Isolated Environments | Auto-managed ports |

---

## Phase 1: Analytics Dashboard (Comprehensive)

The Analytics Dashboard will be a comprehensive, feature-packed summary that shows:
- **ROI Metrics**: Cost savings, hours saved, productivity gains
- **Cost & Token Usage**: Real-time and historical token consumption
- **Task Analytics**: Volume, distribution, completion rates, pipeline health
- **Top Contributors**: Leaderboard with activity counts and impact
- **Trend Analysis**: Week-over-week, month-over-month comparisons
- **Drill-down**: User → Project → Task → File level detail

### Database Schema Changes

**File:** `/prisma/schema.prisma`

```prisma
model CodeChangeMetrics {
  id               String   @id @default(cuid())
  taskId           String   @unique
  userId           String
  repositoryId     String
  projectId        String?

  linesAdded       Int      @default(0)
  linesDeleted     Int      @default(0)
  filesChanged     Int      @default(0)
  fileBreakdown    Json     @default("[]")
  commitCount      Int      @default(0)

  createdAt        DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([repositoryId, createdAt])
  @@index([projectId, createdAt])
}

model EngineeringTimeSaved {
  id                    String   @id @default(cuid())
  taskId                String   @unique
  userId                String
  repositoryId          String
  projectId             String?

  estimatedMinutesSaved Int      @default(0)
  locFactor             Float    @default(0)
  complexityFactor      Float    @default(1.0)
  contextFactor         Float    @default(1.0)
  methodologyVersion    Int      @default(1)

  createdAt             DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([repositoryId, createdAt])
  @@index([projectId, createdAt])
}
```

Add to Task model:
```prisma
codeChangeMetrics     CodeChangeMetrics?
engineeringTimeSaved  EngineeringTimeSaved?
```

### LOC Capture in Worker

**File:** `/worker/src/handlers/execute.ts` (modify after commit, before PR creation ~line 188)

Capture git diff stats using `simple-git`:
```typescript
const diffSummary = await git.diffSummary([`origin/${baseBranch}...HEAD`]);
await prisma.codeChangeMetrics.create({
  data: {
    taskId,
    userId: task.userId,
    repositoryId: task.repositoryId,
    projectId: task.projectId,
    linesAdded: diffSummary.insertions,
    linesDeleted: diffSummary.deletions,
    filesChanged: diffSummary.changed,
    fileBreakdown: diffSummary.files.map(f => ({
      path: f.file, added: f.insertions, deleted: f.deletions
    })),
    commitCount: (await git.log([`origin/${baseBranch}..HEAD`])).total,
  },
});
```

### Time Saved Calculation

**New File:** `/worker/src/services/time-estimation.ts`

Formula: `baseMinutesPerLoc * linesChanged * taskTypeMultiplier * filesComplexityMultiplier`

- Base rate: 4 minutes per LOC (conservative industry estimate)
- Task type multipliers: bugfix=1.5, security=2.0, refactor=0.8, improvement=1.0, feature=1.2
- Files complexity: 1-2 files=1.0x, 3-5=1.2x, 5-10=1.5x, 10-20=2.0x, 20+=2.5x

### Backend Routes

**New File:** `/backend/src/routes/analytics.ts`

| Route | Purpose |
|-------|---------|
| `GET /api/analytics/overview` | Summary metrics with trends |
| `GET /api/analytics/loc` | Time-series LOC data |
| `GET /api/analytics/time-saved` | Time-series hours saved |
| `GET /api/analytics/drill-down/user/:userId` | User breakdown |
| `GET /api/analytics/drill-down/project/:projectId` | Project breakdown |
| `GET /api/analytics/drill-down/task/:taskId` | Task file-level detail |
| `GET /api/analytics/comparison` | Week-over-week, user-vs-user |
| `GET /api/analytics/export` | CSV/JSON download |

Register in `/backend/src/index.ts`.

### Frontend Components

**New Page:** `/frontend/src/pages/Analytics.tsx`

**New Components Directory:** `/frontend/src/components/analytics/`
- `AnalyticsOverviewCards.tsx` - Metric cards with trends
- `LOCTimeSeriesChart.tsx` - Recharts stacked area (added/deleted)
- `TimeSavedChart.tsx` - Bar chart for hours saved
- `DrillDownExplorer.tsx` - Collapsible tree: User > Project > Task
- `ComparisonChart.tsx` - Side-by-side comparison
- `ExportDialog.tsx` - CSV/JSON export UI

**Modify:** `/frontend/src/components/Sidebar.tsx` - Add Analytics nav item
**Modify:** `/frontend/src/App.tsx` - Add `/analytics` route
**Modify:** `/frontend/src/lib/api.ts` - Add analytics API methods

### Analytics Dashboard Design (Comprehensive UI)

The dashboard will be organized into logical sections with a modern, information-dense layout:

#### Section 1: Executive Summary (Top Row)
```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ TOTAL TASKS     │ HOURS SAVED     │ COST (TOKENS)   │ ROI             │ SUCCESS RATE    │
│ 1,247           │ 3,892 hrs       │ $847.23         │ 459x            │ 94.2%           │
│ ↑ 23% vs last   │ ↑ 18% vs last   │ ↓ 12% vs last   │ ↑ 31% vs last   │ ↑ 2.1% vs last  │
│ [sparkline]     │ [sparkline]     │ [sparkline]     │ [sparkline]     │ [sparkline]     │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

#### Section 2: Time-Series Charts (Full Width)
- **Primary Chart**: Stacked area showing tasks completed, LOC changed, hours saved over time
- **Secondary Chart**: Token usage and cost over time
- **Date Range Selector**: Today, 7 days, 30 days, 90 days, custom range
- **Grouping**: By day, week, month

#### Section 3: Task Pipeline Health (Left Column)
```
Pipeline Summary
────────────────────────
Pending     ██████░░░░  127 tasks
Planning    ████░░░░░░   58 tasks
In Progress ██░░░░░░░░   23 tasks
Completed   █████████░  892 tasks
Failed      █░░░░░░░░░   15 tasks

Avg Time to Complete: 4.2 hours
Avg Planning Rounds: 1.3
```

#### Section 4: Task Distribution (Center Column)
- **By Type**: Pie chart (bugfix, feature, refactor, improvement, security)
- **By Priority**: Bar chart (critical, high, medium, low)
- **By Repository**: Top 10 repos by task volume
- **By Project**: Top 10 projects by activity

#### Section 5: Top Contributors Leaderboard (Right Column)
```
TOP CONTRIBUTORS
────────────────────────────────────────
#1 🥇 Sarah Chen         487 tasks │ 1,234 hrs saved
#2 🥈 John Smith         412 tasks │   987 hrs saved
#3 🥉 Alex Kumar         398 tasks │   876 hrs saved
#4    Maria Garcia       356 tasks │   754 hrs saved
#5    David Kim          312 tasks │   698 hrs saved
────────────────────────────────────────
[View All Contributors]
```

#### Section 6: Cost & ROI Analysis
```
COST BREAKDOWN                    ROI CALCULATION
────────────────────────────────  ────────────────────────────────
Model Usage:                      Engineering Cost Saved:
  Claude Sonnet: $623.45 (74%)      3,892 hrs × $75/hr = $291,900
  Claude Haiku:  $178.92 (21%)    Platform Cost: $847.23
  Claude Opus:    $44.86 (5%)     NET SAVINGS: $291,052.77
                                  ROI: 343x return
Token Distribution:
  Input:  12.4M tokens (32%)      [Configure hourly rate: $75/hr]
  Output: 26.2M tokens (68%)
```

#### Section 7: Activity Timeline
Real-time feed of recent activities:
- "Task #1247 completed - Added login validation (12 files, 847 LOC)"
- "Scan completed on repo/frontend - Found 8 improvements"
- "John Smith saved 4.2 hours on feature/auth-flow"

#### Section 8: Detailed Tables (Expandable Sections)
- **Tasks Table**: Sortable, filterable, with LOC/hours saved columns
- **Projects Table**: Aggregated metrics per project
- **Users Table**: Individual contributor statistics
- **Export Options**: CSV, JSON, PDF report

### Analytics API Endpoints (Extended)

| Route | Purpose |
|-------|---------|
| `GET /api/analytics/overview` | Executive summary metrics |
| `GET /api/analytics/roi` | ROI calculation with configurable hourly rate |
| `GET /api/analytics/costs` | Token usage and cost breakdown by model |
| `GET /api/analytics/pipeline` | Task pipeline health and flow metrics |
| `GET /api/analytics/distribution` | Task distribution by type/priority/repo |
| `GET /api/analytics/contributors` | Leaderboard and contributor stats |
| `GET /api/analytics/trends` | Time-series data with configurable grouping |
| `GET /api/analytics/loc` | Lines of code metrics over time |
| `GET /api/analytics/time-saved` | Engineering hours saved over time |
| `GET /api/analytics/drill-down/:type/:id` | Drill-down by user/project/task |
| `GET /api/analytics/export` | Export data in CSV/JSON/PDF |
| `PUT /api/analytics/settings` | Configure ROI hourly rate, display preferences |

### Analytics Components (Extended List)

**New Components:** `/frontend/src/components/analytics/`
- `AnalyticsPage.tsx` - Main page layout with sections
- `ExecutiveSummaryCards.tsx` - Top row metric cards with sparklines
- `TimeSeriesChart.tsx` - Multi-series area/line chart
- `CostUsageChart.tsx` - Token and cost visualization
- `PipelineHealthCard.tsx` - Task pipeline funnel
- `TaskDistributionCharts.tsx` - Type/priority/repo breakdowns
- `ContributorsLeaderboard.tsx` - Top contributors with rankings
- `ROICalculator.tsx` - Cost savings breakdown with configurable rate
- `ActivityTimeline.tsx` - Real-time activity feed
- `AnalyticsFilters.tsx` - Date range, project, user filters
- `DrillDownModal.tsx` - Detailed drill-down view
- `ExportDialog.tsx` - Multi-format export options
- `AnalyticsSettings.tsx` - Configure ROI hourly rate

---

## Phase 2: WebSocket Infrastructure

### Library Choice

Use `@fastify/websocket` - native Fastify integration, reuses auth hooks, minimal overhead.

### Server Architecture

**New Files:**
- `/backend/src/websocket/index.ts` - Plugin registration
- `/backend/src/websocket/connection-manager.ts` - Track connections per user/resource
- `/backend/src/websocket/event-emitter.ts` - PostgreSQL LISTEN/NOTIFY integration

### Worker-to-Backend Communication

Use PostgreSQL LISTEN/NOTIFY for cross-process events:

**New File:** `/worker/src/services/event-notifier.ts`
```typescript
await pool.query(`SELECT pg_notify($1, $2)`,
  ["autosoftware:task_update", JSON.stringify({ taskId, status })]
);
```

Modify handlers to emit notifications after state changes.

### Message Protocol

Client → Server:
- `subscribe` / `unsubscribe` to resources
- `viewing:start` / `viewing:stop` for presence
- `heartbeat` for keep-alive

Server → Client:
- `task:update`, `task:log`, `task:status`
- `scan:update`, `scan:log`, `scan:progress`
- `presence:online`, `presence:join`, `presence:leave`, `presence:viewing`

### Frontend WebSocket Layer

**New Files:**
- `/frontend/src/lib/websocket/WebSocketProvider.tsx` - Context with reconnection
- `/frontend/src/lib/websocket/useSubscription.ts` - Resource subscription hook
- `/frontend/src/lib/websocket/usePresence.ts` - Presence state hook

Integration: Use WebSocket messages to invalidate React Query caches.

**Modify:** `/frontend/vite.config.ts` - Add WebSocket proxy:
```typescript
"/ws": { target: "ws://localhost:5002", ws: true }
```

---

## Phase 3: Team Presence

### Database

Add to schema:
```prisma
model UserPresence {
  id          String   @id @default(cuid())
  userId      String   @unique
  lastSeenAt  DateTime @default(now())
  isOnline    Boolean  @default(true)
  currentView String?
  updatedAt   DateTime @updatedAt
  user        User     @relation(...)
}
```

### Components

- `/frontend/src/components/ConnectionIndicator.tsx` - Live/Reconnecting badge
- `/frontend/src/components/ViewerBadges.tsx` - "Sarah is viewing" avatars
- `/frontend/src/components/OnlineUsers.tsx` - Team presence list

---

## Phase 4: AI Intelligence Enhancements

### Schema Additions

Add to Task model:
```prisma
confidenceScore     Float?    // 1-10
severityLevel       String?   // "critical" | "major" | "minor" | "nitpick"
falsePositiveRisk   Float?    // 0-1 probability
architecturePattern String?
executionMode       String    @default("normal") // "normal" | "dry_run"
dryRunOutput        Json?
retryCount          Int       @default(0)
testsPassing        Boolean?
lintPassing         Boolean?
```

New models:
```prisma
model CodeAnalysisResult {
  id                  String   @id @default(cuid())
  scanResultId        String
  architecturePattern String?
  dependencies        Json     // Import graph
  deadCodePaths       Json     // Unused exports/functions
  duplications        Json     // Code duplication findings
  performanceIssues   Json     // N+1, memory leaks, etc.
  createdAt           DateTime @default(now())
}

model ProjectConvention {
  id              String @id @default(cuid())
  repositoryId    String
  indentStyle     String?
  quoteStyle      String?
  namingConvention String?
  frameworkPatterns Json
  detectedAt      DateTime @default(now())
}
```

### Enhanced Scan Prompts

**Modify:** `/worker/src/handlers/scan.ts`

Add structured analysis for:
- Architecture pattern detection (MVC, microservices, etc.)
- Dependency graph building
- Dead code identification
- Duplication detection
- Performance anti-patterns (N+1, inefficient algorithms)

Return confidence scores (1-10) and severity calibration with each finding.

### Dry-Run Mode

**Modify:** `/worker/src/handlers/execute.ts`

When `task.executionMode === "dry_run"`:
1. Run agent with read-only tools only
2. Collect proposed changes without committing
3. Store in `task.dryRunOutput`
4. Set `task.status = "dry_run_complete"`

Frontend shows diff preview before user approves actual execution.

### Error Recovery

**Modify:** `/worker/src/handlers/execute.ts`

Implement retry logic:
1. On failure, check if `retryCount < 3`
2. Analyze error and generate alternative approach prompt
3. Re-run with modified strategy
4. Track `lastRetryReason`

Self-healing: If tests fail after changes, attempt automatic fix.

### Context Awareness

**New File:** `/worker/src/services/convention-detector.ts`

Detect from codebase:
- Indentation (tabs vs spaces)
- Quote style (single vs double)
- Naming conventions (camelCase, snake_case)
- Framework patterns (React hooks, etc.)
- Existing utilities to reuse

Inject detected conventions into agent prompts.

---

## Phase 5: Agent Swarm & Environments

### Parallel Execution

Increase pg-boss concurrency for task handlers:
```typescript
{ concurrency: 5 }  // Up from 1
```

Add agent coordination via internal messaging table.

### Isolated Environments

**New File:** `/worker/src/services/port-manager.ts`

Auto-assign unique ports per task execution:
- Track used ports in database
- Allocate from range (3000-4000)
- Release on task completion

---

## Files Summary

### New Files to Create

| Path | Purpose |
|------|---------|
| `/backend/src/routes/analytics.ts` | Analytics API endpoints |
| `/backend/src/websocket/index.ts` | WebSocket plugin |
| `/backend/src/websocket/connection-manager.ts` | Connection tracking |
| `/backend/src/websocket/event-emitter.ts` | PG LISTEN/NOTIFY |
| `/worker/src/services/event-notifier.ts` | Emit WS events |
| `/worker/src/services/time-estimation.ts` | Hours saved calculation |
| `/worker/src/services/convention-detector.ts` | Code style detection |
| `/worker/src/services/port-manager.ts` | Port allocation |
| `/frontend/src/pages/Analytics.tsx` | Main analytics page |
| `/frontend/src/components/analytics/ExecutiveSummaryCards.tsx` | Top row metrics |
| `/frontend/src/components/analytics/TimeSeriesChart.tsx` | Main trend chart |
| `/frontend/src/components/analytics/CostUsageChart.tsx` | Token/cost chart |
| `/frontend/src/components/analytics/PipelineHealthCard.tsx` | Pipeline funnel |
| `/frontend/src/components/analytics/TaskDistributionCharts.tsx` | Pie/bar charts |
| `/frontend/src/components/analytics/ContributorsLeaderboard.tsx` | Top contributors |
| `/frontend/src/components/analytics/ROICalculator.tsx` | ROI breakdown |
| `/frontend/src/components/analytics/ActivityTimeline.tsx` | Activity feed |
| `/frontend/src/components/analytics/AnalyticsFilters.tsx` | Filters |
| `/frontend/src/components/analytics/DrillDownModal.tsx` | Drill-down view |
| `/frontend/src/components/analytics/ExportDialog.tsx` | Export options |
| `/frontend/src/lib/websocket/*.tsx` | WebSocket client |
| `/frontend/src/components/ConnectionIndicator.tsx` | Connection status |
| `/frontend/src/components/ViewerBadges.tsx` | Presence UI |

### Files to Modify

| Path | Changes |
|------|---------|
| `/prisma/schema.prisma` | New tables, Task fields |
| `/backend/src/index.ts` | Register routes, WS plugin |
| `/backend/package.json` | Add @fastify/websocket |
| `/worker/src/handlers/execute.ts` | LOC capture, dry-run, retry |
| `/worker/src/handlers/scan.ts` | Enhanced analysis prompts |
| `/worker/src/handlers/plan.ts` | Convention-aware planning |
| `/frontend/src/App.tsx` | WebSocketProvider, routes |
| `/frontend/src/components/Sidebar.tsx` | Analytics nav item |
| `/frontend/src/lib/api.ts` | Analytics API methods |
| `/frontend/src/pages/TaskDetail.tsx` | Replace polling with WS |
| `/frontend/src/pages/ScanDetail.tsx` | Replace polling with WS |
| `/frontend/vite.config.ts` | WebSocket proxy |

---

## Verification Plan

### Analytics
1. Complete a task and verify CodeChangeMetrics record created
2. Check EngineeringTimeSaved calculation accuracy
3. Navigate to /analytics and verify all sections render:
   - Executive summary cards with sparklines
   - Time-series charts with date range selection
   - Pipeline health funnel
   - Task distribution charts (type, priority, repo)
   - Contributors leaderboard with rankings
   - ROI calculator with configurable hourly rate
   - Activity timeline with real-time updates
4. Test drill-down from user → project → task → file
5. Verify filters work (date range, project, user)
6. Test export in CSV, JSON formats
7. Verify ROI calculation: (hours_saved × hourly_rate) / platform_cost
8. Check contributors leaderboard sorting and pagination

### WebSocket
1. Open TaskDetail in browser
2. Start task execution from another tab/CLI
3. Verify logs stream in real-time without refresh
4. Disconnect network, verify reconnection indicator
5. Reconnect and verify subscription restoration

### Presence
1. Open same task in two browser tabs (different users if possible)
2. Verify "viewing" badges appear
3. Close one tab, verify badge disappears

### AI Enhancements
1. Run scan, verify confidence scores on findings
2. Create task with dry-run mode, verify preview output
3. Force task failure, verify retry with different approach
4. Check generated code follows detected conventions

---

## Estimated Timeline

| Week | Focus |
|------|-------|
| 1 | Analytics schema + worker + backend routes |
| 2 | Analytics frontend + WebSocket infrastructure |
| 3 | Real-time updates + Team presence |
| 4 | AI Analysis enhancements + Dry-run mode |
| 5 | Error recovery + Context awareness |
| 6 | Agent swarm + Isolated environments + Polish |
