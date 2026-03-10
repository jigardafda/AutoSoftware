# Embeddable Requirements Widget — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a lightweight, server-rendered HTML embed that allows external users to submit requirements into a project via an iframe, with two-phase AI screening and clarification flow.

**Architecture:** Server-rendered HTML page served by the backend at `GET /embed/:projectId`. All CSS/JS inlined. Cookie-based sessions for anonymous users. Two-phase screening: cheap Haiku call screens submissions, then full task planning only for approved ones. Project owners configure appearance and behavior via a settings tab with live preview.

**Tech Stack:** Fastify (backend routes), Prisma (data models), pg-boss (job queue), Claude Haiku (screening), vanilla HTML/CSS/JS (embed page), React (admin settings UI)

---

### Task 1: Prisma Schema — New Models

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/constants.ts`

**Step 1: Add enums and models to Prisma schema**

Add after the existing `IntegrationStatus` enum in `prisma/schema.prisma`:

```prisma
enum EmbedScreeningStatus {
  pending
  screening
  needs_input
  scored
  approved
  rejected
}
```

Add after the `TaskExternalLink` model:

```prisma
model EmbedConfig {
  id               String   @id @default(cuid())
  projectId        String   @unique
  enabled          Boolean  @default(true)

  // Appearance
  title            String   @default("Submit a Requirement")
  welcomeMessage   String?
  logoUrl          String?
  primaryColor     String   @default("#6366f1")
  backgroundColor  String   @default("#ffffff")
  textColor        String   @default("#1f2937")
  borderRadius     Int      @default(8)
  fontFamily       String   @default("Inter")

  // Behavior
  scoreThreshold   Float    @default(7.0)
  maxFileSize      Int      @default(5)
  maxTotalSize     Int      @default(25)
  allowedFileTypes String[] @default(["pdf", "doc", "docx", "txt", "png", "jpg", "jpeg", "svg", "ts", "js", "py", "zip"])

  // i18n
  language         String   @default("en")

  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

model EmbedSubmission {
  id                 String                @id @default(cuid())
  projectId          String
  sessionToken       String
  title              String
  description        String
  inputMethod        String                @default("text")
  screeningStatus    EmbedScreeningStatus  @default(pending)
  screeningScore     Float?
  screeningReason    String?
  clarificationRound Int                   @default(0)
  taskId             String?               @unique
  attachments        Json                  @default("[]")
  metadata           Json                  @default("{}")

  project            Project               @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task               Task?                 @relation(fields: [taskId], references: [id])
  questions          EmbedQuestion[]
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt

  @@index([projectId, sessionToken])
  @@index([projectId, screeningStatus])
}

model EmbedQuestion {
  id           String          @id @default(cuid())
  submissionId String
  round        Int
  questionKey  String
  label        String
  type         String
  options      Json            @default("[]")
  answer       Json?
  required     Boolean         @default(true)
  sortOrder    Int             @default(0)

  submission   EmbedSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)

  @@index([submissionId, round])
}
```

Add relations to the existing `Project` model:

```prisma
// Add these two lines to the Project model's relation fields:
embedConfig     EmbedConfig?
embedSubmissions EmbedSubmission[]
```

Add relation to the existing `Task` model:

```prisma
// Add this line to the Task model's relation fields:
embedSubmission EmbedSubmission?
```

**Step 2: Add shared types**

In `packages/shared/src/types.ts`, add:

```typescript
export type EmbedScreeningStatus = "pending" | "screening" | "needs_input" | "scored" | "approved" | "rejected";

export interface EmbedConfigDTO {
  id: string;
  projectId: string;
  enabled: boolean;
  title: string;
  welcomeMessage: string | null;
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  fontFamily: string;
  scoreThreshold: number;
  maxFileSize: number;
  maxTotalSize: number;
  allowedFileTypes: string[];
  language: string;
}

