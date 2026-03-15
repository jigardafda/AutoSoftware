import { prisma } from '../db.js';
import { agentRegistry } from './acp/agent-registry.js';
import { fetchPullRequestDiff, type PrDiffInfo } from './git-providers.js';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import type { OAuthProvider } from '@autosoftware/shared';

const execFileAsync = promisify(execFile);

function parsePrUrl(url: string): { provider: OAuthProvider; owner: string; repo: string; number: number } {
  const ghMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (ghMatch) {
    return { provider: 'github', owner: ghMatch[1], repo: ghMatch[2], number: parseInt(ghMatch[3], 10) };
  }
  const glMatch = url.match(/gitlab\.com\/([^/]+)\/([^/]+)\/-\/merge_requests\/(\d+)/);
  if (glMatch) {
    return { provider: 'gitlab', owner: glMatch[1], repo: glMatch[2], number: parseInt(glMatch[3], 10) };
  }
  const bbMatch = url.match(/bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/);
  if (bbMatch) {
    return { provider: 'bitbucket', owner: bbMatch[1], repo: bbMatch[2], number: parseInt(bbMatch[3], 10) };
  }
  throw new Error('Unsupported PR URL format. Supported: GitHub, GitLab, Bitbucket.');
}

/**
 * Fetch PR info using the stored OAuth token (web mode) or gh CLI token (local mode).
 * Single code path — resolveGitHubToken handles the fallback internally.
 */
async function fetchPrInfo(url: string, userId: string | null): Promise<PrDiffInfo> {
  const parsed = parsePrUrl(url);
  const repoFullName = `${parsed.owner}/${parsed.repo}`;

  // Try to get stored OAuth token for this user
  let accessToken: string | null = null;
  if (userId) {
    const account = await prisma.account.findFirst({
      where: { userId, provider: parsed.provider },
    });
    accessToken = account?.accessToken || null;
  }

  // fetchPullRequestDiff → resolveGitHubToken handles the gh CLI fallback
  return fetchPullRequestDiff(
    parsed.provider,
    accessToken || '',
    repoFullName,
    parsed.number,
  );
}

function buildReviewPrompt(pr: PrDiffInfo): string {
  const truncatedDiff = pr.diff.length > 100_000
    ? pr.diff.slice(0, 100_000) + '\n\n... [diff truncated due to size] ...'
    : pr.diff;

  return `You are a senior code reviewer. Review the following pull request and provide a thorough, constructive review.

## Pull Request
- **Title:** ${pr.title}
- **Branch:** ${pr.headBranch} → ${pr.baseBranch}
- **Provider:** ${pr.provider}
- **URL:** ${pr.url}
- **Files changed:** ${pr.files.join(', ')}

## PR Description
${pr.description || '(no description provided)'}

## Diff
\`\`\`diff
${truncatedDiff}
\`\`\`

## Instructions
Provide your review as a JSON object with this exact structure:
{
  "summary": "A narrative overview of what this PR does, key decisions, potential concerns, and overall quality. Write 2-4 paragraphs.",
  "verdict": "approve" | "request_changes" | "comment",
  "comments": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "critical" | "warning" | "suggestion" | "nitpick" | "praise",
      "comment": "Detailed comment about this specific location"
    }
  ]
}

Guidelines:
- Be constructive and specific
- For "line", use the line number in the new file (from the + lines in the diff), or null if it's a general file comment
- Use "critical" for bugs, security issues, data loss risks
- Use "warning" for potential issues, performance concerns, error handling gaps
- Use "suggestion" for improvements, better patterns, readability
- Use "nitpick" for style, naming, minor preferences
- Use "praise" for well-written code worth highlighting
- Focus on what matters — don't nitpick everything
- The summary should tell the story of the PR, not just list changes

IMPORTANT: Respond with ONLY the JSON object, no markdown fences, no explanation before or after.`;
}

function parseReviewOutput(raw: string): { summary: string; verdict: string; comments: any[] } {
  const jsonMatch = raw.match(/\{[\s\S]*"summary"[\s\S]*"verdict"[\s\S]*"comments"[\s\S]*\}/);
  if (!jsonMatch) {
    return { summary: raw.trim(), verdict: 'comment', comments: [] };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary || '',
      verdict: parsed.verdict || 'comment',
      comments: (parsed.comments || []).map((c: any) => ({
        file: c.file || 'unknown',
        line: c.line ?? null,
        severity: c.severity || 'suggestion',
        comment: c.comment || '',
      })),
    };
  } catch {
    return { summary: raw.trim(), verdict: 'comment', comments: [] };
  }
}

