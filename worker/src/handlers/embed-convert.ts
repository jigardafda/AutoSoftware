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
