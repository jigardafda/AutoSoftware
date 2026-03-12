/**
 * GitHub Deep Integration Service
 *
 * Provides advanced GitHub integration features:
 * - Auto-inject issue/PR context into tasks
 * - Real-time GitHub status tracking (CI, reviews)
 * - PR review comment syncing to task comments
 * - GitHub label to task priority mapping
 * - Webhook handling for real-time updates
 */

import { prisma } from "../db.js";
import type { TaskPriority, TaskType } from "@autosoftware/shared";

// ============================================================================
// Types
// ============================================================================

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: Array<{ name: string; color: string }>;
  assignee: { login: string } | null;
  assignees: Array<{ login: string }>;
  milestone: { title: string; number: number } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: { login: string; avatar_url: string };
}

export interface GitHubPullRequest extends GitHubIssue {
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  draft: boolean;
  merged: boolean;
  merged_at: string | null;
  mergeable: boolean | null;
  mergeable_state: string;
  review_comments: number;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GitHubReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  diff_hunk: string;
  user: { login: string; avatar_url: string };
  created_at: string;
  updated_at: string;
  html_url: string;
  in_reply_to_id?: number;
}

export interface GitHubReview {
  id: number;
  user: { login: string; avatar_url: string };
  body: string | null;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" | "DISMISSED";
  submitted_at: string;
  html_url: string;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
}

export interface GitHubStatus {
  ci: {
    status: "pending" | "success" | "failure" | "neutral";
    checks: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      url: string;
    }>;
  };
  reviews: {
    status: "pending" | "approved" | "changes_requested" | "commented";
    reviewers: Array<{
      login: string;
      state: string;
      avatarUrl: string;
    }>;
  };
  mergeable: boolean | null;
  draft: boolean;
  merged: boolean;
}

export interface GitHubContext {
  type: "issue" | "pull_request";
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  assignees: string[];
  state: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  // PR-specific fields
  baseBranch?: string;
  headBranch?: string;
  draft?: boolean;
  merged?: boolean;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  // Derived fields
  mappedPriority: TaskPriority;
  mappedType: TaskType;
}

export interface TaskComment {
  id: string;
  author: string;
  authorAvatarUrl: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  source: "github_review" | "github_issue" | "user";
  sourceUrl?: string;
  filePath?: string;
  lineNumber?: number;
  diffHunk?: string;
  inReplyToId?: string;
}

// ============================================================================
// Label to Priority/Type Mapping Configuration
// ============================================================================

export interface LabelMappingConfig {
  priority: Record<string, TaskPriority>;
  type: Record<string, TaskType>;
  // Pattern matching for more flexible label handling
  priorityPatterns: Array<{ pattern: RegExp; priority: TaskPriority }>;
  typePatterns: Array<{ pattern: RegExp; type: TaskType }>;
}

const DEFAULT_LABEL_MAPPING: LabelMappingConfig = {
  priority: {
    // Exact matches
    "priority: critical": "critical",
    "priority: high": "high",
    "priority: medium": "medium",
    "priority: low": "low",
    "priority-critical": "critical",
    "priority-high": "high",
    "priority-medium": "medium",
    "priority-low": "low",
    "p0": "critical",
    "p1": "high",
    "p2": "medium",
    "p3": "low",
    "urgent": "critical",
    "critical": "critical",
    "blocker": "critical",
    "high-priority": "high",
    "low-priority": "low",
  },
  type: {
    // Exact matches
    "bug": "bugfix",
    "fix": "bugfix",
    "bugfix": "bugfix",
    "defect": "bugfix",
    "feature": "feature",
    "enhancement": "feature",
    "new-feature": "feature",
    "feature-request": "feature",
    "improvement": "improvement",
    "refactor": "refactor",
    "tech-debt": "refactor",
    "technical-debt": "refactor",
    "security": "security",
    "vulnerability": "security",
    "cve": "security",
  },
  priorityPatterns: [
    { pattern: /priority[:\-_\s]*critical/i, priority: "critical" },
    { pattern: /priority[:\-_\s]*high/i, priority: "high" },
    { pattern: /priority[:\-_\s]*medium/i, priority: "medium" },
    { pattern: /priority[:\-_\s]*low/i, priority: "low" },
    { pattern: /p[:\-_\s]*0/i, priority: "critical" },
    { pattern: /p[:\-_\s]*1/i, priority: "high" },
    { pattern: /p[:\-_\s]*2/i, priority: "medium" },
    { pattern: /p[:\-_\s]*3/i, priority: "low" },
  ],
  typePatterns: [
    { pattern: /bug|defect|issue/i, type: "bugfix" },
    { pattern: /feature|enhancement/i, type: "feature" },
    { pattern: /security|vuln|cve/i, type: "security" },
    { pattern: /refactor|tech[\-_\s]*debt/i, type: "refactor" },
    { pattern: /improve|update|upgrade/i, type: "improvement" },
  ],
};