function spawnAgentProcess(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
  prompt: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('error', (err: Error) => reject(err));
    child.on('close', (code: number) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Agent exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout);
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function runAgentReview(agentId: string, prompt: string, modelId?: string): Promise<string> {
  await agentRegistry.detectAll();

  const agent = agentRegistry.getById(agentId);
  if (!agent) {
    throw new Error(`Agent "${agentId}" is not recognized. Available agents: ${agentRegistry.getAll().map(a => a.id).join(', ')}`);
  }
  if (!agent.available) {
    throw new Error(
      `Agent "${agent.name}" is not installed. Please install it first:\n` +
      (agent.command === 'npx'
        ? `  npm install -g ${agent.args.find(a => !a.startsWith('-')) || agent.id}`
        : `  Install "${agent.command}" and make sure it's on your PATH`)
    );
  }

  const childEnv: Record<string, string | undefined> = { ...process.env, FORCE_COLOR: '0' };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('CLAUDE_CODE') || key === 'CLAUDECODE') {
      delete childEnv[key];
    }
  }

  switch (agent.id) {
    case 'claude-code': {
      const args = modelId ? ['-p', '--model', modelId, '-'] : ['-p', '-'];
      return spawnAgentProcess(agent.command, args, childEnv, prompt);
    }
    case 'codex':
      return spawnAgentProcess('codex', ['-q', '-'], childEnv, prompt);
    case 'gemini':
      return spawnAgentProcess('gemini', ['-p', '-'], childEnv, prompt);
    case 'aider': {
      const reviewDir = `${homedir()}/.auto-software/reviews`;
      mkdirSync(reviewDir, { recursive: true });
      const tmpFile = `${reviewDir}/auto-review-${Date.now()}.txt`;
      writeFileSync(tmpFile, prompt);
      try {
        const { stdout } = await execFileAsync('aider', ['--message-file', tmpFile, '--no-git', '--yes'], {
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        return stdout;
      } finally {
        try { unlinkSync(tmpFile); } catch {}
      }
    }
    case 'amp':
      return spawnAgentProcess('amp', ['-p', '-'], childEnv, prompt);
    default:
      if (agent.command === 'npx') {
        throw new Error(
          `Agent "${agent.name}" doesn't support prompt-based review yet. ` +
          `Please use Claude Code, Codex, Gemini CLI, Aider, or Amp for reviews.`
        );
      }
      return spawnAgentProcess(agent.command, ['-p', '-'], childEnv, prompt);
  }
}

export async function processReview(reviewId: string): Promise<void> {
  const review = await prisma.prReview.findUnique({ where: { id: reviewId } });
  if (!review) throw new Error('Review not found');
  if (review.status !== 'pending') return;

  await prisma.prReview.update({
    where: { id: reviewId },
    data: { status: 'running' },
  });

  try {
    // 1. Fetch PR info via REST API (uses stored token or gh CLI token)
    const prInfo = await fetchPrInfo(review.prUrl, review.userId);

    // Check if cancelled while fetching
    const afterFetch = await prisma.prReview.findUnique({ where: { id: reviewId } });
    if (afterFetch?.status === 'cancelled') return;

    // Update review with PR metadata
    await prisma.prReview.update({
      where: { id: reviewId },
      data: {
        title: prInfo.title || review.title,
        description: prInfo.description || review.description,
        owner: prInfo.owner,
        repo: prInfo.repo,
        prNumber: prInfo.number,
        baseBranch: prInfo.baseBranch,
        headBranch: prInfo.headBranch,
        filesChanged: prInfo.files,
      },
    });

    // 2. Build prompt and run through the selected agent
    const prompt = buildReviewPrompt(prInfo);
    const agentId = review.agentId || 'claude-code';

    // Look up user's preferred model for this agent
    let agentModel: string | undefined;
    if (review.userId) {
      const user = await prisma.user.findUnique({ where: { id: review.userId }, select: { settings: true } });
      const settings = (user?.settings as any) || {};
      agentModel = settings.agentModels?.[agentId] || undefined;
    }

    const rawOutput = await runAgentReview(agentId, prompt, agentModel);

    // Check if cancelled while reviewing
    const afterReview = await prisma.prReview.findUnique({ where: { id: reviewId } });
    if (afterReview?.status === 'cancelled') return;

    // 3. Parse and save
    const result = parseReviewOutput(rawOutput);

    await prisma.prReview.update({
      where: { id: reviewId },
      data: {
        status: 'completed',
        summary: result.summary,
        verdict: result.verdict,
        comments: result.comments,
      },
    });

    console.log(`[review-processor] Review ${reviewId} completed via ${agentId}: ${result.verdict} (${result.comments.length} comments)`);
  } catch (err: any) {
    console.error(`[review-processor] Review ${reviewId} failed:`, err.message);
    await prisma.prReview.update({
      where: { id: reviewId },
      data: {
        status: 'failed',
        error: err.message || 'Unknown error',
      },
    });
  }
}