export interface EmbedSubmissionDTO {
  id: string;
  projectId: string;
  title: string;
  description: string;
  inputMethod: string;
  screeningStatus: EmbedScreeningStatus;
  screeningScore: number | null;
  screeningReason: string | null;
  clarificationRound: number;
  taskId: string | null;
  attachments: { filename: string; mimeType: string; size: number }[];
  questions?: EmbedQuestionDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface EmbedQuestionDTO {
  id: string;
  questionKey: string;
  round: number;
  label: string;
  type: "select" | "multi_select" | "confirm" | "text";
  options: { value: string; label: string }[];
  answer: string | string[] | boolean | null;
  required: boolean;
  sortOrder: number;
}

export interface UpdateEmbedConfigInput {
  enabled?: boolean;
  title?: string;
  welcomeMessage?: string | null;
  logoUrl?: string | null;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  scoreThreshold?: number;
  maxFileSize?: number;
  maxTotalSize?: number;
  allowedFileTypes?: string[];
  language?: string;
}
```

**Step 3: Add job name constants**

In `packages/shared/src/constants.ts`, add to `JOB_NAMES`:

```typescript
export const JOB_NAMES = {
  REPO_SCAN: "repo-scan",
  TASK_PLAN: "task-plan",
  TASK_EXECUTE: "task-execute",
  EMBED_SCREEN: "embed-screen",
  EMBED_CONVERT: "embed-convert",
} as const;
```

Add screening budget:

```typescript
export const DEFAULT_EMBED_SCREEN_BUDGET_USD = 0.05;
```

**Step 4: Build shared package**

Run: `npm run build -w packages/shared`

**Step 5: Generate migration and Prisma client**

Run: `npx prisma migrate dev --name add_embed_models`

**Step 6: Commit**

```
feat: add embed data models (EmbedConfig, EmbedSubmission, EmbedQuestion)
```

---

### Task 2: Backend — Embed Config Routes (Authenticated)

**Files:**
- Modify: `backend/src/routes/projects.ts`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add embed config endpoints to projects.ts**

Add these routes inside the existing `projectRoutes` function in `backend/src/routes/projects.ts`, after the delete document route:

```typescript
  // Get embed config
  app.get<{ Params: { id: string } }>("/:id/embed-config", async (request, reply) => {
    const project = await prisma.project.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

    let config = await prisma.embedConfig.findUnique({
      where: { projectId: project.id },
    });

    if (!config) {
      config = await prisma.embedConfig.create({
        data: { projectId: project.id },
      });
    }

    return { data: config };
  });

  // Update embed config
  app.put<{ Params: { id: string }; Body: UpdateEmbedConfigInput }>(
    "/:id/embed-config",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const config = await prisma.embedConfig.upsert({
        where: { projectId: project.id },
        create: { projectId: project.id, ...request.body },
        update: request.body,
      });

      return { data: config };
    }
  );

  // List embed submissions
  app.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    "/:id/submissions",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const where: any = { projectId: project.id };
      if (request.query.status) {
        where.screeningStatus = request.query.status;
      }

      const submissions = await prisma.embedSubmission.findMany({
        where,
        include: { questions: { orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "desc" },
      });

      return { data: submissions };
    }
  );

  // Approve submission → convert to task
  app.post<{ Params: { id: string; subId: string }; Body: { repositoryId: string } }>(
    "/:id/submissions/:subId/approve",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
        include: { repositories: { select: { repositoryId: true } } },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const submission = await prisma.embedSubmission.findFirst({
        where: { id: request.params.subId, projectId: project.id },
      });
      if (!submission) return reply.code(404).send({ error: { message: "Submission not found" } });
      if (submission.taskId) return reply.code(400).send({ error: { message: "Already converted" } });

      const { repositoryId } = request.body;
      const repoInProject = project.repositories.some((r) => r.repositoryId === repositoryId);
      if (!repoInProject) return reply.code(400).send({ error: { message: "Repository not in project" } });

      const task = await prisma.task.create({
        data: {
          repositoryId,
          userId: request.userId,
          projectId: project.id,
          title: submission.title,
          description: submission.description,
          type: "feature",
          priority: "medium",
          status: "planning",
          source: "embed",
          metadata: { embedSubmissionId: submission.id },
        },
      });

      await prisma.embedSubmission.update({
        where: { id: submission.id },
        data: { screeningStatus: "approved", taskId: task.id },
      });

      await schedulerService.queueTaskPlanning(task.id);

      return { data: { task, submission: { ...submission, screeningStatus: "approved", taskId: task.id } } };
    }
  );

  // Reject submission
  app.post<{ Params: { id: string; subId: string } }>(
    "/:id/submissions/:subId/reject",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const submission = await prisma.embedSubmission.update({
        where: { id: request.params.subId, projectId: project.id },
        data: { screeningStatus: "rejected" },
      });

      return { data: submission };
    }
  );
