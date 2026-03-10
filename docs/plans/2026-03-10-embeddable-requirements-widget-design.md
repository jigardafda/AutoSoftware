# Embeddable Requirements Widget — Design Document

## Overview

A lightweight, server-rendered HTML embed that allows external users to submit requirements directly into a project via an iframe. No login required — sessions managed via cookies. Submissions go through a two-phase screening pipeline: cheap LLM screening first, then full task planning only for approved submissions.

## Architecture

**Approach:** Server-rendered HTML (Approach A). The embed is a single self-contained HTML page served by `GET /embed/:projectId`. All CSS and JS are inlined. No React, no external dependencies. Loads in under 50KB.

**Why not React/Vite micro-app:** The embed UI is fundamentally simple (input → screening → questions → done). Vanilla JS handles the multi-step flow with show/hide sections. Same-origin serving eliminates CORS complexity and makes cookie auth trivial.

## Data Model

### EmbedConfig (new, 1-to-1 with Project)

Per-project embed appearance and behavior settings.

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| id | String | uuid | PK |
| projectId | String | — | FK to Project (unique) |
| enabled | Boolean | true | Toggle embed on/off |
| title | String | "Submit a Requirement" | Embed header |
| welcomeMessage | String? | null | Intro text below title |
| logoUrl | String? | null | Brand logo |
| primaryColor | String | "#6366f1" | Buttons, accents |
| backgroundColor | String | "#ffffff" | Page background |
| textColor | String | "#1f2937" | Body text |
| borderRadius | Int | 8 | Border radius in px |
| fontFamily | String | "Inter" | From curated list |
| scoreThreshold | Float | 7.0 | Auto-approve score (1-10) |
| maxFileSize | Int | 5 | MB per file |
| maxTotalSize | Int | 25 | MB per submission |
| allowedFileTypes | String[] | [pdf,doc,docx,txt,png,jpg,jpeg,svg,ts,js,py,zip] | Accepted extensions |
| language | String | "en" | en,es,fr,de,pt,zh |

### EmbedSubmission (new)

Each external submission.

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| id | String | uuid | PK |
| projectId | String | — | FK to Project |
| sessionToken | String | — | Cookie value, groups interactions |
| title | String | — | User-provided title |
| description | String | — | User-provided description |
| inputMethod | String | — | "text" / "voice" / "file" |
| screeningStatus | String | "pending" | pending/screening/needs_input/scored/approved/rejected |
| screeningScore | Float? | null | 1-10 from Haiku screening |
| screeningReason | String? | null | Why it scored high/low |
| clarificationRound | Int | 0 | Current round (max 2) |
| taskId | String? | null | FK to Task (set when converted) |
| attachments | Json | [] | Array of {filename, mimeType, size, data(base64)} |
| metadata | Json | {} | Extensible |

### EmbedQuestion (new, mirrors PlanningQuestion)

Clarification questions for submissions.

| Field | Type | Purpose |
|-------|------|---------|
| id | String | PK |
| submissionId | String | FK to EmbedSubmission |
| round | Int | 1-2 |
| questionKey | String | Unique key |
| label | String | Human-readable text |
| type | String | "select" / "multi_select" / "confirm" / "text" |
| options | Json | [{value, label}, ...] |
| answer | Json? | null until answered |
| required | Boolean | — |
| sortOrder | Int | Ordering |

Note: "text" type added for free-form answers from external users.

### Modified: Project

Add optional relation: `embedConfig EmbedConfig?`

## API Routes

### Public Routes (no auth, cookie-gated)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/embed/:projectId` | Serve HTML embed page |
| POST | `/embed/:projectId/submit` | Submit requirement (multipart/form-data) |
| GET | `/embed/:projectId/submission/:id` | Get submission status + questions |
| POST | `/embed/:projectId/submission/:id/answers` | Submit clarification answers |
| GET | `/embed/:projectId/config` | Get config (for preview) |

### Authenticated Routes (project owner)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/:id/embed-config` | Get embed config |
| PUT | `/api/projects/:id/embed-config` | Update embed config |
| GET | `/api/projects/:id/submissions` | List submissions (filterable) |
| POST | `/api/projects/:id/submissions/:subId/approve` | Manual approve → Task |
| POST | `/api/projects/:id/submissions/:subId/reject` | Reject submission |

## Session Management

- `GET /embed/:projectId` sets `Set-Cookie: embed_session=<uuid>; HttpOnly; SameSite=None; Secure; Path=/embed/; Max-Age=604800`
- 7-day expiry, scoped to `/embed/` path
- `SameSite=None; Secure` required for iframe on third-party sites
- Cookie scopes submissions — users can only view/answer their own

## Submission Flow