// ============================================================================
// GitHub API Helper
// ============================================================================

async function ghApi<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${res.status}`);
  }

  return res.json();
}

// ============================================================================
// Label Mapping Functions
// ============================================================================

/**
 * Get custom label mapping configuration for a user/project
 */
export async function getLabelMappingConfig(
  userId: string,
  projectId?: string
): Promise<LabelMappingConfig> {
  // Try to get project-specific config first
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (project) {
      // Check for project-level settings (stored in a settings model or project metadata)
      // For now, return default mapping
    }
  }

  // Check user-level settings
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });

  const settings = user?.settings as Record<string, unknown> | null;
  const customMapping = settings?.githubLabelMapping as Partial<LabelMappingConfig> | undefined;

  if (customMapping) {
    return {
      priority: { ...DEFAULT_LABEL_MAPPING.priority, ...customMapping.priority },
      type: { ...DEFAULT_LABEL_MAPPING.type, ...customMapping.type },
      priorityPatterns: [
        ...DEFAULT_LABEL_MAPPING.priorityPatterns,
        ...(customMapping.priorityPatterns || []),
      ],
      typePatterns: [
        ...DEFAULT_LABEL_MAPPING.typePatterns,
        ...(customMapping.typePatterns || []),
      ],
    };
  }

  return DEFAULT_LABEL_MAPPING;
}

/**
 * Map GitHub labels to task priority
 */
export function mapLabelsToPriority(
  labels: string[],
  config: LabelMappingConfig = DEFAULT_LABEL_MAPPING
): TaskPriority {
  // Check exact matches first
  for (const label of labels) {
    const normalized = label.toLowerCase().trim();
    if (config.priority[normalized]) {
      return config.priority[normalized];
    }
  }

  // Check patterns
  for (const label of labels) {
    for (const { pattern, priority } of config.priorityPatterns) {
      if (pattern.test(label)) {
        return priority;
      }
    }
  }

  // Default priority
  return "medium";
}

/**
 * Map GitHub labels to task type
 */
export function mapLabelsToType(
  labels: string[],
  config: LabelMappingConfig = DEFAULT_LABEL_MAPPING
): TaskType {
  // Check exact matches first
  for (const label of labels) {
    const normalized = label.toLowerCase().trim();
    if (config.type[normalized]) {
      return config.type[normalized];
    }
  }

  // Check patterns
  for (const label of labels) {
    for (const { pattern, type } of config.typePatterns) {
      if (pattern.test(label)) {
        return type;
      }
    }
  }

  // Default type
  return "improvement";
}

// ============================================================================
// GitHub Context Fetching
// ============================================================================

/**
 * Fetch issue or PR context from GitHub
 */
export async function fetchGitHubContext(
  token: string,
  owner: string,
  repo: string,
  numberOrUrl: number | string,
  labelConfig?: LabelMappingConfig
): Promise<GitHubContext> {
  let number: number;

  // Parse number from URL if needed
  if (typeof numberOrUrl === "string") {
    const match = numberOrUrl.match(/(?:issues|pull)\/(\d+)/);
    if (match) {
      number = parseInt(match[1], 10);
    } else {
      number = parseInt(numberOrUrl, 10);
    }
  } else {
    number = numberOrUrl;
  }

  // Try to fetch as PR first, fall back to issue
  let isPR = false;
  let data: GitHubIssue | GitHubPullRequest;

  try {
    data = await ghApi<GitHubPullRequest>(token, `/repos/${owner}/${repo}/pulls/${number}`);
    isPR = true;
  } catch {
    // Not a PR, fetch as issue
    data = await ghApi<GitHubIssue>(token, `/repos/${owner}/${repo}/issues/${number}`);
  }

  const labels = data.labels.map((l) => l.name);
  const config = labelConfig || DEFAULT_LABEL_MAPPING;

  const context: GitHubContext = {
    type: isPR ? "pull_request" : "issue",
    number: data.number,
    title: data.title,
    body: data.body,
    labels,
    assignees: data.assignees.map((a) => a.login),
    state: data.state,
    url: data.html_url,
    author: data.user.login,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    mappedPriority: mapLabelsToPriority(labels, config),
    mappedType: mapLabelsToType(labels, config),
  };

  if (isPR) {
    const pr = data as GitHubPullRequest;
    context.baseBranch = pr.base.ref;
    context.headBranch = pr.head.ref;
    context.draft = pr.draft;
    context.merged = pr.merged;
    context.additions = pr.additions;
    context.deletions = pr.deletions;
    context.changedFiles = pr.changed_files;
  }

  return context;
}

/**
 * Auto-inject GitHub context into task metadata
 */
export async function injectGitHubContextToTask(
  taskId: string,
  token: string,
  owner: string,
  repo: string,
  issueOrPrNumber: number
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { userId: true, projectId: true, metadata: true },
  });

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const labelConfig = await getLabelMappingConfig(task.userId, task.projectId || undefined);
  const context = await fetchGitHubContext(token, owner, repo, issueOrPrNumber, labelConfig);

  // Update task with GitHub context
  const existingMetadata = (task.metadata as Record<string, unknown>) || {};

  await prisma.task.update({
    where: { id: taskId },
    data: {
      metadata: {
        ...existingMetadata,
        githubContext: context,
        lastGithubSync: new Date().toISOString(),
      },
      // Update priority and type if not manually set
      ...(existingMetadata.manualPriority ? {} : { priority: context.mappedPriority }),
      ...(existingMetadata.manualType ? {} : { type: context.mappedType }),
    },
  });
}

// ============================================================================
// GitHub Status Fetching
// ============================================================================

/**
 * Fetch comprehensive GitHub status for a PR
 */
export async function fetchGitHubStatus(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubStatus> {
  // Fetch PR details
  const pr = await ghApi<GitHubPullRequest>(
    token,
    `/repos/${owner}/${repo}/pulls/${prNumber}`
  );

  // Fetch check runs for the head commit
  const checks = await ghApi<{ check_runs: GitHubCheckRun[] }>(
    token,
    `/repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs`
  );

  // Fetch reviews
  const reviews = await ghApi<GitHubReview[]>(
    token,
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`
  );

  // Determine overall CI status
  let ciStatus: GitHubStatus["ci"]["status"] = "pending";
  const checkRuns = checks.check_runs;

  if (checkRuns.length > 0) {
    const allCompleted = checkRuns.every((c) => c.status === "completed");
    const anyFailed = checkRuns.some(
      (c) => c.conclusion === "failure" || c.conclusion === "timed_out"
    );
    const allPassed = checkRuns.every(
      (c) => c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral"
    );

    if (anyFailed) {
      ciStatus = "failure";
    } else if (allCompleted && allPassed) {
      ciStatus = "success";
    } else if (allCompleted) {
      ciStatus = "neutral";
    }
  }

  // Determine review status
  let reviewStatus: GitHubStatus["reviews"]["status"] = "pending";

  // Get the latest review from each reviewer
  const latestReviews = new Map<string, GitHubReview>();
  for (const review of reviews) {
    if (review.state !== "PENDING") {
      const existing = latestReviews.get(review.user.login);
      if (!existing || new Date(review.submitted_at) > new Date(existing.submitted_at)) {
        latestReviews.set(review.user.login, review);
      }
    }
  }

  const reviewStates = Array.from(latestReviews.values()).map((r) => r.state);

  if (reviewStates.includes("CHANGES_REQUESTED")) {
    reviewStatus = "changes_requested";
  } else if (reviewStates.includes("APPROVED") && !reviewStates.includes("CHANGES_REQUESTED")) {
    reviewStatus = "approved";
  } else if (reviewStates.length > 0) {
    reviewStatus = "commented";
  }

  return {
    ci: {
      status: ciStatus,
      checks: checkRuns.map((c) => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion,
        url: c.html_url,
      })),
    },
    reviews: {
      status: reviewStatus,
      reviewers: Array.from(latestReviews.values()).map((r) => ({
        login: r.user.login,
        state: r.state,
        avatarUrl: r.user.avatar_url,
      })),
    },
    mergeable: pr.mergeable,
    draft: pr.draft,
    merged: pr.merged,
  };
}