```

Add the import at the top of `projects.ts`:

```typescript
import type { UpdateEmbedConfigInput } from "@autosoftware/shared";
import { schedulerService } from "../services/scheduler.js";
```

**Step 2: Add `embed` to TaskSource enum in Prisma schema**

In `prisma/schema.prisma`, update the `TaskSource` enum:

```prisma
enum TaskSource {
  auto_scan
  manual
  external_import
  embed
}
```

And in `packages/shared/src/types.ts`:

```typescript
export type TaskSource = "auto_scan" | "manual" | "external_import" | "embed";
```

**Step 3: Add API methods to frontend client**

In `frontend/src/lib/api.ts`, add to the `projects` namespace:

```typescript
    getEmbedConfig: (id: string) => request<any>(`/projects/${id}/embed-config`),
    updateEmbedConfig: (id: string, body: any) => request<any>(`/projects/${id}/embed-config`, { method: "PUT", body: JSON.stringify(body) }),
    listSubmissions: (id: string, status?: string) => {
      const params = status ? `?status=${status}` : "";
      return request<any>(`/projects/${id}/submissions${params}`);
    },
    approveSubmission: (id: string, subId: string, repositoryId: string) =>
      request<any>(`/projects/${id}/submissions/${subId}/approve`, { method: "POST", body: JSON.stringify({ repositoryId }) }),
    rejectSubmission: (id: string, subId: string) =>
      request<any>(`/projects/${id}/submissions/${subId}/reject`, { method: "POST" }),
```

**Step 4: Run migration for TaskSource enum update**

Run: `npx prisma migrate dev --name add_embed_task_source`

**Step 5: Commit**

```
feat: add embed config and submission management API routes
```

---

### Task 3: Backend — Public Embed Routes

**Files:**
- Create: `backend/src/routes/embed.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/src/services/scheduler.ts`

**Step 1: Create embed route file**

Create `backend/src/routes/embed.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import { prisma } from "../db.js";
import { schedulerService } from "../services/scheduler.js";

const MAX_SUBMISSIONS_PER_HOUR = 3;

