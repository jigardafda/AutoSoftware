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

await mkdir(config.workDir, { recursive: true });

const boss = new PgBoss(config.databaseUrl);

boss.on("error", (err) => console.error("pg-boss error:", err));

await boss.start();
setBoss(boss);
console.log("Worker started, listening for jobs...");

// Ensure queues exist before registering workers
await boss.createQueue(JOB_NAMES.REPO_SCAN);
await boss.createQueue(JOB_NAMES.TASK_PLAN);
await boss.createQueue(JOB_NAMES.TASK_EXECUTE);
await boss.createQueue(JOB_NAMES.EMBED_SCREEN);
await boss.createQueue(JOB_NAMES.EMBED_CONVERT);

await boss.work(JOB_NAMES.REPO_SCAN, { localConcurrency: 1 }, handleRepoScan as any);
await boss.work(JOB_NAMES.TASK_PLAN, { localConcurrency: 1 }, handleTaskPlanning as any);
await boss.work(JOB_NAMES.TASK_EXECUTE, { localConcurrency: 1 }, handleTaskExecution as any);
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