/**
 * Update task with latest GitHub PR status
 */
export async function syncGitHubStatusToTask(
  taskId: string,
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubStatus> {
  const status = await fetchGitHubStatus(token, owner, repo, prNumber);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { metadata: true },
  });

  const existingMetadata = (task?.metadata as Record<string, unknown>) || {};

  await prisma.task.update({
    where: { id: taskId },
    data: {
      metadata: {
        ...existingMetadata,
        githubStatus: status,
        lastStatusSync: new Date().toISOString(),
      },
      pullRequestStatus: status.merged
        ? "merged"
        : status.reviews.status === "approved" && status.ci.status === "success"
        ? "ready"
        : status.reviews.status === "changes_requested"
        ? "changes_requested"
        : status.ci.status === "failure"
        ? "checks_failing"
        : "pending",
    },
  });

  return status;
}

// ============================================================================
// PR Review Comment Syncing
// ============================================================================

/**
 * Fetch PR review comments from GitHub
 */
export async function fetchPRReviewComments(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<TaskComment[]> {
  // Fetch review comments (inline code comments)
  const reviewComments = await ghApi<GitHubReviewComment[]>(
    token,
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments`
  );

  // Fetch PR reviews (top-level review comments)
  const reviews = await ghApi<GitHubReview[]>(
    token,
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`
  );

  const comments: TaskComment[] = [];

  // Map review comments
  for (const comment of reviewComments) {
    comments.push({
      id: `gh-review-comment-${comment.id}`,
      author: comment.user.login,
      authorAvatarUrl: comment.user.avatar_url,
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      source: "github_review",
      sourceUrl: comment.html_url,
      filePath: comment.path,
      lineNumber: comment.line || comment.original_line || undefined,
      diffHunk: comment.diff_hunk,
      inReplyToId: comment.in_reply_to_id
        ? `gh-review-comment-${comment.in_reply_to_id}`
        : undefined,
    });
  }

  // Map top-level review comments
  for (const review of reviews) {
    if (review.body && review.body.trim()) {
      comments.push({
        id: `gh-review-${review.id}`,
        author: review.user.login,
        authorAvatarUrl: review.user.avatar_url,
        body: `**${review.state.replace("_", " ")}**\n\n${review.body}`,
        createdAt: review.submitted_at,
        updatedAt: review.submitted_at,
        source: "github_review",
        sourceUrl: review.html_url,
      });
    }
  }

  // Sort by creation date
  comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return comments;
}

/**
 * Sync PR review comments to task comments/metadata
 */
export async function syncPRCommentsToTask(
  taskId: string,
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<TaskComment[]> {
  const comments = await fetchPRReviewComments(token, owner, repo, prNumber);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { metadata: true },
  });

  const existingMetadata = (task?.metadata as Record<string, unknown>) || {};

  await prisma.task.update({
    where: { id: taskId },
    data: {
      metadata: {
        ...existingMetadata,
        githubComments: comments,
        lastCommentsSync: new Date().toISOString(),
      },
    },
  });

  return comments;
}