export const embedRoutes: FastifyPluginAsync = async (app) => {
  // No requireAuth — these are public routes

  // Helper: get or create session token from cookie
  function getSessionToken(request: any, reply: any): string {
    const existing = request.cookies.embed_session;
    if (existing) {
      const unsigned = request.unsignCookie(existing);
      if (unsigned.valid && unsigned.value) return unsigned.value;
    }
    const token = crypto.randomUUID();
    reply.setCookie("embed_session", token, {
      path: "/embed/",
      httpOnly: true,
      signed: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: "none",
      secure: true,
    });
    return token;
  }

  // Serve the HTML embed page
  app.get<{ Params: { projectId: string }; Querystring: { preview?: string } }>(
    "/:projectId",
    async (request, reply) => {
      const project = await prisma.project.findUnique({
        where: { id: request.params.projectId },
      });
      if (!project) return reply.code(404).send("Project not found");

      let config = await prisma.embedConfig.findUnique({
        where: { projectId: project.id },
      });
      if (!config) {
        config = await prisma.embedConfig.create({ data: { projectId: project.id } });
      }
      if (!config.enabled && request.query.preview !== "true") {
        return reply.code(403).send("Embed is disabled for this project");
      }

      // Set session cookie (skip for preview)
      if (request.query.preview !== "true") {
        getSessionToken(request, reply);
      }

      const html = renderEmbedPage(config, project.name);
      return reply.type("text/html").send(html);
    }
  );

  // Submit a new requirement
  app.post<{ Params: { projectId: string }; Body: { title: string; description: string; inputMethod?: string; attachments?: any[] } }>(
    "/:projectId/submit",
    async (request, reply) => {
      const project = await prisma.project.findUnique({ where: { id: request.params.projectId } });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const config = await prisma.embedConfig.findUnique({ where: { projectId: project.id } });
      if (!config?.enabled) return reply.code(403).send({ error: { message: "Embed disabled" } });

      const sessionToken = getSessionToken(request, reply);
      const { title, description, inputMethod, attachments } = request.body;

      // Validate content
      if (!title || title.trim().length < 5) {
        return reply.code(400).send({ error: { message: "Title must be at least 5 characters" } });
      }
      if (!description || description.trim().length < 20) {
        return reply.code(400).send({ error: { message: "Description must be at least 20 characters" } });
      }

      // Validate attachments
      if (attachments && Array.isArray(attachments)) {
        let totalSize = 0;
        for (const file of attachments) {
          if (!file.filename || !file.data) continue;
          const ext = file.filename.split(".").pop()?.toLowerCase();
          if (ext && !config.allowedFileTypes.includes(ext)) {
            return reply.code(400).send({ error: { message: `File type .${ext} is not allowed` } });
          }
          const sizeBytes = Buffer.byteLength(file.data, "base64");
          if (sizeBytes > config.maxFileSize * 1024 * 1024) {
            return reply.code(400).send({ error: { message: `File ${file.filename} exceeds ${config.maxFileSize}MB limit` } });
          }
          totalSize += sizeBytes;
        }
        if (totalSize > config.maxTotalSize * 1024 * 1024) {
          return reply.code(400).send({ error: { message: `Total file size exceeds ${config.maxTotalSize}MB limit` } });
        }
      }

      // Rate limit
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = await prisma.embedSubmission.count({
        where: { projectId: project.id, sessionToken, createdAt: { gte: oneHourAgo } },
      });
      if (recentCount >= MAX_SUBMISSIONS_PER_HOUR) {
        return reply.code(429).send({ error: { message: "Too many submissions. Please try again later." } });
      }

      const submission = await prisma.embedSubmission.create({
        data: {
          projectId: project.id,
          sessionToken,
          title: title.trim(),
          description: description.trim(),
          inputMethod: inputMethod || "text",
          attachments: attachments || [],
        },
      });

      await schedulerService.queueEmbedScreening(submission.id);

      return reply.code(201).send({ data: { id: submission.id, screeningStatus: "pending" } });
    }
  );

  // Get submission status (cookie-gated)
  app.get<{ Params: { projectId: string; id: string } }>(
    "/:projectId/submission/:id",
    async (request, reply) => {
      const sessionToken = getSessionToken(request, reply);

      const submission = await prisma.embedSubmission.findFirst({
        where: {
          id: request.params.id,
          projectId: request.params.projectId,
          sessionToken,
        },
        include: {
          questions: { orderBy: [{ round: "asc" }, { sortOrder: "asc" }] },
        },
      });
      if (!submission) return reply.code(404).send({ error: { message: "Submission not found" } });

      // Strip base64 data from attachments in response
      const attachments = (submission.attachments as any[]).map(({ data, ...rest }) => rest);

      return {
        data: {
          ...submission,
          attachments,
        },
      };
    }
  );

  // Submit clarification answers
  app.post<{ Params: { projectId: string; id: string }; Body: { answers: Record<string, any> } }>(
    "/:projectId/submission/:id/answers",
    async (request, reply) => {
      const sessionToken = getSessionToken(request, reply);

      const submission = await prisma.embedSubmission.findFirst({
        where: {
          id: request.params.id,
          projectId: request.params.projectId,
          sessionToken,
          screeningStatus: "needs_input",
        },
      });
      if (!submission) return reply.code(404).send({ error: { message: "Submission not found or not awaiting input" } });

      const { answers } = request.body;
      if (!answers || typeof answers !== "object") {
        return reply.code(400).send({ error: { message: "Answers object is required" } });
      }

      // Update each question's answer
      const questions = await prisma.embedQuestion.findMany({
        where: { submissionId: submission.id, round: submission.clarificationRound },
      });

      for (const q of questions) {
        if (answers[q.questionKey] !== undefined) {
          await prisma.embedQuestion.update({
            where: { id: q.id },
            data: { answer: answers[q.questionKey] },
          });
        }
      }

      // Re-queue for screening
      await prisma.embedSubmission.update({
        where: { id: submission.id },
        data: { screeningStatus: "screening" },
      });

      await schedulerService.queueEmbedScreening(submission.id);

      return { data: { success: true } };
    }
  );

  // Get embed config (public, for preview rendering)
  app.get<{ Params: { projectId: string } }>(
    "/:projectId/config",
    async (request, reply) => {
      const config = await prisma.embedConfig.findFirst({
        where: { projectId: request.params.projectId },
      });
      if (!config) return reply.code(404).send({ error: { message: "Config not found" } });

      return { data: config };
    }
  );
};
```

Note: The `renderEmbedPage` function will be implemented in Task 5. For now, add a placeholder at the bottom of the file:

```typescript
function renderEmbedPage(config: any, projectName: string): string {
  return `<!DOCTYPE html><html><body><h1>${config.title}</h1><p>Embed for ${projectName} — full implementation in Task 5</p></body></html>`;
}
```

**Step 2: Register embed routes in index.ts**

In `backend/src/index.ts`, add after the other route registrations:

```typescript
import { embedRoutes } from "./routes/embed.js";

