/**
 * Seed script to populate the database with realistic analytics data.
 * Run with: npx tsx scripts/seed-analytics.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randomBetween(6, 22), randomBetween(0, 59), randomBetween(0, 59));
  return d;
}

const TASK_TYPES = ["improvement", "bugfix", "feature", "refactor", "security"] as const;
const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const TASK_STATUSES = ["completed", "completed", "completed", "completed", "failed", "in_progress", "pending", "planning"] as const;
const MODELS = ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-5-20251001"];
const SOURCES = ["scan", "task_plan", "task_execute", "chat", "command"];
const SCAN_STATUSES = ["completed", "completed", "completed", "failed", "in_progress"] as const;

const TEAM_NAMES = [
  { name: "Alice Chen", email: "alice@company.com" },
  { name: "Bob Martinez", email: "bob@company.com" },
  { name: "Carol Kim", email: "carol@company.com" },
  { name: "David Patel", email: "david@company.com" },
  { name: "Eve Johnson", email: "eve@company.com" },
];

const REPO_NAMES = [
  { name: "api-gateway", fullName: "org/api-gateway", language: "TypeScript" },
  { name: "web-dashboard", fullName: "org/web-dashboard", language: "TypeScript" },
  { name: "auth-service", fullName: "org/auth-service", language: "Go" },
  { name: "data-pipeline", fullName: "org/data-pipeline", language: "Python" },
  { name: "mobile-app", fullName: "org/mobile-app", language: "Swift" },
];

async function main() {
  console.log("Seeding analytics data...");

  // Get the admin user (dev login user)
  let adminUser = await prisma.user.findFirst({ where: { email: "admin@autosoftware.com" } });
  if (!adminUser) {
    console.log("No admin user found. Creating...");
    adminUser = await prisma.user.create({
      data: { email: "admin@autosoftware.com", name: "Admin User" },
    });
  }
  const userId = adminUser.id;

  // Create team members
  const teamUsers: string[] = [userId];
  for (const member of TEAM_NAMES) {
    let user = await prisma.user.findFirst({ where: { email: member.email } });
    if (!user) {
      user = await prisma.user.create({ data: { email: member.email, name: member.name } });
    }
    teamUsers.push(user.id);
  }

  // Create repositories
  const repoIds: string[] = [];
  for (const repo of REPO_NAMES) {
    let existing = await prisma.repository.findFirst({ where: { fullName: repo.fullName, userId } });
    if (!existing) {
      existing = await prisma.repository.create({
        data: {
          userId,
          fullName: repo.fullName,
          cloneUrl: `https://github.com/${repo.fullName}.git`,
          providerRepoId: `repo-${repo.name}-${Date.now()}`,
          provider: "github",
          defaultBranch: "main",
          status: "idle",
        },
      });
    }
    repoIds.push(existing.id);
  }

  // Create a project
  let project = await prisma.project.findFirst({ where: { name: "Main Product", userId } });
  if (!project) {
    project = await prisma.project.create({
      data: { name: "Main Product", userId, description: "Primary product development" },
    });
    // Link repos to project
    for (const repoId of repoIds.slice(0, 3)) {
      await prisma.projectRepository.create({
        data: { projectId: project.id, repositoryId: repoId },
      }).catch(() => {}); // ignore duplicates
    }
  }

  // Create 90 days of tasks
  console.log("Creating tasks...");
  const taskIds: string[] = [];
  for (let day = 0; day < 90; day++) {
    const tasksToday = randomBetween(1, 6);
    for (let t = 0; t < tasksToday; t++) {
      const status = randomItem(TASK_STATUSES);
      const type = randomItem(TASK_TYPES);
      const priority = randomItem(TASK_PRIORITIES);
      const repoId = randomItem(repoIds);
      // Assign ~70% of tasks to admin so analytics look populated for the logged-in user
      const assignedUser = Math.random() < 0.7 ? userId : randomItem(teamUsers);
      const createdAt = daysAgo(day);
      const planningRounds = randomBetween(1, 3);

      const task = await prisma.task.create({
        data: {
          userId: assignedUser,
          repositoryId: repoId,
          projectId: project.id,
          title: `${type === "bugfix" ? "Fix" : type === "feature" ? "Add" : type === "security" ? "Patch" : "Improve"} ${randomItem(["auth flow", "API endpoint", "database query", "caching layer", "error handling", "validation", "logging", "rate limiting", "pagination", "search", "notifications", "webhooks"])}`,
          description: `Auto-generated ${type} task`,
          type,
          priority,
          status,
          source: randomItem(["auto_scan", "manual", "manual", "manual"]),
          planningRound: planningRounds,
          createdAt,
          updatedAt: status === "completed" || status === "failed"
            ? new Date(createdAt.getTime() + randomBetween(5, 120) * 60000)
            : createdAt,
        },
      });
      taskIds.push(task.id);

      // Code change metrics for completed tasks
      if (status === "completed") {
        const linesAdded = randomBetween(10, 500);
        const linesDeleted = randomBetween(5, 200);
        await prisma.codeChangeMetrics.create({
          data: {
            userId: assignedUser,
            taskId: task.id,
            repositoryId: repoId,
            projectId: project.id,
            linesAdded,
            linesDeleted,
            filesChanged: randomBetween(1, 15),
            commitCount: randomBetween(1, 5),
            createdAt,
          },
        });

        // Time saved
        await prisma.engineeringTimeSaved.create({
          data: {
            userId: assignedUser,
            taskId: task.id,
            repositoryId: repoId,
            projectId: project.id,
            estimatedMinutesSaved: randomBetween(15, 240),
            complexityFactor: randomFloat(0.5, 2.0),
            locFactor: randomFloat(0.3, 1.5),
            contextFactor: randomFloat(0.5, 1.0),
            createdAt,
          },
        });
      }
    }
  }

  // Usage records (token usage and cost) - daily records for 90 days
  console.log("Creating usage records...");
  for (let day = 0; day < 90; day++) {
    const recordsToday = randomBetween(3, 15);
    for (let r = 0; r < recordsToday; r++) {
      const model = randomItem(MODELS);
      const source = randomItem(SOURCES);
      const inputTokens = randomBetween(500, 50000);
      const outputTokens = randomBetween(200, 20000);
      // Approximate cost based on model
      const costPerInputToken = model.includes("opus") ? 0.000015 : model.includes("sonnet") ? 0.000003 : 0.0000008;
      const costPerOutputToken = model.includes("opus") ? 0.000075 : model.includes("sonnet") ? 0.000015 : 0.000004;
      const cost = inputTokens * costPerInputToken + outputTokens * costPerOutputToken;

      await prisma.usageRecord.create({
        data: {
          userId,
          source,
          model,
          inputTokens,
          outputTokens,
          estimatedCostUsd: parseFloat(cost.toFixed(6)),
          createdAt: daysAgo(day),
        },
      });
    }
  }

  // Scan results
  console.log("Creating scan results...");
  for (let day = 0; day < 90; day += randomBetween(1, 3)) {
    const repoIdx = randomBetween(0, repoIds.length - 1);
    const repoId = repoIds[repoIdx];
    const createdAt = daysAgo(day);
    const status = randomItem(["completed", "completed", "completed", "failed"] as const);
    await prisma.scanResult.create({
      data: {
        repositoryId: repoId,
        branch: "main",
        status,
        tasksCreated: status === "completed" ? randomBetween(0, 5) : 0,
        inputTokens: randomBetween(10000, 100000),
        outputTokens: randomBetween(5000, 50000),
        estimatedCostUsd: randomFloat(0.01, 0.5),
        primaryLanguage: REPO_NAMES[repoIdx]?.language || "TypeScript",
        scannedAt: createdAt,
        startedAt: createdAt,
        completedAt: new Date(createdAt.getTime() + randomBetween(30, 300) * 1000),
      },
    });
  }

  // Activity events
  console.log("Creating activity events...");
  const eventTypes = ["task.created", "task.completed", "task.failed", "task.started", "scan.started", "scan.completed", "pr.created", "code.changed"];
  for (let day = 0; day < 30; day++) {
    const eventsToday = randomBetween(2, 8);
    for (let e = 0; e < eventsToday; e++) {
      const type = randomItem(eventTypes);
      await prisma.activityEvent.create({
        data: {
          userId,
          type,
          title: `${type.split(".")[1]?.charAt(0).toUpperCase()}${type.split(".")[1]?.slice(1)} - ${randomItem(["API service", "auth module", "dashboard", "core library", "test suite"])}`,
          metadata: { repositoryName: randomItem(REPO_NAMES).name },
          createdAt: daysAgo(day),
        },
      });
    }
  }

  // AI Metrics
  console.log("Creating AI metrics...");
  for (let day = 0; day < 60; day += 1) {
    await prisma.aIMetric.create({
      data: {
        userId,
        metricType: randomItem(["accuracy", "false_positive", "execution_success", "precision", "recall"]),
        value: randomFloat(0.7, 0.98),
        entityType: randomItem(["task", "scan", "finding"]),
        metadata: {},
        createdAt: daysAgo(day),
      },
    });
  }

  // AI Feedback
  console.log("Creating AI feedback...");
  for (let i = 0; i < 40; i++) {
    await prisma.aIFeedback.create({
      data: {
        userId,
        feedbackType: randomItem(["thumbs_up", "thumbs_up", "thumbs_up", "thumbs_down", "false_positive"]),
        entityType: "task",
        entityId: randomItem(taskIds),
        comment: randomItem([null, "Good fix", "Missed edge case", "Excellent refactor", null, null]),
        createdAt: daysAgo(randomBetween(0, 30)),
      },
    });
  }

  // Code Health Snapshots
  console.log("Creating code health snapshots...");
  for (const repoId of repoIds) {
    for (let day = 0; day < 30; day += 3) {
      try {
        await prisma.codeHealthSnapshot.create({
          data: {
            repositoryId: repoId,
            overallScore: randomFloat(60, 95),
            complexityScore: randomFloat(55, 90),
            duplicationScore: randomFloat(70, 98),
            duplicationPct: randomFloat(2, 15),
            totalFiles: randomBetween(50, 300),
            totalLines: randomBetween(5000, 50000),
            avgComplexity: randomFloat(3, 12),
            bugRiskCount: randomBetween(2, 30),
            testCoveragePct: randomFloat(40, 85),
            analyzedAt: daysAgo(day),
          },
        });
      } catch(e: any) {
        console.log("  Health snapshot skip:", e.message?.slice(0, 80));
        break; // stop trying if schema doesn't match
      }
    }
  }

  // Dependency alerts
  console.log("Creating dependency alerts...");
  for (let i = 0; i < 20; i++) {
    await prisma.dependencyAlert.create({
      data: {
        repositoryId: randomItem(repoIds),
        userId,
        ecosystem: randomItem(["npm", "pypi", "go"] as const),
        packageName: randomItem(["lodash", "express", "axios", "react", "next", "prisma", "pg", "winston", "jsonwebtoken", "bcrypt"]),
        currentVersion: `${randomBetween(1, 5)}.${randomBetween(0, 20)}.${randomBetween(0, 10)}`,
        severity: randomItem(["low", "moderate", "high", "critical"]),
        alertType: randomItem(["security", "deprecated", "upgrade_available", "unmaintained"]),
        title: randomItem(["Prototype Pollution", "ReDoS vulnerability", "Path Traversal", "XSS vulnerability", "Deprecated API"]),
        description: "Auto-generated alert",
        status: randomItem(["active", "active", "active", "resolved", "dismissed"]),
        createdAt: daysAgo(randomBetween(0, 60)),
      },
    });
  }

  // Feedback signals
  console.log("Creating feedback signals...");
  for (let i = 0; i < 30; i++) {
    try {
      await prisma.feedbackSignal.create({
        data: {
          userId,
          taskId: randomItem(taskIds),
          signal: randomItem(["thumbs_up", "thumbs_up", "thumbs_up", "thumbs_down", "pr_approved", "pr_approved"]),
          createdAt: daysAgo(randomBetween(0, 30)),
        },
      });
    } catch { /* skip on schema mismatch */ }
  }

  // Team activity
  console.log("Creating team activity...");
  for (let day = 0; day < 14; day++) {
    for (const memberId of teamUsers.slice(0, 4)) {
      const activitiesToday = randomBetween(2, 6);
      for (let a = 0; a < activitiesToday; a++) {
        try {
          await prisma.teamActivity.create({
            data: {
              userId: memberId,
              activityType: randomItem(["task_start", "task_complete", "comment", "review", "scan", "coding"]),
              metadata: {},
              createdAt: daysAgo(day),
            },
          });
        } catch { /* skip */ }
      }
    }
  }

  console.log("Seeding complete!");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
