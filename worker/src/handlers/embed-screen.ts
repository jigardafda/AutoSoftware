import { prisma } from "../db.js";
import { simpleQuery, recordUsage } from "../services/claude-query.js";
import { setupAgentSdkAuth, resolveAuth, isValidAuth } from "../services/api-key-resolver.js";

const MAX_CLARIFICATION_ROUNDS = 2;
const MAX_QUESTIONS_PER_ROUND = 5;

export async function handleEmbedScreening(jobs: { data: { submissionId: string } }[]) {
  const { submissionId } = jobs[0].data;

  const submission = await prisma.embedSubmission.findUnique({
    where: { id: submissionId },
    include: {
      project: {
        include: { user: true },
      },
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

  // Set up authentication (OAuth or API key)
  const auth = await resolveAuth(submission.project.userId);
  if (!isValidAuth(auth)) {
    console.error("Embed screening aborted: No authentication configured");
    await prisma.embedSubmission.update({
      where: { id: submissionId },
      data: {
        screeningStatus: "pending",
        metadata: { error: "No authentication configured" },
      },
    });
    return;
  }
  setupAgentSdkAuth(auth);

  await prisma.embedSubmission.update({
    where: { id: submissionId },
    data: { screeningStatus: "screening" },
  });

  try {
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

    const systemPrompt = `You are evaluating a requirement submission for a software project.
Respond with JSON only (no markdown code blocks).

Score guidelines:
- 8-10: Clear, actionable requirement with good detail
- 5-7: Reasonable requirement but could use more detail
- 3-4: Vague or unclear, needs significant clarification
- 1-2: Spam, gibberish, or completely irrelevant

Maximum ${MAX_QUESTIONS_PER_ROUND} questions per round. Prefer select/multi_select over text when possible.`;

    const userPrompt = `Evaluate this submission for the software project "${submission.project.name}":

Title: ${submission.title}
Description: ${submission.description}
Input method: ${submission.inputMethod}
${attachmentInfo ? `Attachments: ${attachmentInfo}` : ""}
${previousContext}

If the submission is clear enough to be a valid software requirement, respond:
{"status": "ready", "score": <1-10>, "reason": "<brief explanation>"}

If you need more information to properly evaluate (and this is round ${submission.clarificationRound + 1} of max ${MAX_CLARIFICATION_ROUNDS}), respond:
{"status": "needs_input", "score": <1-10 preliminary>, "reason": "<why more info needed>", "questions": [{"questionKey": "<snake_case_id>", "label": "<question text>", "type": "<select|multi_select|confirm|text>", "options": [{"value": "<val>", "label": "<display>"}], "required": true}]}

If the submission is spam, gibberish, or completely irrelevant, respond:
{"status": "rejected", "score": <1-3>, "reason": "<brief explanation>"}`;

    // Use Agent SDK (supports OAuth!) with usage tracking
    const model = "claude-haiku-4-5-20251001";
    const { result: text, usage } = await simpleQuery(systemPrompt, userPrompt, { model });

    // Record usage if using a stored API key
    if (auth.apiKeyId) {
      await recordUsage(
        auth.apiKeyId,
        model,
        usage.inputTokens,
        usage.outputTokens,
        usage.costUsd,
        "embed_screen",
        submissionId
      );
    }

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