// Register BEFORE the /api routes (no /api prefix — this is a public page)
await app.register(embedRoutes, { prefix: "/embed" });
```

Also update CORS to allow the embed origin. Modify the existing cors config:

```typescript
await app.register(cors, {
  origin: [config.frontendUrl, /./],  // Allow all origins for embed
  credentials: true,
});
```

Actually, since the embed is served from the same origin (same backend), CORS isn't needed for the embed itself. But the admin frontend also needs it. Keep the existing CORS as-is, it already works.

**Step 3: Add scheduler methods**

In `backend/src/services/scheduler.ts`, add:

```typescript
  async queueEmbedScreening(submissionId: string) {
    await boss.send(JOB_NAMES.EMBED_SCREEN, { submissionId }, {
      retryLimit: 2,
      retryBackoff: true,
      expireInSeconds: 5 * 60,
    });
  },

  async queueEmbedConversion(submissionId: string) {
    await boss.send(JOB_NAMES.EMBED_CONVERT, { submissionId }, {
      retryLimit: 2,
      retryBackoff: true,
      expireInSeconds: 5 * 60,
    });
  },
```

Also add the queue creation in the `start()` method:

```typescript
    await boss.createQueue(JOB_NAMES.EMBED_SCREEN);
    await boss.createQueue(JOB_NAMES.EMBED_CONVERT);
```

**Step 4: Commit**

```
feat: add public embed routes and scheduler methods for submission processing
```

---

### Task 4: Worker — Embed Screening & Conversion Handlers

**Files:**
- Create: `worker/src/handlers/embed-screen.ts`
- Create: `worker/src/handlers/embed-convert.ts`
- Modify: `worker/src/index.ts`

**Step 1: Create embed-screen handler**

Create `worker/src/handlers/embed-screen.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db.js";
import { config } from "../config.js";

const MAX_CLARIFICATION_ROUNDS = 2;
const MAX_QUESTIONS_PER_ROUND = 5;

