import { PgBoss } from "pg-boss";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { JOB_NAMES } from "@autosoftware/shared";

let boss: PgBoss;

export const schedulerService = {
  async start() {
    boss = new PgBoss(config.databaseUrl);
    await boss.start();
    console.log("pg-boss scheduler started");

    // Ensure queues exist
    await boss.createQueue(JOB_NAMES.REPO_SCAN);
    await boss.createQueue(JOB_NAMES.TASK_EXECUTE);

    const activeRepos = await prisma.repository.findMany({
      where: { isActive: true },
    });
    for (const repo of activeRepos) {
      await this.scheduleRepoScan(repo.id, repo.scanInterval);
    }
  },

  async stop() {
    if (boss) await boss.stop();
  },

  async scheduleRepoScan(repoId: string, intervalMinutes: number) {
    await boss.send(JOB_NAMES.REPO_SCAN, { repoId }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInMinutes: 30,
      singletonKey: `scan-${repoId}`,
      startAfter: intervalMinutes * 60,
    });
  },

  async cancelRepoScan(_repoId: string) {
    // Jobs with singletonKey will naturally not be re-queued if repo is deactivated
  },

  async triggerScan(repoId: string) {
    await boss.send(JOB_NAMES.REPO_SCAN, { repoId }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInMinutes: 30,
    });
  },

  async queueTaskExecution(taskId: string) {
    await boss.send(JOB_NAMES.TASK_EXECUTE, { taskId }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInMinutes: 60,
    });
  },

  getBoss() {
    return boss;
  },
};