// ============================================================================
// Webhook Payload Processing
// ============================================================================

export interface WebhookPayload {
  action: string;
  repository: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
  issue?: GitHubIssue;
  pull_request?: GitHubPullRequest;
  review?: GitHubReview;
  comment?: GitHubReviewComment;
  check_run?: GitHubCheckRun;
  sender: { login: string };
}

/**
 * Process GitHub webhook events
 */
export async function processGitHubWebhook(
  eventType: string,
  payload: WebhookPayload
): Promise<{ processed: boolean; action?: string; error?: string }> {
  const { action, repository } = payload;
  const repoFullName = repository.full_name;

  console.log(`Processing GitHub webhook: ${eventType}.${action} for ${repoFullName}`);

  try {
    switch (eventType) {
      case "issues": {
        if (!payload.issue) break;
        return await handleIssueEvent(action, repoFullName, payload.issue);
      }

      case "pull_request": {
        if (!payload.pull_request) break;
        return await handlePullRequestEvent(action, repoFullName, payload.pull_request);
      }

      case "pull_request_review": {
        if (!payload.review || !payload.pull_request) break;
        return await handleReviewEvent(action, repoFullName, payload.pull_request.number, payload.review);
      }

      case "pull_request_review_comment": {
        if (!payload.comment || !payload.pull_request) break;
        return await handleReviewCommentEvent(
          action,
          repoFullName,
          payload.pull_request.number,
          payload.comment
        );
      }

      case "check_run": {
        if (!payload.check_run) break;
        return await handleCheckRunEvent(action, repoFullName, payload.check_run);
      }

      default:
        return { processed: false, action: `unknown_event_${eventType}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Webhook processing error: ${message}`);
    return { processed: false, error: message };
  }

  return { processed: false, action: "no_handler" };
}

async function handleIssueEvent(
  action: string,
  repoFullName: string,
  issue: GitHubIssue
): Promise<{ processed: boolean; action: string }> {
  // Find tasks linked to this issue
  const tasks = await findTasksForGitHubItem(repoFullName, issue.number, "issue");

  if (tasks.length === 0) {
    return { processed: false, action: "no_linked_tasks" };
  }

  const labels = issue.labels.map((l) => l.name);

  for (const task of tasks) {
    const labelConfig = await getLabelMappingConfig(task.userId, task.projectId || undefined);
    const mappedPriority = mapLabelsToPriority(labels, labelConfig);
    const mappedType = mapLabelsToType(labels, labelConfig);

    const existingMetadata = (task.metadata as Record<string, unknown>) || {};

    await prisma.task.update({
      where: { id: task.id },
      data: {
        metadata: {
          ...existingMetadata,
          githubContext: {
            type: "issue",
            number: issue.number,
            title: issue.title,
            body: issue.body,
            labels,
            assignees: issue.assignees.map((a) => a.login),
            state: issue.state,
            url: issue.html_url,
            author: issue.user.login,
            createdAt: issue.created_at,
            updatedAt: issue.updated_at,
            mappedPriority,
            mappedType,
          },
          lastGithubSync: new Date().toISOString(),
        },
        ...(existingMetadata.manualPriority ? {} : { priority: mappedPriority }),
        ...(existingMetadata.manualType ? {} : { type: mappedType }),
      },
    });
  }

  return { processed: true, action: `issue_${action}_synced` };
}

async function handlePullRequestEvent(
  action: string,
  repoFullName: string,
  pr: GitHubPullRequest
): Promise<{ processed: boolean; action: string }> {
  // Find tasks linked to this PR (either by PR number or by PR URL in pullRequestUrl)
  const tasks = await findTasksForPullRequest(repoFullName, pr.number, pr.html_url);

  if (tasks.length === 0) {
    return { processed: false, action: "no_linked_tasks" };
  }

  const labels = pr.labels.map((l) => l.name);

  for (const task of tasks) {
    const labelConfig = await getLabelMappingConfig(task.userId, task.projectId || undefined);
    const existingMetadata = (task.metadata as Record<string, unknown>) || {};

    // Determine PR status
    let prStatus = "open";
    if (pr.merged) {
      prStatus = "merged";
    } else if (pr.state === "closed") {
      prStatus = "closed";
    } else if (pr.draft) {
      prStatus = "draft";
    }

    await prisma.task.update({
      where: { id: task.id },
      data: {
        pullRequestUrl: pr.html_url,
        pullRequestStatus: prStatus,
        metadata: {
          ...existingMetadata,
          githubContext: {
            type: "pull_request",
            number: pr.number,
            title: pr.title,
            body: pr.body,
            labels,
            assignees: pr.assignees.map((a) => a.login),
            state: pr.state,
            url: pr.html_url,
            author: pr.user.login,
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            baseBranch: pr.base.ref,
            headBranch: pr.head.ref,
            draft: pr.draft,
            merged: pr.merged,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            mappedPriority: mapLabelsToPriority(labels, labelConfig),
            mappedType: mapLabelsToType(labels, labelConfig),
          },
          lastGithubSync: new Date().toISOString(),
        },
      },
    });

    // Update task status based on PR state
    if (pr.merged && task.status !== "completed") {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: "completed",
          completedAt: pr.merged_at ? new Date(pr.merged_at) : new Date(),
        },
      });
    }
  }

  return { processed: true, action: `pr_${action}_synced` };
}