export async function handleEmbedScreening(jobs: { data: { submissionId: string } }[]) {
  const { submissionId } = jobs[0].data;

  const submission = await prisma.embedSubmission.findUnique({
    where: { id: submissionId },
    include: {
      project: true,
      questions: { orderBy: [{ round: "asc" }, { sortOrder: "asc" }] },
    },
  });

  if (!submission) {
    console.error(`Embed submission ${submissionId} not found`);
    return;
  }

  const embedConfig = await prisma.embedConfig.findUnique({
    where: { projectId: submission.projectId },
  });

  if (!embedConfig) {
    console.error(`Embed config for project ${submission.projectId} not found`);
    return;
  }

  await prisma.embedSubmission.update({
    where: { id: submissionId },
    data: { screeningStatus: "screening" },
  });

  try {
    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

    // Build context from previous rounds
    let previousContext = "";
    if (submission.questions.length > 0) {
      previousContext = "\n\nPrevious clarification rounds:\n";
      const byRound = new Map<number, typeof submission.questions>();
      for (const q of submission.questions) {
        if (!byRound.has(q.round)) byRound.set(q.round, []);
        byRound.get(q.round)!.push(q);
      }
      for (const [round, questions] of byRound) {
        previousContext += `\nRound ${round}:\n`;
        for (const q of questions) {
          previousContext += `- ${q.label}: ${q.answer ? JSON.stringify(q.answer) : "(unanswered)"}\n`;
        }
      }
    }

    // Attachment info (no base64 data)
    const attachmentInfo = (submission.attachments as any[]).map(
      (a) => `${a.filename} (${a.mimeType}, ${Math.round(a.size / 1024)}KB)`
    ).join(", ");

    const prompt = `You are evaluating a requirement submission for the software project "${submission.project.name}".

Title: ${submission.title}
Description: ${submission.description}
Input method: ${submission.inputMethod}
${attachmentInfo ? `Attachments: ${attachmentInfo}` : ""}
${previousContext}

Evaluate this submission and respond with JSON only (no markdown code blocks):

If the submission is clear enough to be a valid software requirement, respond:
{"status": "ready", "score": <1-10>, "reason": "<brief explanation>"}

If you need more information to properly evaluate (and this is round ${submission.clarificationRound + 1} of max ${MAX_CLARIFICATION_ROUNDS}), respond:
{"status": "needs_input", "score": <1-10 preliminary>, "reason": "<why more info needed>", "questions": [{"questionKey": "<snake_case_id>", "label": "<question text>", "type": "<select|multi_select|confirm|text>", "options": [{"value": "<val>", "label": "<display>"}], "required": true}]}

If the submission is spam, gibberish, or completely irrelevant, respond:
{"status": "rejected", "score": <1-3>, "reason": "<brief explanation>"}

Score guidelines:
- 8-10: Clear, actionable requirement with good detail
- 5-7: Reasonable requirement but could use more detail
- 3-4: Vague or unclear, needs significant clarification
- 1-2: Spam, gibberish, or completely irrelevant

Maximum ${MAX_QUESTIONS_PER_ROUND} questions per round. Prefer select/multi_select over text when possible.`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse screening response");
    }

    const result = JSON.parse(jsonMatch[0]);

    if (result.status === "rejected" || result.score <= 3) {
      await prisma.embedSubmission.update({
        where: { id: submissionId },
        data: {
          screeningStatus: "rejected",
          screeningScore: result.score,
          screeningReason: result.reason,
        },
      });
      return;
    }

    if (result.status === "needs_input" && submission.clarificationRound < MAX_CLARIFICATION_ROUNDS) {
      const questions = (result.questions || []).slice(0, MAX_QUESTIONS_PER_ROUND);
      const nextRound = submission.clarificationRound + 1;

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await prisma.embedQuestion.create({
          data: {
            submissionId,
            round: nextRound,
            questionKey: q.questionKey,
            label: q.label,
            type: q.type || "text",
            options: q.options || [],
            required: q.required ?? true,
            sortOrder: i,
          },
        });
      }

      await prisma.embedSubmission.update({
        where: { id: submissionId },
        data: {
          screeningStatus: "needs_input",
          screeningScore: result.score,
          screeningReason: result.reason,
          clarificationRound: nextRound,
        },
      });
      return;
    }

    // Ready or max rounds reached
    const score = result.score || 5;

    if (score >= embedConfig.scoreThreshold) {
      // Auto-approve — will be converted in embed-convert job
      await prisma.embedSubmission.update({
        where: { id: submissionId },
        data: {
          screeningStatus: "approved",
          screeningScore: score,
          screeningReason: result.reason,
        },
      });

      // Queue conversion
      const { getBoss } = await import("../boss.js");
      const boss = getBoss();
      await boss.send("embed-convert", { submissionId }, {
        retryLimit: 2,
        retryBackoff: true,
        expireInSeconds: 5 * 60,
      });
    } else {
      // Below threshold — goes to review queue
      await prisma.embedSubmission.update({
        where: { id: submissionId },
        data: {
          screeningStatus: "scored",
          screeningScore: score,
          screeningReason: result.reason,
        },
      });
    }
  } catch (error: any) {
    console.error(`Embed screening failed for ${submissionId}:`, error);
    await prisma.embedSubmission.update({
      where: { id: submissionId },
      data: {
        screeningStatus: "pending",
        metadata: { error: error.message },
      },
    });
  }
}
```

**Step 2: Create embed-convert handler**

Create `worker/src/handlers/embed-convert.ts`:

```typescript
import { prisma } from "../db.js";
import { getBoss } from "../boss.js";
import { JOB_NAMES } from "@autosoftware/shared";

