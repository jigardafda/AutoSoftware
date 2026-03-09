import { PgBoss } from "pg-boss";
import { config } from "./config.js";
import { handleRepoScan } from "./handlers/scan.js";
import { handleTaskExecution } from "./handlers/execute.js";
import { JOB_NAMES } from "@autosoftware/shared";
import { mkdir } from "fs/promises";

await mkdir(config.workDir, { recursive: true });

const boss = new PgBoss(config.databaseUrl);

boss.on("error", (err) => console.error("pg-boss error:", err));

await boss.start();
console.log("Worker started, listening for jobs...");

await boss.work(JOB_NAMES.REPO_SCAN, { teamConcurrency: 2 }, handleRepoScan as any);
await boss.work(JOB_NAMES.TASK_EXECUTE, { teamConcurrency: 1 }, handleTaskExecution as any);

console.log(`Registered handlers for: ${JOB_NAMES.REPO_SCAN}, ${JOB_NAMES.TASK_EXECUTE}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down worker...`);
    await boss.stop();
    process.exit(0);
  });
}
