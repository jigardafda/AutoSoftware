# AutoSoftware Roadmap

> Building the most intelligent, collaborative code improvement platform

Our mission is to make AutoSoftware the smartest AI-powered code analysis and improvement tool — with a world-class multiplayer experience. This roadmap outlines our vision for Q2 2026.

---

## Timeline

```
          MARCH           APRIL            MAY             JUNE
    ─────────────────────────────────────────────────────────────

    FOUNDATION        INTELLIGENCE      DIALOGUE        FORESIGHT      MASTERY
    "See clearly"     "Act precisely"   "Understand"    "Predict"      "Learn"
    ██████████        ██████████        ██████████      ██████████     ████████████
    Week 1-2          Week 3-4          Week 5-6        Week 7-9       Week 10-12

    ┌─────────────────────────────────────────────────────────────┐
    │  TWO PARALLEL TRACKS PER PHASE:                            │
    │  🧠 AI Intelligence — Smarter analysis & execution         │
    │  🎨 Platform Experience — Multiplayer, visual, mobile      │
    └─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation — "See Clearly"

*March 2026 · Weeks 1-2*

Making the AI significantly smarter while laying the foundation for real-time collaboration.

### 🧠 AI: Analysis Depth
- [x] Architectural pattern recognition (MVC, microservices, etc.)
- [x] Cross-file dependency analysis
- [x] Dead code detection
- [x] Code duplication finder

### 🧠 AI: Accuracy
- [x] Confidence scoring for each finding (1-10)
- [x] False positive reduction via context awareness
- [x] Severity calibration (critical vs. nitpick)
- [x] Language-specific rule tuning

### 🧠 AI: Security
- [ ] OWASP Top 10 vulnerability scanning
- [ ] Secret/credential detection
- [ ] Dependency vulnerability alerts
- [ ] SQL injection / XSS pattern matching

### 🧠 AI: Performance
- [x] N+1 query detection
- [x] Memory leak patterns
- [x] Inefficient algorithm flags
- [x] Bundle size / import analysis

### 🎨 Platform: Real-Time Infrastructure
- [x] WebSocket connection layer
- [x] Live task status updates (no refresh needed)
- [x] Real-time scan progress streaming
- [x] Connection state indicators

### 🎨 Platform: Team Presence
- [x] User presence indicators ("Sarah is online")
- [x] "Currently viewing" badges on tasks/repos
- [x] Activity pulse (who's active right now)
- [x] Team member avatars across UI

### 🎨 Platform: Analytics Dashboard
- [x] New "Analytics" tab in main navigation
- [x] Lines of code metrics (added, modified, deleted) per task/project/user
- [x] Engineering hours saved calculation and display
- [x] Multi-level drill-down (User → Project → Task → Individual changes)
- [x] Roll-up aggregation (Task → Project → User → Organization)
- [x] Time-series charts for productivity trends
- [x] Export analytics data (CSV, JSON)
- [x] Comparison views (week-over-week, user-vs-user, project-vs-project)

---

## Phase 2: Intelligence — "Act Precisely"

*April 2026 · Weeks 3-4*

Executing complex changes with agent swarm capabilities and parallel processing.

### 🧠 AI: Multi-File Operations
- [x] Coordinated changes across 10+ files
- [x] Rename/refactor propagation
- [x] Import/export graph awareness
- [ ] ~~Database migration generation~~ (Skipped)

### 🧠 AI: Execution Quality
- [x] "Dry run" mode showing proposed changes before execution
- [x] Rollback-safe change batching
- [x] Test generation for changes
- [x] Lint/format compliance check before commit

### 🧠 AI: Error Recovery
- [x] Automatic retry with different approach (up to 3 attempts)
- [x] Enhanced error recovery prompts with retry guidance
- [x] Rollback support via change batcher
- [x] Detailed failure diagnostics

### 🧠 AI: Context Awareness
- [x] Respect existing code style
- [x] Follow project conventions (CLAUDE.md, .editorconfig)
- [x] Use existing utilities instead of reinventing
- [x] Match naming patterns

### 🎨 Platform: Agent Swarm
- [x] Parallel task execution (run 5+ tasks simultaneously)
- [x] Agent coordination via internal messaging
- [x] Cross-repo synchronized refactoring
- [x] "Fix this in all microservices" batch operations

### 🎨 Platform: Isolated Environments
- [x] Auto-managed unique ports per task execution
- [ ] ~~Template-based environment configs~~ (Skipped)
- [ ] ~~One-click environment start/stop~~ (Skipped)
- [ ] ~~Health monitoring for running services~~ (Skipped)

### 🎨 Platform: Live Execution View
- [x] Real-time agent activity feed
- [x] Live file change preview as agent works
- [x] Terminal output streaming
- [x] "Agent is thinking..." indicators

---

## Phase 3: Dialogue — "Understand Deeply"

*May 2026 · Weeks 5-6*

Becoming a true collaborator with session forking and plan comparison.

### 🤖 AI Assistant (NEW - Top Priority)

**Conversational Development Interface** — A world-class AI chat interface that becomes the primary way to interact with AutoSoftware.

See [PRD: AI Assistant](docs/PRD_AI_ASSISTANT.md) for full specification.

#### Core Features
- [x] **Side Panel Chat**: Resizable panel (not modal) that coexists with main UI
- [x] **Context Selection**: Dropdown to scope conversations to project/repository
- [x] **Conversation History**: Full persistence with search and continue
- [x] **MCP Tools**: AI queries platform data (repos, tasks, scans, analytics)
- [x] **Tool Transparency**: Expandable view of MCP calls and responses
- [x] **Markdown Rendering**: Full GFM support with code highlighting

#### Multi-Modal Input
- [x] **File Attachments**: Drag-and-drop images, code files, PDFs
- [x] **Screenshot Paste**: Cmd+V to paste screenshots
- [x] **Voice Mode**: Push-to-talk and continuous voice input
- [x] **Optional TTS**: AI speaks responses

#### Artifacts & Task Creation
- [x] **Live Preview**: HTML, React, SVG artifacts with inline preview
- [x] **Task Creation**: One-click task creation from conversation
- [x] **Artifact Attachment**: Attach generated artifacts to tasks
- [x] **Manual Attachments**: File uploads on manual task creation

#### Message Actions
- [x] **Copy Button**: Copy any message to clipboard
- [x] **Download Button**: Download message as Markdown
- [x] **Regenerate**: Re-run AI response
- [x] **Feedback**: Thumbs up/down

### 🧠 AI: Smart Clarification
- [x] Contextual questions based on codebase
- [x] "Did you mean X or Y?" disambiguation
- [x] Learns from previous answers in project
- [x] Skips obvious questions, asks hard ones

### 🧠 AI: Approach Exploration
- [x] Proposes 2-3 implementation approaches
- [x] Explains tradeoffs (performance vs. readability)
- [x] Recommends best approach with reasoning
- [x] Allows "what if" exploration

### 🧠 AI: Intent Understanding
- [x] Natural language task descriptions
- [x] Infers scope from vague requests
- [x] Connects related issues automatically
- [x] Understands "fix it like we did in X" references

### 🧠 AI: Transparency
- [x] "Here's my plan" breakdown before execution
- [x] Step-by-step progress updates
- [x] "I'm stuck because..." honest blockers
- [x] Confidence indicators per decision

### 🎨 Platform: Session Forking
- [x] Fork any task to explore alternative approaches
- [x] Visual session tree (parent/child relationships)
- [x] Side-by-side plan comparison view
- [x] Merge best parts from different forks

### 🎨 Platform: Task Genealogy
- [x] Visual tree of scan → tasks → subtasks
- [x] "Spawned from" relationship indicators
- [x] Collapse/expand task hierarchies
- [x] Filter by lineage

### 🎨 Platform: Collaborative Planning
- [x] Real-time cursors in planning UI
- [x] Team comments on approach options
- [x] Voting on preferred approaches
- [x] "@mention" teammates for input

---

## Phase 4: Foresight — "Predict & Prevent"

*May-June 2026 · Weeks 7-9*

Proactive intelligence with a visual spatial canvas for workflow orchestration.

### 🧠 AI: Predictive Analysis
- [x] "This will break when..." warnings
- [x] Regression risk scoring on PRs
- [x] Technical debt trajectory forecasting
- [x] "Growing complexity" alerts for files/modules

### 🧠 AI: Dependency Intelligence
- [x] Upcoming breaking changes in dependencies
- [x] Security advisory monitoring
- [x] Upgrade path recommendations
- [x] "Library X is unmaintained" warnings

### 🧠 AI: Code Health Monitoring
- [x] Codebase health score dashboard
- [x] Trend graphs (improving/degrading)
- [x] Hotspot identification (high-churn risky files)
- [x] Coverage/quality metric tracking

### 🧠 AI: Proactive Suggestions
- [x] "Consider refactoring X before adding Y"
- [x] Optimization opportunities
- [x] "Other projects solved this with..."
- [x] Scheduled improvement recommendations

### 🎨 Platform: Spatial Canvas
- [x] Figma-style board for organizing repos, tasks, scans
- [x] Drag-and-drop spatial arrangement
- [x] Zoom/pan infinite canvas
- [x] Board templates (per project, per sprint, etc.)

### 🎨 Platform: Zone Triggers
- [x] Define zones that trigger actions when items dropped
- [x] Kanban-style pipelines (Analyze → Develop → Review → Deploy)
- [x] Custom workflow automation
- [x] Visual pipeline progress indicators

### 🎨 Platform: GitHub Deep Integration
- [x] Auto-inject issue/PR context into tasks
- [x] Linked worktrees show GitHub status
- [x] PR review comments sync back to tasks
- [x] Issue labels → task priority mapping

---

## Phase 5: Mastery — "Learn & Evolve"

*June 2026 · Weeks 10-12*

Learning system with mobile-first experience and push notifications.

### 🧠 AI: Feedback Loops
- [x] Learn from PR review comments
- [x] "This fix was rejected because..." memory
- [x] User thumbs up/down on suggestions
- [x] A/B test different approaches, measure success

### 🧠 AI: Project Memory
- [x] Remember past decisions per project
- [x] "We tried X before and it didn't work"
- [x] Build institutional knowledge base
- [x] Cross-project pattern learning

### 🧠 AI: Personalization
- [x] Adapt to team's code style preferences
- [x] Learn individual reviewer preferences
- [x] Priority tuning based on what gets merged
- [x] Custom rule creation from examples

### 🧠 AI: Self-Improvement
- [x] Accuracy metrics dashboard
- [x] False positive rate tracking
- [x] Execution success rate monitoring
- [x] Automatic prompt refinement

### 🎨 Platform: Mobile Experience
- [x] Fully responsive mobile UI
- [x] Mobile-optimized task cards
- [x] Swipe gestures for quick actions
- [x] Touch-friendly planning interface

### 🎨 Platform: Push Notifications
- [x] Scan completion alerts
- [x] Task status change notifications
- [x] "Agent needs input" alerts
- [x] Daily/weekly digest emails

### 🎨 Platform: Mobile Actions
- [x] Approve/reject plans from phone
- [x] Quick task creation via mobile
- [x] Voice input for task descriptions
- [x] Photo-to-task (screenshot a bug)

### 🎨 Platform: Team Coordination
- [x] RTS-style team activity view
- [x] "Who's working on what" dashboard
- [x] Workload balancing visualization
- [x] Delegation with drag-and-drop

---

## Feature Summary

### 🧠 AI Intelligence Track
| Phase | Focus |
|-------|-------|
| Foundation | Smarter analysis, security scanning, accuracy |
| Intelligence | Multi-file execution, dry-run, test generation |
| Dialogue | Conversational planning, approach exploration |
| Foresight | Proactive detection, health monitoring |
| Mastery | Learning from feedback, personalization |

### 🎨 Platform Experience Track
| Phase | Focus |
|-------|-------|
| Foundation | Real-time infrastructure, team presence, **analytics dashboard** |
| Intelligence | Agent swarm, parallel execution, live view |
| Dialogue | **🤖 AI Assistant (Top Priority)**, session forking, collaborative planning |
| Foresight | Spatial canvas, zone triggers, workflows |
| Mastery | Mobile UI, notifications, team coordination |

---

## Contributing

We welcome contributions at every phase! Here's how you can help:

| Phase | AI Track | Platform Track |
|-------|----------|----------------|
| Foundation | Analysis patterns, language rules | WebSocket infrastructure, **Analytics dashboard** |
| Intelligence | Test generation, style parsers | Agent coordination logic |
| Dialogue | Prompt improvements, **MCP Tools** | **AI Assistant UI**, Session tree UI |
| Foresight | Health metrics | Canvas/drag-drop components |
| Mastery | Feedback algorithms | Mobile UI, notifications |

See our [Contributing Guide](CONTRIBUTING.md) for details.

---

## Status Legend

- `[ ]` Planned
- `[~]` In Progress
- `[x]` Shipped

---

## Inspiration

This roadmap draws inspiration from:
- **[Agor](https://github.com/preset-io/agor)** — Multiplayer spatial canvas for AI coding
- **Figma** — Real-time collaboration patterns
- **Linear** — Modern project management UX

---

## Stay Updated

- Watch this repo for release notifications
- Join [Discussions](../../discussions) for roadmap feedback
- Check [CHANGELOG.md](CHANGELOG.md) for shipped features

---

*Last updated: March 12, 2026 — Phase 3, 4 & 5 Complete*

---

## Recent Implementation (March 2026)

### Completed in Phase 1 & 2 Sprint

**Analytics Dashboard** (Full Implementation)
- Comprehensive analytics page with 11 React components
- Executive summary cards with sparklines and trends
- Time-series charts (Recharts) for LOC and hours saved
- Cost/token usage visualization by model
- Task pipeline health funnel
- Contributors leaderboard with rankings
- ROI calculator with configurable hourly rate
- Activity timeline with real-time updates
- Drill-down explorer (User → Project → Task → File)
- Export functionality (CSV/JSON)

**WebSocket Infrastructure** (Full Implementation)
- Fastify WebSocket plugin with connection manager
- PostgreSQL LISTEN/NOTIFY for cross-process events
- Frontend WebSocketProvider with auto-reconnection
- useSubscription, usePresence hooks for React
- Real-time task/scan updates without polling
- Connection state indicators (Live/Reconnecting/Disconnected)
- Viewer badges showing who's viewing a resource

**AI Enhancements** (Scan & Execute)
- Enhanced scan handler with structured analysis
- Architecture pattern detection
- Dependency graph building
- Dead code and duplication detection
- Performance anti-patterns (N+1, memory leaks)
- Confidence scores (1-10) and severity levels
- Convention detector for code style matching
- Dry-run mode for preview before execution
- Error recovery with retry logic (max 3 attempts)

**Agent Swarm & Isolation**
- Increased pg-boss concurrency to 5
- Port manager for isolated environments (3100-4000)

**Activity Pulse** (Full Implementation)
- User presence API with heartbeat tracking
- WebSocket broadcast for activity updates
- ActivityPulse component showing active users
- ActiveUsersPanel with detailed activity info
- Activity types: viewing_task, editing_plan, browsing, idle

**AI Accuracy Enhancements** (Full Implementation)
- False positive detector with context awareness
- Language-specific rule tuning (TypeScript, Python, Go, Rust, Java)
- Language profile detection and framework hints
- Severity adjustments based on language context
- Test file detection to reduce false positives

**Test Generation & Error Recovery** (Full Implementation)
- Test framework detection (Jest, Vitest, Mocha, pytest, Go)
- AI-powered test generation for changed code
- Improved error recovery via enhanced agent prompts (retry guidance built into system prompt)
- Change batcher with rollback points
- Automatic retry with up to 3 attempts on failure

**Agent Coordination** (Full Implementation)
- Agent messaging service via PostgreSQL NOTIFY/LISTEN
- File-level locking to prevent conflicts
- Cross-repo sync service for monorepo workspaces
- Batch operations API with parallel/sequential modes
- CreateBatchDialog for multi-repo task creation
- Priority queue with dependency tracking

**Live Execution View** (Full Implementation)
- Terminal output streaming via WebSocket
- xterm.js-based terminal with search/copy/download
- LiveFilePreview with Monaco diff editor
- Combined LiveExecutionView component
- Output buffering for late joiners
- Real-time file change events with syntax highlighting

---

### Completed in Phase 3, 4 & 5 Sprint

**Phase 3: AI Dialogue Features**
- Smart Clarification service with contextual questions
- Approach Exploration with multiple implementation options
- Intent Understanding via natural language processing
- AI Transparency with plan breakdown and blockers
- Session Forking with visual session tree
- Task Genealogy with visual hierarchy tree
- Collaborative Planning with real-time comments
- Optional TTS (Text-to-Speech) for AI responses

**Phase 4: Foresight Features**
- Predictive Analysis with "this will break" warnings
- Dependency Intelligence with security advisories
- Code Health Monitoring dashboard with trends
- Proactive Suggestions with optimization hints
- Spatial Canvas (Figma-style task board)
- Zone Triggers (workflow automation)
- GitHub Deep Integration (PR/Issue sync)

**Phase 5: Mastery Features**
- Feedback Loops (learn from PR reviews)
- Project Memory (remember past decisions)
- Personalization (AI verbosity, code style prefs)
- AI Self-Improvement (accuracy metrics, false positive tracking, prompt refinement)
- Mobile Experience (responsive UI, bottom nav)
- Push Notifications (in-app and web push)
- Mobile Actions (voice input, swipe gestures, FAB)
- Team Coordination (RTS-style activity view)

**New Navigation Items Added**
- `/analytics` - Enhanced analytics with Code Health and Predictive tabs
- `/triggers` - Workflow automation with IF/THEN builder
- `/team` - Team activity map and workload dashboard
- `/canvas` - Spatial task organization board
- `/notifications` - Notification center with preferences
- `/settings?tab=personalization` - Personalization settings

**Mobile-Specific Components**
- MobileNav with bottom navigation bar
- FloatingActionButton with quick action menu
- QuickActionSheet for mobile actions
- SwipeableTask for swipe-to-complete/delete
- VoiceInput component with Web Speech API
- ResponsiveLayout with drawer sidebar on mobile