export async function handleEmbedConversion(jobs: { data: { submissionId: string } }[]) {
  const { submissionId } = jobs[0].data;

  const submission = await prisma.embedSubmission.findUnique({
    where: { id: submissionId },
    include: { project: { include: { repositories: { take: 1, select: { repositoryId: true } } } } },
  });

  if (!submission || submission.screeningStatus !== "approved") {
    console.error(`Embed submission ${submissionId} not found or not approved`);
    return;
  }

  // Need at least one repository in the project to create a task
  const repoId = submission.project.repositories[0]?.repositoryId;
  if (!repoId) {
    console.error(`Project ${submission.projectId} has no repositories, cannot convert submission`);
    await prisma.embedSubmission.update({
      where: { id: submissionId },
      data: { screeningStatus: "scored", metadata: { error: "No repository in project" } },
    });
    return;
  }

  // Find the project owner
  const project = await prisma.project.findUnique({
    where: { id: submission.projectId },
    select: { userId: true },
  });

  if (!project) return;

  try {
    const task = await prisma.task.create({
      data: {
        repositoryId: repoId,
        userId: project.userId,
        projectId: submission.projectId,
        title: submission.title,
        description: submission.description,
        type: "feature",
        priority: "medium",
        status: "planning",
        source: "embed",
        metadata: { embedSubmissionId: submission.id, screeningScore: submission.screeningScore },
      },
    });

    await prisma.embedSubmission.update({
      where: { id: submissionId },
      data: { taskId: task.id },
    });

    // Queue the normal task planning pipeline
    const boss = getBoss();
    await boss.send(JOB_NAMES.TASK_PLAN, { taskId: task.id }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 15 * 60,
    });

    console.log(`Embed submission ${submissionId} converted to task ${task.id}`);
  } catch (error: any) {
    console.error(`Embed conversion failed for ${submissionId}:`, error);
  }
}
```

**Step 3: Register handlers in worker/src/index.ts**

Add imports and handler registration:

```typescript
import { handleEmbedScreening } from "./handlers/embed-screen.js";
import { handleEmbedConversion } from "./handlers/embed-convert.js";

// Add queue creation
await boss.createQueue(JOB_NAMES.EMBED_SCREEN);
await boss.createQueue(JOB_NAMES.EMBED_CONVERT);

// Add handler registration
await boss.work(JOB_NAMES.EMBED_SCREEN, { localConcurrency: 2 }, handleEmbedScreening as any);
await boss.work(JOB_NAMES.EMBED_CONVERT, { localConcurrency: 1 }, handleEmbedConversion as any);
```

**Step 4: Commit**

```
feat: add embed screening and conversion worker handlers
```

---

### Task 5: Server-Rendered HTML Embed Page

**Files:**
- Create: `backend/src/templates/embed.ts`
- Modify: `backend/src/routes/embed.ts` (replace placeholder renderEmbedPage)

**Step 1: Create the embed template**

Create `backend/src/templates/embed.ts`. This is a large file containing the full HTML template with inlined CSS and JS. The file exports a single function:

```typescript
export function renderEmbedPage(config: EmbedConfigData, projectName: string): string
```

The template includes:
- CSS custom properties from config (colors, font, radius)
- Google Fonts `<link>` for the selected font
- Multi-step form (submit → screening → questions → result)
- File upload with drag-and-drop, type/size validation
- Web Speech API voice input with fallback
- Polling logic for submission status
- Question rendering (select, multi_select, confirm, text types)
- i18n translations object (en, es, fr, de, pt, zh)
- Client-side entropy validation
- "Powered by AutoSoftware" footer

This is the largest single file in the feature. It should be ~600-800 lines of template string. The full implementation will be written by the executing agent — the key structure is:

```typescript
export interface EmbedConfigData {
  title: string;
  welcomeMessage: string | null;
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  fontFamily: string;
  maxFileSize: number;
  maxTotalSize: number;
  allowedFileTypes: string[];
  language: string;
  projectId: string;
}