```
1. User fills form → POST /embed/:projectId/submit
   Body: multipart/form-data { title, description, inputMethod, files[] }

2. Backend validates:
   - Project exists & embed enabled
   - File sizes within limits, types allowed
   - Basic spam: min title 5 chars, min description 20 chars, entropy check
   - Rate limit: max 3 submissions/hour per session

3. Creates EmbedSubmission (status: "pending")
   Queues EMBED_SCREEN job
   Returns { submissionId, status: "pending" }

4. Embed page polls GET /submission/:id every 3s

5. Worker EMBED_SCREEN job (Claude Haiku, ~$0.01):
   - score >= threshold → status: "approved", queue EMBED_CONVERT
   - 3 < score < threshold → status: "needs_input", generate questions
   - score <= 3 → status: "rejected" (spam/garbage)

6. If needs_input → embed shows questions (max 2 rounds)
   User answers → POST answers → re-screen with context

7. After clarification:
   - score >= threshold → approved, convert to Task (source: "embed")
   - score < threshold → status: "scored", lands in review queue
```

## Worker Jobs

| Job | Runtime | Purpose |
|-----|---------|---------|
| embed-screen | Claude Haiku (~$0.01) | Screen submission quality, generate questions, produce score |
| embed-convert | No LLM call | Convert approved submission to Task, then queue task-plan |

## Server-Rendered HTML Embed

### Template Structure

Single HTML page with inlined CSS/JS. EmbedConfig values injected as CSS custom properties:

```css
:root {
  --primary: ${primaryColor};
  --bg: ${backgroundColor};
  --text: ${textColor};
  --radius: ${borderRadius}px;
  --font: '${fontFamily}', sans-serif;
}
```

### Multi-Step UI

Step 1 (Submit): Title input, description textarea with mic + file buttons, file list, submit button
Step 2 (Screening): Spinner with "Analyzing your request..." (polling)
Step 3 (Questions): Rendered question form if needs_input (select, multi-select, text, confirm)
Step 4 (Result): Success message with reference ID, or rejection notice

### Voice Input

- Browser Web Speech API via mic button on description textarea
- Shows recording indicator while active
- Transcribed text appends to textarea
- Button hidden if browser doesn't support SpeechRecognition

### File Upload

- Drag & drop zone + file picker button
- Client-side validation: type, individual size, total size
- Files sent as multipart/form-data, stored as base64 JSON in Postgres
- File list with names, sizes, remove buttons
- Limits: 5MB per file, 25MB total per submission

### Client-Side Validation

- Min title: 5 chars
- Min description: 20 chars
- Basic entropy check (rejects "aaaaaaa", "12345")
- Rate limiting via cookie (max 3/hour)

### i18n

Inline translations object with 6 languages: en, es, fr, de, pt, zh. Covers all UI strings (labels, buttons, status messages, error messages).

## Project Settings UI — Embed Tab

### Location

New tab in project settings: [General] [Repositories] [Integrations] **[Embed]**

### Sections

**Toggle:** Enable/disable embed

**Appearance:** Title, welcome message, logo URL, primary/background/text colors (color pickers), border radius, font (dropdown from curated list: Inter, System UI, Roboto, Open Sans, Lato, Nunito, Poppins, Montserrat, Source Sans 3, DM Sans)

**Behavior:** Score threshold slider, max file size, max total size, allowed file types (chip selector), language dropdown

**Live Preview:** Actual iframe pointed at `/embed/:projectId?preview=true` (debounced refresh on changes). Preview flag skips session cookie.

**Embed Code:** Copyable iframe snippet:
```html
<iframe src="https://your-domain.com/embed/PROJECT_ID" width="100%" height="600" frameborder="0" allow="microphone"></iframe>
```

**Submissions Queue:** Table of all submissions with columns: Title, Score, Status, Date, Actions (approve/reject). Filterable by status: All, Pending Review, Approved, Rejected.

## Embed Snippet

Project owners copy an iframe tag from settings. `allow="microphone"` enables Web Speech API inside the iframe.

## Key Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Architecture | Server-rendered HTML | Fastest load, no CORS, simple cookie auth |
| Screening | Two-phase (Haiku first) | Prevents $1/submission cost on spam |
| Voice | Web Speech API | Free, no server cost, browser-native |
| File storage | Postgres base64 JSON | No extra infra, acceptable at 5MB/25MB limits |
| Scoring | Per-project threshold | Different projects have different quality bars |
| Appearance | Colors + font + radius, no CSS injection | Covers 90% of needs without security risk |
| i18n | 6 languages inline | Lightweight, no i18n library needed |
| Session | Cookie, 7-day, HttpOnly | Secure, works in iframes with SameSite=None |
| Clarification | Max 2 rounds | Lighter than internal 3, appropriate for external users |
| Question types | select, multi_select, confirm, text | "text" added for free-form external user answers |
