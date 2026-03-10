import { PgBoss } from "pg-boss";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { JOB_NAMES, ScanSource } from "@autosoftware/shared";

let boss: PgBoss;

export const schedulerService = {
  async start() {
    boss = new PgBoss(config.databaseUrl);
    await boss.start();
    console.log("pg-boss scheduler started");

    // Ensure queues exist
    await boss.createQueue(JOB_NAMES.REPO_SCAN);
    await boss.createQueue(JOB_NAMES.TASK_PLAN);
    await boss.createQueue(JOB_NAMES.TASK_EXECUTE);
    await boss.createQueue(JOB_NAMES.EMBED_SCREEN);
    await boss.createQueue(JOB_NAMES.EMBED_CONVERT);

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
    // For scheduled/periodic scans, don't create record until job actually runs
    // The worker will create the record when processing starts
    await boss.send(JOB_NAMES.REPO_SCAN, { repoId, source: "scheduled" }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 60 * 60, // 1 hour
      singletonKey: `scan-${repoId}`,
      startAfter: intervalMinutes * 60,
    });
  },

  async cancelRepoScan(_repoId: string) {
    // Jobs with singletonKey will naturally not be re-queued if repo is deactivated
  },

  async triggerScan(repoId: string, projectId?: string, branch?: string, source: ScanSource = "manual") {
    // Resolve the target branch - if not specified, use repo's default
    let targetBranch = branch;
    if (!targetBranch) {
      const repo = await prisma.repository.findUnique({
        where: { id: repoId },
        select: { defaultBranch: true },
      });
      targetBranch = repo?.defaultBranch || "main";
    }

    // Create scan record immediately with queued status and branch
    const scanResult = await prisma.scanResult.create({
      data: {
        repositoryId: repoId,
        branch: targetBranch,
        status: "queued",
        source,
      },
    });

    await boss.send(JOB_NAMES.REPO_SCAN, { repoId, projectId, branch: targetBranch, scanResultId: scanResult.id }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 60 * 60, // 1 hour
    });

    return scanResult;
  },

  async queueTaskPlanning(taskId: string) {
    await boss.send(JOB_NAMES.TASK_PLAN, { taskId }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 60 * 60, // 1 hour
    });
  },

  async queueTaskExecution(taskId: string) {
    await boss.send(JOB_NAMES.TASK_EXECUTE, { taskId }, {
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 60 * 60,
    });
  },

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

  getBoss() {
    return boss;
  },
};