export function renderEmbedPage(config: EmbedConfigData, projectName: string): string {
  const lang = config.language || "en";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(config.title)} - ${escapeHtml(projectName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(config.fontFamily)}:wght@400;500;600&display=swap" rel="stylesheet">
  <style>/* all styles using CSS vars from config */</style>
</head>
<body>
  <!-- Step 1: Submit form -->
  <!-- Step 2: Screening spinner -->
  <!-- Step 3: Clarification questions -->
  <!-- Step 4: Result -->
  <script>/* all JS: form handling, file upload, voice, polling, i18n */</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

**Step 2: Update embed.ts route to use the template**

Replace the placeholder `renderEmbedPage` in `backend/src/routes/embed.ts` with:

```typescript
import { renderEmbedPage } from "../templates/embed.js";
```

And update the GET handler to pass config data:

```typescript
const html = renderEmbedPage({
  ...config,
  projectId: project.id,
}, project.name);
```

**Step 3: Commit**

```
feat: add server-rendered HTML embed template with multi-step form
```

---

### Task 6: Frontend — Embed Settings Tab

**Files:**
- Create: `frontend/src/components/projects/EmbedConfigTab.tsx`
- Create: `frontend/src/components/projects/EmbedSubmissionsTable.tsx`
- Modify: `frontend/src/pages/ProjectDetail.tsx`

**Step 1: Create EmbedConfigTab component**

Create `frontend/src/components/projects/EmbedConfigTab.tsx`:

This component renders:
- Enable/disable toggle
- Appearance section: title, welcome message, logo URL, color pickers (primary, background, text), border radius number input, font dropdown (Inter, System UI, Roboto, Open Sans, Lato, Nunito, Poppins, Montserrat, Source Sans 3, DM Sans)
- Behavior section: score threshold slider (1-10), max file size, max total size, allowed file types chip selector, language dropdown (English, Spanish, French, German, Portuguese, Chinese)
- Live preview: iframe pointed at `/embed/${projectId}?preview=true`
- Embed code snippet with copy button
- Save button

Uses `useQuery` for `getEmbedConfig`, `useMutation` for `updateEmbedConfig`. Debounced preview refresh on config changes.

**Step 2: Create EmbedSubmissionsTable component**

Create `frontend/src/components/projects/EmbedSubmissionsTable.tsx`:

This component renders:
- Status filter tabs: All, Pending Review, Approved, Rejected
- Table with columns: Title, Score, Status, Input Method, Date, Actions
- Approve button (opens dialog to select repository) and reject button for pending/scored submissions
- Expandable rows showing description, attachments list, questions and answers

Uses `useQuery` for `listSubmissions`, `useMutation` for `approveSubmission` and `rejectSubmission`.

**Step 3: Add Embed tab to ProjectDetail.tsx**

In `frontend/src/pages/ProjectDetail.tsx`:

- Add "embed" to the valid tabs list
- Add the tab button in the tab bar
- Add the tab content rendering `EmbedConfigTab` and `EmbedSubmissionsTable`

**Step 4: Commit**

```
feat: add embed configuration and submissions management UI
```

---

### Task 7: Integration Testing & Cleanup

**Step 1: Test the full embed flow end-to-end**

1. Start the dev environment: `npm run dev`
2. Navigate to a project's settings → Embed tab
3. Verify default config loads
4. Customize appearance, verify live preview updates
5. Copy embed code, open in a separate browser tab
6. Submit a requirement through the embed
7. Verify screening job runs (check worker logs)
8. Answer clarification questions if presented
9. Check submissions table in project settings
10. Approve/reject submissions manually

**Step 2: Test edge cases**

- Submit with files attached
- Submit with voice input (if browser supports)
- Submit spam content (should be rejected with low score)
- Submit 4+ times in an hour (should hit rate limit)
- Test embed with disabled config (should show 403)
- Test embed preview mode (should not set cookie)

**Step 3: Verify Docker build still works**

Run: `docker compose -f docker-compose.prod.yml build`

Ensure all new files are included and the build succeeds.

**Step 4: Commit any fixes**

```
fix: address embed integration test findings
```

---

## Summary of All Files

### New Files
| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `backend/src/routes/embed.ts` | ~200 | Public embed API routes |
| `backend/src/templates/embed.ts` | ~700 | Server-rendered HTML template |
| `worker/src/handlers/embed-screen.ts` | ~180 | Haiku-based submission screening |
| `worker/src/handlers/embed-convert.ts` | ~70 | Submission → Task conversion |
| `frontend/src/components/projects/EmbedConfigTab.tsx` | ~350 | Embed settings UI with live preview |
| `frontend/src/components/projects/EmbedSubmissionsTable.tsx` | ~250 | Submissions review table |
| `prisma/migrations/..._add_embed_models/` | auto | Database migration |
| `prisma/migrations/..._add_embed_task_source/` | auto | TaskSource enum migration |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add EmbedConfig, EmbedSubmission, EmbedQuestion models + enum |
| `packages/shared/src/types.ts` | Add embed-related types |
| `packages/shared/src/constants.ts` | Add EMBED_SCREEN, EMBED_CONVERT job names |
| `backend/src/index.ts` | Register embed routes |
| `backend/src/routes/projects.ts` | Add embed config + submission management endpoints |
| `backend/src/services/scheduler.ts` | Add embed queue methods |
| `worker/src/index.ts` | Register embed handlers |
| `frontend/src/lib/api.ts` | Add embed API methods |
| `frontend/src/pages/ProjectDetail.tsx` | Add Embed tab |

### Execution Order
Tasks 1-7 must be executed sequentially — each depends on the previous.