async function handleReviewEvent(
  action: string,
  repoFullName: string,
  prNumber: number,
  review: GitHubReview
): Promise<{ processed: boolean; action: string }> {
  const tasks = await findTasksForGitHubItem(repoFullName, prNumber, "pull_request");

  if (tasks.length === 0) {
    return { processed: false, action: "no_linked_tasks" };
  }

  for (const task of tasks) {
    const existingMetadata = (task.metadata as Record<string, unknown>) || {};
    const existingComments = (existingMetadata.githubComments as TaskComment[]) || [];

    // Add or update the review comment
    const newComment: TaskComment = {
      id: `gh-review-${review.id}`,
      author: review.user.login,
      authorAvatarUrl: review.user.avatar_url,
      body: review.body
        ? `**${review.state.replace("_", " ")}**\n\n${review.body}`
        : `**${review.state.replace("_", " ")}**`,
      createdAt: review.submitted_at,
      updatedAt: review.submitted_at,
      source: "github_review",
      sourceUrl: review.html_url,
    };

    const updatedComments = [
      ...existingComments.filter((c) => c.id !== newComment.id),
      newComment,
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Determine new PR status based on review
    let newPrStatus = task.pullRequestStatus;
    if (review.state === "APPROVED") {
      newPrStatus = "approved";
    } else if (review.state === "CHANGES_REQUESTED") {
      newPrStatus = "changes_requested";
    }

    await prisma.task.update({
      where: { id: task.id },
      data: {
        pullRequestStatus: newPrStatus,
        metadata: {
          ...existingMetadata,
          githubComments: updatedComments,
          lastCommentsSync: new Date().toISOString(),
          latestReview: {
            state: review.state,
            reviewer: review.user.login,
            submittedAt: review.submitted_at,
          },
        },
      },
    });
  }

  return { processed: true, action: `review_${action}_synced` };
}

async function handleReviewCommentEvent(
  action: string,
  repoFullName: string,
  prNumber: number,
  comment: GitHubReviewComment
): Promise<{ processed: boolean; action: string }> {
  const tasks = await findTasksForGitHubItem(repoFullName, prNumber, "pull_request");

  if (tasks.length === 0) {
    return { processed: false, action: "no_linked_tasks" };
  }

  for (const task of tasks) {
    const existingMetadata = (task.metadata as Record<string, unknown>) || {};
    const existingComments = (existingMetadata.githubComments as TaskComment[]) || [];

    if (action === "deleted") {
      // Remove the comment
      const updatedComments = existingComments.filter(
        (c) => c.id !== `gh-review-comment-${comment.id}`
      );

      await prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: {
            ...existingMetadata,
            githubComments: updatedComments,
            lastCommentsSync: new Date().toISOString(),
          },
        },
      });
    } else {
      // Add or update the comment
      const newComment: TaskComment = {
        id: `gh-review-comment-${comment.id}`,
        author: comment.user.login,
        authorAvatarUrl: comment.user.avatar_url,
        body: comment.body,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        source: "github_review",
        sourceUrl: comment.html_url,
        filePath: comment.path,
        lineNumber: comment.line || comment.original_line || undefined,
        diffHunk: comment.diff_hunk,
        inReplyToId: comment.in_reply_to_id
          ? `gh-review-comment-${comment.in_reply_to_id}`
          : undefined,
      };

      const updatedComments = [
        ...existingComments.filter((c) => c.id !== newComment.id),
        newComment,
      ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      await prisma.task.update({
        where: { id: task.id },
        data: {
          metadata: {
            ...existingMetadata,
            githubComments: updatedComments,
            lastCommentsSync: new Date().toISOString(),
          },
        },
      });
    }
  }

  return { processed: true, action: `review_comment_${action}_synced` };
}

