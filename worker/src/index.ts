// Allow Agent SDK to spawn Claude Code subprocesses (not nested)
delete process.env.CLAUDECODE;

import { PgBoss } from "pg-boss";
import { config } from "./config.js";
import { handleRepoScan } from "./handlers/scan.js";
import { handleTaskPlanning } from "./handlers/plan.js";
import { handleTaskExecution } from "./handlers/execute.js";
import { handleEmbedScreening } from "./handlers/embed-screen.js";
import { handleEmbedConversion } from "./handlers/embed-convert.js";
import { JOB_NAMES } from "@autosoftware/shared";
import { setBoss } from "./boss.js";
import { mkdir } from "fs/promises";
import { initEventNotifier } from "./services/event-notifier.js";

await mkdir(config.workDir, { recursive: true });

// Initialize event notifier for real-time WebSocket updates
initEventNotifier();
console.log("Event notifier initialized for real-time updates");

const boss = new PgBoss(config.databaseUrl);

boss.on("error", (err) => console.error("pg-boss error:", err));

await boss.start();
setBoss(boss);
console.log("Worker started, listening for jobs...");

// Ensure queues exist before registering workers
// Set 1 hour timeout for long-running AI jobs
const HOUR_IN_SECONDS = 3600;
await boss.createQueue(JOB_NAMES.REPO_SCAN, { expireInSeconds: HOUR_IN_SECONDS });
await boss.createQueue(JOB_NAMES.TASK_PLAN, { expireInSeconds: HOUR_IN_SECONDS });
await boss.createQueue(JOB_NAMES.TASK_EXECUTE, { expireInSeconds: HOUR_IN_SECONDS });
await boss.createQueue(JOB_NAMES.EMBED_SCREEN, { expireInSeconds: HOUR_IN_SECONDS });
await boss.createQueue(JOB_NAMES.EMBED_CONVERT, { expireInSeconds: HOUR_IN_SECONDS });

await boss.work(JOB_NAMES.REPO_SCAN, { localConcurrency: 2 }, handleRepoScan as any);
await boss.work(JOB_NAMES.TASK_PLAN, { localConcurrency: 1 }, handleTaskPlanning as any);
await boss.work(JOB_NAMES.TASK_EXECUTE, { localConcurrency: 5 }, handleTaskExecution as any);
await boss.work(JOB_NAMES.EMBED_SCREEN, { localConcurrency: 2 }, handleEmbedScreening as any);
await boss.work(JOB_NAMES.EMBED_CONVERT, { localConcurrency: 1 }, handleEmbedConversion as any);

console.log(`Registered handlers for: ${JOB_NAMES.REPO_SCAN}, ${JOB_NAMES.TASK_PLAN}, ${JOB_NAMES.TASK_EXECUTE}, ${JOB_NAMES.EMBED_SCREEN}, ${JOB_NAMES.EMBED_CONVERT}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down worker...`);
    await boss.stop();
    process.exit(0);
  });
}