async function handleCheckRunEvent(
  action: string,
  repoFullName: string,
  checkRun: GitHubCheckRun
): Promise<{ processed: boolean; action: string }> {
  // Check runs don't have PR number directly, we need to find tasks by repo
  // In a production system, you'd want to get the PR from check_suite
  // For now, we'll skip this as it requires additional API calls

  if (action !== "completed") {
    return { processed: false, action: "check_run_not_completed" };
  }

  // This would need the PR number from the check_suite
  // For webhook handling, GitHub sends check_suite events that include PRs
  return { processed: false, action: "check_run_needs_pr_context" };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function findTasksForGitHubItem(
  repoFullName: string,
  itemNumber: number,
  itemType: "issue" | "pull_request"
): Promise<Array<{ id: string; userId: string; projectId: string | null; metadata: unknown; pullRequestStatus: string | null; status: string }>> {
  // Find repository
  const repo = await prisma.repository.findFirst({
    where: { fullName: repoFullName },
    select: { id: true },
  });

  if (!repo) {
    return [];
  }

  // Find tasks linked via TaskExternalLink
  const externalLinks = await prisma.taskExternalLink.findMany({
    where: {
      externalItemId: String(itemNumber),
      externalItemType: itemType,
      task: {
        repositoryId: repo.id,
      },
    },
    include: {
      task: {
        select: {
          id: true,
          userId: true,
          projectId: true,
          metadata: true,
          pullRequestStatus: true,
          status: true,
        },
      },
    },
  });

  return externalLinks.map((link) => link.task);
}

async function findTasksForPullRequest(
  repoFullName: string,
  prNumber: number,
  prUrl: string
): Promise<Array<{ id: string; userId: string; projectId: string | null; metadata: unknown; pullRequestStatus: string | null; status: string }>> {
  // Find repository
  const repo = await prisma.repository.findFirst({
    where: { fullName: repoFullName },
    select: { id: true },
  });

  if (!repo) {
    return [];
  }

  // Find tasks by PR URL or external link
  const tasks = await prisma.task.findMany({
    where: {
      repositoryId: repo.id,
      OR: [
        { pullRequestUrl: prUrl },
        {
          externalLink: {
            externalItemId: String(prNumber),
            externalItemType: "pull_request",
          },
        },
      ],
    },
    select: {
      id: true,
      userId: true,
      projectId: true,
      metadata: true,
      pullRequestStatus: true,
      status: true,
    },
  });

  return tasks;
}

// ============================================================================
// Export Service Object
// ============================================================================

export const githubSyncService = {
  // Configuration
  getLabelMappingConfig,
  DEFAULT_LABEL_MAPPING,

  // Label mapping
  mapLabelsToPriority,
  mapLabelsToType,

  // Context fetching
  fetchGitHubContext,
  injectGitHubContextToTask,

  // Status tracking
  fetchGitHubStatus,
  syncGitHubStatusToTask,

  // Comment syncing
  fetchPRReviewComments,
  syncPRCommentsToTask,

  // Webhook processing
  processGitHubWebhook,
};

export default githubSyncService;
