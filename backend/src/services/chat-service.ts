/**
 * AI Assistant Chat Service
 *
 * Uses Claude Agent SDK with createSdkMcpServer for MCP tool integration.
 * Features:
 * - Streaming responses with native MCP tool support
 * - Conversation persistence
 * - Context-aware scoping (global, project, repository)
 * - Artifact extraction and management
 * - Voice input metadata tracking
 * - OAuth token support (Claude Max subscription)
 *
 * TODO: Migrate to ACP (Agent Client Protocol) once a standalone MCP server
 * is implemented. The chat service requires in-process MCP tools (list_repositories,
 * create_task, etc.) which the Claude Agent SDK provides via createSdkMcpServer.
 * ACP's newSession() supports external MCP servers via stdio/http, so the migration
 * path is: (1) extract MCP tools into a standalone server, (2) replace this
 * query()+createSdkMcpServer usage with acpQuery()+mcpServers in newSession.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- Claude Agent SDK still needed for chat MCP tools until standalone MCP server is built
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { prisma } from "../db.js";
import { estimateCost } from "@autosoftware/shared";
import { recordUsage } from "./claude-query.js";
import {
  executeTool,
  type ToolCall,
  addPendingArtifact,
  setUserConversationContext,
  clearPendingArtifacts,
} from "./mcp-tools.js";
import { recordAIFeedback } from "./ai-metrics.js";
import type { ConversationContextType, ChatMessageRole, ChatArtifactType } from "../../../generated/prisma/enums.js";

// ============================================================================
// Types
// ============================================================================

export interface ThinkingStep {
  text?: string;
  toolCall?: ToolCall;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCall[];
  thinking?: ThinkingStep[];
  attachments?: Attachment[];
  voiceInput?: boolean;
  voiceDuration?: number;
}

export interface Attachment {
  id: string;
  type: "image" | "file" | "code";
  name: string;
  url?: string;
  content?: string;
  size?: number;
  mimeType?: string;
}

export interface Artifact {
  type: ChatArtifactType;
  name: string;
  content: string;
  language?: string;
}

export interface ActionButton {
  id: string;
  label: string;
  action: string;
  variant?: string;
  data?: Record<string, unknown>;
}

export interface StreamChunk {
  type: "text" | "thinking" | "intermediate" | "tool_start" | "tool_end" | "artifact" | "actions" | "done" | "error";
  text?: string;
  toolCall?: Partial<ToolCall>;
  artifact?: Artifact;
  actions?: ActionButton[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  messageId?: string;
  error?: string;
}

export interface ChatContext {
  contextType: ConversationContextType;
  contextId?: string;
  projectName?: string;
  repositoryName?: string;
  recentTasks?: Array<{ id: string; title: string; status: string }>;
  recentScans?: Array<{ id: string; summary: string; status: string }>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_CONVERSATION_MESSAGES = 50;

// ============================================================================
// MCP Server Creation using Agent SDK
// ============================================================================

/**
 * Create MCP tools for a specific user using the Agent SDK's tool() function.
 */
function createMcpTools(userId: string) {
  // Helper to create tool result
  const makeResult = (result: { error?: string; output?: unknown }) => ({
    content: [{
      type: "text" as const,
      text: result.error ? `Error: ${result.error}` : JSON.stringify(result.output, null, 2),
    }],
  });

  return [
    // Repository tools
    tool(
      "list_repositories",
      "List all repositories connected by the user",
      {
        status: z.enum(["idle", "scanning", "error"]).optional().describe("Filter by repository status"),
        limit: z.number().optional().describe("Max results to return"),
      },
      async (args) => makeResult(await executeTool("list_repositories", args, userId))
    ),
    tool(
      "get_repository",
      "Get details about a specific repository",
      {
        repositoryId: z.string().describe("Repository ID"),
      },
      async (args) => makeResult(await executeTool("get_repository", args, userId))
    ),
    tool(
      "get_repository_tree",
      "List files and directories in a repository path",
      {
        repositoryId: z.string().describe("Repository ID"),
        path: z.string().optional().describe("Directory path (empty for root)"),
      },
      async (args) => makeResult(await executeTool("get_repository_tree", args, userId))
    ),
    tool(
      "get_file_content",
      "Read the content of a file in a repository",
      {
        repositoryId: z.string().describe("Repository ID"),
        path: z.string().describe("File path"),
      },
      async (args) => makeResult(await executeTool("get_file_content", args, userId))
    ),
    tool(
      "trigger_scan",
      "Trigger a new scan for a repository",
      {
        repositoryId: z.string().describe("Repository ID"),
        branch: z.string().optional().describe("Branch to scan (defaults to repo default)"),
      },
      async (args) => makeResult(await executeTool("trigger_scan", args, userId))
    ),

    // Task tools
    tool(
      "list_tasks",
      "List tasks with optional filters",
      {
        repositoryId: z.string().optional().describe("Filter by repository"),
        projectId: z.string().optional().describe("Filter by project"),
        status: z.enum(["planning", "awaiting_input", "planned", "pending", "in_progress", "completed", "failed", "cancelled"]).optional().describe("Filter by status"),
        type: z.enum(["improvement", "bugfix", "feature", "refactor", "security"]).optional().describe("Filter by task type"),
        limit: z.number().optional().describe("Max results (default 20)"),
      },
      async (args) => makeResult(await executeTool("list_tasks", args, userId))
    ),
    tool(
      "get_task",
      "Get detailed information about a specific task",
      {
        taskId: z.string().describe("Task ID"),
      },
      async (args) => makeResult(await executeTool("get_task", args, userId))
    ),
    tool(
      "create_task",
      "Create a new task for a repository",
      {
        repositoryId: z.string().describe("Repository ID"),
        title: z.string().describe("Task title"),
        description: z.string().describe("Task description"),
        type: z.enum(["improvement", "bugfix", "feature", "refactor", "security"]).describe("Task type"),
        priority: z.enum(["low", "medium", "high", "critical"]).describe("Task priority"),
        projectId: z.string().optional().describe("Optional project to assign task to"),
        skipPlanning: z.boolean().optional().describe("Skip planning phase and execute immediately"),
      },
      async (args) => makeResult(await executeTool("create_task", args, userId))
    ),
    tool(
      "update_task",
      "Update a task's details",
      {
        taskId: z.string().describe("Task ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("New priority"),
      },
      async (args) => makeResult(await executeTool("update_task", args, userId))
    ),
    tool(
      "retry_task",
      "Retry a failed or cancelled task",
      {
        taskId: z.string().describe("Task ID"),
      },
      async (args) => makeResult(await executeTool("retry_task", args, userId))
    ),
    tool(
      "cancel_task",
      "Cancel an active task",
      {
        taskId: z.string().describe("Task ID"),
      },
      async (args) => makeResult(await executeTool("cancel_task", args, userId))
    ),

    // Project tools
    tool(
      "list_projects",
      "List all projects for the user",
      {
        limit: z.number().optional().describe("Max results"),
      },
      async (args) => makeResult(await executeTool("list_projects", args, userId))
    ),
    tool(
      "get_project",
      "Get detailed information about a project",
      {
        projectId: z.string().describe("Project ID"),
      },
      async (args) => makeResult(await executeTool("get_project", args, userId))
    ),
    tool(
      "get_project_stats",
      "Get statistics for a project",
      {
        projectId: z.string().describe("Project ID"),
      },
      async (args) => makeResult(await executeTool("get_project_stats", args, userId))
    ),

    // Scan tools
    tool(
      "list_scans",
      "List recent scans",
      {
        repositoryId: z.string().optional().describe("Filter by repository"),
        status: z.enum(["queued", "in_progress", "completed", "failed", "cancelled"]).optional().describe("Filter by status"),
        limit: z.number().optional().describe("Max results (default 20)"),
      },
      async (args) => makeResult(await executeTool("list_scans", args, userId))
    ),
    tool(
      "get_scan",
      "Get detailed information about a scan",
      {
        scanId: z.string().describe("Scan ID"),
      },
      async (args) => makeResult(await executeTool("get_scan", args, userId))
    ),
    tool(
      "get_scan_results",
      "Get analysis results from a completed scan",
      {
        scanId: z.string().describe("Scan ID"),
      },
      async (args) => makeResult(await executeTool("get_scan_results", args, userId))
    ),

    // Analytics tools
    tool(
      "get_analytics_overview",
      "Get an overview of key metrics: tasks, hours saved, costs, ROI",
      {
        startDate: z.string().optional().describe("Start date (ISO format)"),
        endDate: z.string().optional().describe("End date (ISO format)"),
        projectId: z.string().optional().describe("Filter by project"),
      },
      async (args) => makeResult(await executeTool("get_analytics_overview", args, userId))
    ),
    tool(
      "get_time_saved",
      "Get engineering time saved breakdown",
      {
        startDate: z.string().optional().describe("Start date (ISO format)"),
        endDate: z.string().optional().describe("End date (ISO format)"),
        groupBy: z.enum(["day", "week", "month"]).optional().describe("Grouping period"),
      },
      async (args) => makeResult(await executeTool("get_time_saved", args, userId))
    ),
    tool(
      "get_contributors",
      "Get top contributors ranked by activity",
      {
        limit: z.number().optional().describe("Max results (default 10)"),
      },
      async (args) => makeResult(await executeTool("get_contributors", args, userId))
    ),
  ];
}

/**
 * Create an MCP server with all tools for a user.
 */
function createUserMcpServer(userId: string) {
  const tools = createMcpTools(userId);
  return createSdkMcpServer({
    name: "autosoftware",
    tools,
  });
}

// ============================================================================
// System Prompts
// ============================================================================

function buildSystemPrompt(context: ChatContext): string {
  let contextInfo = "";

  if (context.contextType === "project" && context.projectName) {
    contextInfo = `\n\nCurrent Context: Project "${context.projectName}" (ID: ${context.contextId})`;
  } else if (context.contextType === "repository" && context.repositoryName) {
    contextInfo = `\n\nCurrent Context: Repository "${context.repositoryName}" (ID: ${context.contextId})`;
  }

  if (context.recentTasks?.length) {
    contextInfo += `\n\nRecent Tasks:\n${context.recentTasks
      .slice(0, 5)
      .map((t) => `- ${t.title} (${t.status})`)
      .join("\n")}`;
  }

  if (context.recentScans?.length) {
    contextInfo += `\n\nRecent Scans:\n${context.recentScans
      .slice(0, 3)
      .map((s) => `- ${s.summary || "Scan"} (${s.status})`)
      .join("\n")}`;
  }

  return `You are the AI Assistant for AutoSoftware, an intelligent code analysis and improvement platform.

## Your Capabilities

You have access to MCP tools that allow you to interact with the user's repositories, tasks, projects, and scans. Use these tools proactively to help the user.

Available tools:
- list_repositories, get_repository, get_repository_tree, get_file_content, trigger_scan
- list_tasks, get_task, create_task, update_task, retry_task, cancel_task
- list_projects, get_project, get_project_stats
- list_scans, get_scan, get_scan_results
- get_analytics_overview, get_time_saved, get_contributors

## Guidelines

1. **Be Proactive**: Use your tools to gather information before answering questions about the user's codebase
2. **Show Your Work**: When you use tools, explain what you're doing and why
3. **Create Tasks**: When the user wants to fix something or implement a feature, use the create_task tool
4. **Be Concise**: Provide clear, actionable responses
5. **Use Markdown**: Format responses with proper markdown for readability

## Artifacts

When you generate code, documentation, PRDs, or other substantial content, wrap them in artifact blocks so they can be saved and attached to tasks:

\`\`\`artifact:markdown:PRD.md
# Product Requirements Document
...
\`\`\`

\`\`\`artifact:code:example.ts
// TypeScript code here
\`\`\`

\`\`\`artifact:html:component.html
<html content here>
\`\`\`

\`\`\`artifact:react:ComponentName.tsx
<React component here>
\`\`\`

\`\`\`artifact:mermaid:diagram.mmd
flowchart LR
    A --> B
\`\`\`

**IMPORTANT**: When creating PRDs, technical specs, or documentation, ALWAYS use the artifact format above. These artifacts will be automatically attached to any tasks you create.

## Task Creation

When the user asks you to fix something or implement a feature:
1. First, gather context using list_repositories and get_repository_tree
2. Understand the scope of the change
3. Create a task with appropriate type, priority, and description
4. Inform the user that the task has been created and is being processed
${contextInfo}

Remember: You are a helpful AI assistant that can actually take actions. Don't just describe what could be done - use your tools to do it!`;
}

// ============================================================================
// Conversation Management
// ============================================================================

export async function createConversation(
  userId: string,
  contextType: ConversationContextType = "global",
  contextId?: string
): Promise<string> {
  const conversation = await prisma.conversation.create({
    data: {
      userId,
      contextType,
      contextId,
    },
  });
  return conversation.id;
}

export async function getConversation(conversationId: string, userId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: MAX_CONVERSATION_MESSAGES,
        include: {
          artifacts: true,
        },
      },
    },
  });
}

export async function listConversations(
  userId: string,
  options: {
    contextType?: ConversationContextType;
    contextId?: string;
    limit?: number;
    includeArchived?: boolean;
  } = {}
) {
  const where: any = { userId };

  if (options.contextType) {
    where.contextType = options.contextType;
  }
  if (options.contextId) {
    where.contextId = options.contextId;
  }
  if (!options.includeArchived) {
    where.archivedAt = null;
  }

  return prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: options.limit || 50,
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, role: true, createdAt: true },
      },
    },
  });
}

export async function updateConversationTitle(
  conversationId: string,
  userId: string,
  title: string
) {
  return prisma.conversation.updateMany({
    where: { id: conversationId, userId },
    data: { title },
  });
}

export async function archiveConversation(conversationId: string, userId: string) {
  return prisma.conversation.updateMany({
    where: { id: conversationId, userId },
    data: { archivedAt: new Date() },
  });
}

export async function deleteConversation(conversationId: string, userId: string) {
  return prisma.conversation.deleteMany({
    where: { id: conversationId, userId },
  });
}

// ============================================================================
// Message Management
// ============================================================================

export async function saveMessage(
  conversationId: string,
  message: {
    role: ChatMessageRole;
    content: string;
    toolCalls?: ToolCall[];
    thinking?: ThinkingStep[];
    attachments?: Attachment[];
    voiceInput?: boolean;
    voiceDuration?: number;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  }
) {
  // Update conversation title from first user message if not set
  if (message.role === "user") {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (conversation && !conversation.title) {
      const title = message.content.slice(0, 100) + (message.content.length > 100 ? "..." : "");
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title },
      });
    }
  }

  const chatMessage = await prisma.chatMessage.create({
    data: {
      conversationId,
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls ? JSON.parse(JSON.stringify(message.toolCalls)) : undefined,
      thinking: message.thinking ? JSON.parse(JSON.stringify(message.thinking)) : undefined,
      attachments: message.attachments ? JSON.parse(JSON.stringify(message.attachments)) : undefined,
      voiceInput: message.voiceInput || false,
      voiceDuration: message.voiceDuration,
      inputTokens: message.inputTokens,
      outputTokens: message.outputTokens,
      costUsd: message.costUsd,
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return chatMessage;
}

export async function saveArtifact(
  messageId: string,
  artifact: Artifact,
  taskId?: string
) {
  return prisma.chatArtifact.create({
    data: {
      messageId,
      type: artifact.type,
      name: artifact.name,
      content: artifact.content,
      language: artifact.language,
      taskId,
    },
  });
}

export async function addMessageFeedback(
  messageId: string,
  userId: string,
  feedback: "positive" | "negative",
  note?: string
) {
  // Verify ownership through conversation
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: { conversation: { select: { userId: true } } },
  });

  if (!message || message.conversation.userId !== userId) {
    throw new Error("Message not found");
  }

  // Update chat message feedback
  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { feedback, feedbackNote: note },
  });

  // Also record to AI metrics for analytics dashboard
  await recordAIFeedback(userId, {
    entityType: "chat_message",
    entityId: messageId,
    feedbackType: feedback === "positive" ? "thumbs_up" : "thumbs_down",
    comment: note,
  }).catch((err) => {
    console.error("Failed to record AI feedback:", err);
  });

  return updated;
}

// ============================================================================
// Artifact Extraction
// ============================================================================

const ARTIFACT_REGEX = /```artifact:(\w+):([^\n]+)\n([\s\S]*?)```/g;

export function extractArtifacts(content: string): { cleanContent: string; artifacts: Artifact[] } {
  const artifacts: Artifact[] = [];
  let cleanContent = content;

  let match;
  while ((match = ARTIFACT_REGEX.exec(content)) !== null) {
    const [fullMatch, type, name, artifactContent] = match;

    const artifactType = type as ChatArtifactType;
    if (["html", "react", "svg", "code", "markdown", "mermaid", "json"].includes(type)) {
      artifacts.push({
        type: artifactType,
        name: name.trim(),
        content: artifactContent.trim(),
        language: type === "code" ? inferLanguageFromName(name) : undefined,
      });
    }

    cleanContent = cleanContent.replace(fullMatch, `[Artifact: ${name.trim()}]`);
  }

  return { cleanContent, artifacts };
}

function inferLanguageFromName(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
  };
  return ext ? langMap[ext] : undefined;
}

// ============================================================================
// Context Building
// ============================================================================

export async function buildChatContext(
  userId: string,
  contextType: ConversationContextType,
  contextId?: string
): Promise<ChatContext> {
  const context: ChatContext = { contextType, contextId };

  if (contextType === "project" && contextId) {
    const project = await prisma.project.findFirst({
      where: { id: contextId, userId },
      select: { name: true },
    });
    context.projectName = project?.name;

    const tasks = await prisma.task.findMany({
      where: { projectId: contextId, userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, status: true },
    });
    context.recentTasks = tasks;
  } else if (contextType === "repository" && contextId) {
    const repo = await prisma.repository.findFirst({
      where: { id: contextId, userId },
      select: { fullName: true },
    });
    context.repositoryName = repo?.fullName;

    const [tasks, scans] = await Promise.all([
      prisma.task.findMany({
        where: { repositoryId: contextId, userId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true },
      }),
      prisma.scanResult.findMany({
        where: { repositoryId: contextId },
        orderBy: { scannedAt: "desc" },
        take: 3,
        select: { id: true, summary: true, status: true },
      }),
    ]);
    context.recentTasks = tasks;
    context.recentScans = scans.map((s) => ({
      id: s.id,
      summary: s.summary ?? "",
      status: s.status,
    }));
  } else {
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, title: true, status: true },
    });
    context.recentTasks = tasks;
  }

  return context;
}

// ============================================================================
// Streaming Chat with Agent SDK
// ============================================================================

export async function* streamChat(
  userId: string,
  conversationId: string,
  userMessage: string,
  options: {
    attachments?: Attachment[];
    voiceInput?: boolean;
    voiceDuration?: number;
    model?: string;
  } = {}
): AsyncGenerator<StreamChunk, void, unknown> {
  // Get conversation and context
  const conversation = await getConversation(conversationId, userId);
  if (!conversation) {
    yield { type: "error", error: "Conversation not found" };
    return;
  }

  // Save user message
  await saveMessage(conversationId, {
    role: "user",
    content: userMessage,
    attachments: options.attachments,
    voiceInput: options.voiceInput,
    voiceDuration: options.voiceDuration,
  });

  // Build context
  const chatContext = await buildChatContext(
    userId,
    conversation.contextType,
    conversation.contextId || undefined
  );

  // Build system prompt
  const systemPrompt = buildSystemPrompt(chatContext);

  // Build conversation history for the prompt
  let conversationHistory = "";
  for (const m of conversation.messages) {
    conversationHistory += `${m.role === "user" ? "User" : "Assistant"}: ${m.content}\n\n`;
  }

  // Add current message with attachments
  let currentContent = userMessage;
  if (options.attachments?.length) {
    const attachmentInfo = options.attachments
      .map((a) => `[Attachment: ${a.name} (${a.type})]`)
      .join("\n");
    currentContent = `${attachmentInfo}\n\n${userMessage}`;
  }

  const fullPrompt = conversationHistory
    ? `Previous conversation:\n${conversationHistory}\nUser: ${currentContent}`
    : currentContent;

  const model = options.model || DEFAULT_MODEL;
  let fullResponse = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCallsList: ToolCall[] = [];
  const artifacts: Artifact[] = [];
  let usedCreateTaskTool = false; // Track if create_task was used

  // Create MCP server for this user
  const mcpServer = createUserMcpServer(userId);

  // Build environment for the Agent SDK subprocess
  const env: Record<string, string> = {};

  // Pass OAuth token if available
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    env.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }
  // Pass API key as fallback
  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }

  // Track streaming state
  let hasStartedStreaming = false;
  let hasUsedTools = false;        // Track if any tools have been used
  let isAfterToolUse = false;      // Track if we're in the response phase after tool use
  let intermediateText = "";       // Text before tool use (thinking/intermediate)
  let finalText = "";              // Text after tool use (final response)
  let totalEmittedLength = 0;      // Total length of text we've already emitted (to handle SDK accumulated text)
  let currentToolInfo: { id: string; name: string } | null = null; // Track current tool being executed

  // Track thinking steps (for persistence)
  const thinkingSteps: ThinkingStep[] = [];
  let currentThinkingText = "";    // Accumulate text before each tool call

  // Debug logging helper - always log when DEBUG_STREAMING=true
  const DEBUG_STREAMING = process.env.DEBUG_STREAMING === "true";
  const debugLog = (msg: string, data?: unknown) => {
    if (DEBUG_STREAMING) {
      console.error(`[STREAM DEBUG] ${msg}`, data ? JSON.stringify(data).slice(0, 200) : "");
    }
  };
  debugLog("Starting chat stream", { userId, conversationId });

  // Set up conversation context for MCP tools (so create_task can attach artifacts)
  setUserConversationContext(userId, conversationId);
  // Clear any stale pending artifacts from previous conversations
  clearPendingArtifacts(conversationId);

  try {
    // Use the Agent SDK query() with MCP server
    for await (const message of query({
      prompt: fullPrompt,
      options: {
        systemPrompt,
        model,
        mcpServers: {
          autosoftware: mcpServer,
        },
        maxTurns: 10,
        env,
        pathToClaudeCodeExecutable: process.env.CLAUDE_CLI_PATH || "/opt/homebrew/bin/claude",
        // Bypass permission prompts - allow all tool calls automatically
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        // Enable streaming for real-time text output
        includePartialMessages: true,
      },
    })) {
      // Debug: log all message types
      debugLog(`SDK message type: ${message.type}`, message);

      // Handle different message types from the Agent SDK
      // See: SDKMessage union type in sdk.d.ts

      if (message.type === "result" && "result" in message) {
        // Final result - always capture for post-processing (action buttons, etc.)
        if (message.result) {
          fullResponse = message.result;
          // Only yield text if we haven't streamed content yet
          if (!hasStartedStreaming) {
            yield { type: "text", text: message.result };
          }
        }
      } else if (message.type === "system") {
        // System message (session init, etc.) - emit thinking state
        if (!hasStartedStreaming) {
          yield { type: "thinking" };
        }
      } else if (message.type === "assistant") {
        // Assistant message - could be partial or complete
        // NOTE: The Agent SDK sends accumulated text, not deltas, so we track totalEmittedLength
        const assistantMsg = message as { type: "assistant"; message: { content: Array<{ type: string; text?: string }> } };
        if (assistantMsg.message?.content) {
          for (const block of assistantMsg.message.content) {
            if (block.type === "text" && block.text) {
              // Determine chunk type based on whether tools have been used
              const chunkType = (hasUsedTools && isAfterToolUse) ? "text" : "intermediate";
              const currentFullText = block.text;

              debugLog(`Assistant text block`, {
                chunkType,
                hasUsedTools,
                isAfterToolUse,
                totalEmittedLength,
                currentLength: currentFullText.length
              });

              // Only yield new content that we haven't emitted yet
              if (currentFullText.length > totalEmittedLength) {
                const newText = currentFullText.slice(totalEmittedLength);
                hasStartedStreaming = true;

                debugLog(`Emitting ${chunkType}`, { newText: newText.slice(0, 50) });
                yield { type: chunkType, text: newText };

                // Update tracking
                totalEmittedLength = currentFullText.length;
                if (chunkType === "text") {
                  finalText += newText;
                } else {
                  intermediateText += newText;
                  currentThinkingText += newText; // Track for thinking steps
                }
                fullResponse = currentFullText;
              }
            }
          }
        }
      } else if (message.type === "stream_event") {
        // Streaming event with raw Anthropic event (these are actual deltas, not accumulated)
        const streamMsg = message as { type: "stream_event"; event: { type: string; delta?: { type: string; text?: string }; content_block?: { type: string; name?: string; id?: string }; index?: number } };
        const event = streamMsg.event;

        if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
          // Determine chunk type based on whether tools have been used
          const chunkType = (hasUsedTools && isAfterToolUse) ? "text" : "intermediate";

          hasStartedStreaming = true;
          debugLog(`Stream delta ${chunkType}`, { text: event.delta.text.slice(0, 50) });
          yield { type: chunkType, text: event.delta.text };

          // Update all tracking - stream events are deltas so add to totalEmittedLength
          totalEmittedLength += event.delta.text.length;
          if (chunkType === "text") {
            finalText += event.delta.text;
          } else {
            intermediateText += event.delta.text;
            currentThinkingText += event.delta.text; // Track for thinking steps
          }
          fullResponse += event.delta.text;
        } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          // Tool use starting - emit tool_start
          hasUsedTools = true;
          isAfterToolUse = false; // We're in tool use, not after it
          const toolId = event.content_block.id || `tool_${Date.now()}`;
          const toolName = event.content_block.name || "unknown";
          currentToolInfo = { id: toolId, name: toolName };
          debugLog("Tool use starting", { name: toolName, id: toolId });
          yield {
            type: "tool_start",
            toolCall: {
              id: toolId,
              name: toolName,
              input: {},
            },
          };
        } else if (event.type === "message_start") {
          // Message starting - this could indicate a new response after tool completion
          debugLog("Message start", { hasUsedTools, isAfterToolUse, currentToolInfo });

          // If we had started tool use but haven't marked completion, the tool is now done
          // (Agent SDK sends message_start for the response after tool execution)
          if (hasUsedTools && !isAfterToolUse && currentToolInfo) {
            isAfterToolUse = true;
            debugLog("Tool implicitly completed - new message starting after tool use", { toolName: currentToolInfo.name });

            // Track if create_task tool was used (including MCP prefix)
            if (currentToolInfo.name.includes("create_task")) {
              usedCreateTaskTool = true;
              debugLog("create_task tool was used", { toolName: currentToolInfo.name });
            }

            // Emit tool_end for the pending tool call
            const toolCall: ToolCall = {
              id: currentToolInfo.id,
              name: currentToolInfo.name,
              input: {},
              output: { status: "completed" },
              duration: 0,
            };
            toolCallsList.push(toolCall);

            // Save thinking step with accumulated text and tool call
            if (currentThinkingText.trim()) {
              thinkingSteps.push({ text: currentThinkingText.trim() });
            }
            thinkingSteps.push({ toolCall });
            currentThinkingText = ""; // Reset for next segment

            yield {
              type: "tool_end",
              toolCall,
            };
            currentToolInfo = null; // Clear the current tool
            // Don't emit thinking - we're now in the final response phase after tool use
          } else if (!hasUsedTools) {
            // Only emit thinking state if we haven't used any tools yet
            yield { type: "thinking" };
          }
        }
      } else if (message.type === "tool_progress") {
        // Tool progress message - show what tool is running
        hasUsedTools = true;
        const toolMsg = message as { type: "tool_progress"; tool_name?: string; tool_input?: Record<string, unknown> };
        yield {
          type: "tool_start",
          toolCall: {
            name: toolMsg.tool_name || "unknown",
            input: toolMsg.tool_input || {},
          },
        };
      } else if (message.type === "tool_use_summary") {
        // Tool use completed - mark that we're now after tool use
        isAfterToolUse = true;
        const summaryMsg = message as { type: "tool_use_summary"; tool_name?: string; tool_use_id?: string; output?: unknown };
        const toolCall: ToolCall = {
          id: summaryMsg.tool_use_id || `tool_${Date.now()}`,
          name: summaryMsg.tool_name || "unknown",
          input: {},
          output: summaryMsg.output,
          duration: 0,
        };
        toolCallsList.push(toolCall);

        // Save thinking step with accumulated text and tool call
        if (currentThinkingText.trim()) {
          thinkingSteps.push({ text: currentThinkingText.trim() });
        }
        thinkingSteps.push({ toolCall });
        currentThinkingText = ""; // Reset for next segment

        debugLog("Tool use complete", { name: toolCall.name, isAfterToolUse: true });
        yield {
          type: "tool_end",
          toolCall,
        };

        // Check if this was a task creation - emit action buttons
        if (summaryMsg.tool_name === "create_task" && summaryMsg.output) {
          // The output is in MCP format: { content: [{ type: "text", text: JSON.stringify(data) }] }
          // We need to parse it to extract the actual task data
          let taskData: { id?: string; status?: string } | null = null;

          try {
            const mcpOutput = summaryMsg.output as { content?: Array<{ type: string; text?: string }> };
            if (mcpOutput.content && mcpOutput.content.length > 0 && mcpOutput.content[0].text) {
              const textContent = mcpOutput.content[0].text;
              // Check if it's an error message
              if (!textContent.startsWith("Error:")) {
                taskData = JSON.parse(textContent);
              }
            }
          } catch (e) {
            debugLog("Failed to parse task creation output", { error: e, output: summaryMsg.output });
          }

          if (taskData && taskData.id) {
            const taskId = taskData.id;
            const status = taskData.status || "planning";

            // Emit interactive action buttons based on task status
            const actions = [];

            if (status === "planning" || status === "pending" || status === "planned") {
              actions.push(
                {
                  id: `start-${taskId}`,
                  label: "▶️ Start Task Now",
                  action: "start_task",
                  variant: "primary",
                  data: { taskId },
                },
                {
                  id: `view-${taskId}`,
                  label: "👁️ View Task",
                  action: "view_task",
                  variant: "secondary",
                  data: { taskId },
                }
              );
            } else {
              actions.push({
                id: `view-${taskId}`,
                label: "👁️ View Task",
                action: "view_task",
                variant: "primary",
                data: { taskId },
              });
            }

            yield { type: "actions", actions };
            debugLog("Emitted action buttons for task", { taskId, status });
          }
        }
        // NOTE: Do NOT reset totalEmittedLength - it tracks global position in SDK's accumulated text
        // Only reset phase-specific accumulators for tracking purposes
        // Now any new text will be emitted as "text" type (final response)
      }
    }

    // Extract artifacts from response
    // When tools are used, content should only be the final response (text after tool use)
    // When no tools are used, content is the full response
    const contentToSave = hasUsedTools ? finalText : fullResponse;
    const { cleanContent, artifacts: extractedArtifacts } = extractArtifacts(contentToSave);
    artifacts.push(...extractedArtifacts);

    // Emit artifacts
    for (const artifact of artifacts) {
      yield { type: "artifact", artifact };
    }

    // Emit action buttons if create_task was used
    debugLog("Post-streaming action button check", { usedCreateTaskTool, responseLength: fullResponse.length });

    // Track created task IDs for artifact attachment
    const createdTaskIds: string[] = [];

    if (usedCreateTaskTool && fullResponse) {
      // Parse the response to find task IDs
      // Task IDs in this system are CUID format like "cmmnnk1w8000a6ncdfhjkgggo"
      // Handle various formats: "Task ID: xxx", "**Task ID**: `xxx`", etc.
      const taskIdPattern = /\*?\*?Task\s*ID\*?\*?[:\s]*[`"]?([a-z0-9]{25})[`"]?/gi;
      const matches = [...fullResponse.matchAll(taskIdPattern)];
      const hasTaskIdText = fullResponse.toLowerCase().includes("task id");
      const taskIdIndex = fullResponse.toLowerCase().indexOf("task id");
      debugLog("Task ID regex matches", {
        matchCount: matches.length,
        firstMatch: matches[0]?.[1],
        hasTaskIdText,
        taskIdContext: taskIdIndex >= 0 ? fullResponse.substring(Math.max(0, taskIdIndex - 10), taskIdIndex + 60) : null,
        responseLength: fullResponse.length
      });

      if (matches.length > 0) {
        const emittedTaskIds = new Set<string>();

        for (const match of matches) {
          const taskId = match[1];
          if (emittedTaskIds.has(taskId)) continue;
          emittedTaskIds.add(taskId);
          createdTaskIds.push(taskId);

          // Determine status from response (look for status indicators)
          const isPending = fullResponse.toLowerCase().includes("pending") ||
                           fullResponse.toLowerCase().includes("planning") ||
                           fullResponse.toLowerCase().includes("ready for execution");

          const actions = [];
          if (isPending) {
            actions.push(
              {
                id: `start-${taskId}`,
                label: "▶️ Start Task Now",
                action: "start_task",
                variant: "primary",
                data: { taskId },
              },
              {
                id: `view-${taskId}`,
                label: "👁️ View Task",
                action: "view_task",
                variant: "secondary",
                data: { taskId },
              }
            );
          } else {
            actions.push({
              id: `view-${taskId}`,
              label: "👁️ View Task",
              action: "view_task",
              variant: "primary",
              data: { taskId },
            });
          }

          yield { type: "actions", actions };
          debugLog("Emitted action buttons for detected task", { taskId, isPending });
        }
      }
    }

    // Attach any extracted artifacts to tasks created in this message
    // Also extract artifacts from the FULL response (including intermediate text with artifacts)
    if (createdTaskIds.length > 0 && artifacts.length > 0) {
      debugLog("Attaching artifacts to created tasks", {
        taskCount: createdTaskIds.length,
        artifactCount: artifacts.length
      });

      // Attach each artifact to the first created task (primary task)
      const primaryTaskId = createdTaskIds[0];
      for (const artifact of artifacts) {
        try {
          // Check if this artifact was already saved (might have been created by MCP tool)
          const existing = await prisma.chatArtifact.findFirst({
            where: {
              taskId: primaryTaskId,
              name: artifact.name,
            },
          });

          if (!existing) {
            await prisma.chatArtifact.create({
              data: {
                messageId: null, // Task-only artifact, no message association
                type: artifact.type,
                name: artifact.name,
                content: artifact.content,
                language: artifact.language,
                taskId: primaryTaskId,
              },
            });
            debugLog("Attached artifact to task", { artifactName: artifact.name, taskId: primaryTaskId });
          }
        } catch (err) {
          console.error("Failed to attach artifact to task:", err);
        }
      }
    }

    // Also extract artifacts from intermediateText (thinking/tool-use phase) where PRDs etc. are often generated
    if (createdTaskIds.length > 0 && intermediateText) {
      const { artifacts: intermediateArtifacts } = extractArtifacts(intermediateText);
      if (intermediateArtifacts.length > 0) {
        debugLog("Found artifacts in intermediate text", { count: intermediateArtifacts.length });
        const primaryTaskId = createdTaskIds[0];
        for (const artifact of intermediateArtifacts) {
          try {
            const existing = await prisma.chatArtifact.findFirst({
              where: {
                taskId: primaryTaskId,
                name: artifact.name,
              },
            });

            if (!existing) {
              await prisma.chatArtifact.create({
                data: {
                  messageId: null, // Task-only artifact, no message association
                  type: artifact.type,
                  name: artifact.name,
                  content: artifact.content,
                  language: artifact.language,
                  taskId: primaryTaskId,
                },
              });
              // Also add to the artifacts array for saving with the message
              artifacts.push(artifact);
              debugLog("Attached intermediate artifact to task", { artifactName: artifact.name, taskId: primaryTaskId });
            }
          } catch (err) {
            console.error("Failed to attach intermediate artifact to task:", err);
          }
        }
      }
    }

    // Estimate tokens (Agent SDK doesn't provide exact counts)
    inputTokens = Math.ceil((systemPrompt.length + fullPrompt.length) / 4);
    outputTokens = Math.ceil(fullResponse.length / 4);

    // Calculate cost
    const costUsd = estimateCost(model, inputTokens, outputTokens);

    // Save assistant message (include thinking steps if any tools were used)
    const assistantMessage = await saveMessage(conversationId, {
      role: "assistant",
      content: cleanContent,
      toolCalls: toolCallsList.length > 0 ? toolCallsList : undefined,
      thinking: thinkingSteps.length > 0 ? thinkingSteps : undefined,
      inputTokens,
      outputTokens,
      costUsd,
    });

    // Save artifacts
    for (const artifact of artifacts) {
      await saveArtifact(assistantMessage.id, artifact);
    }

    // Record usage
    await recordUsage({
      userId,
      apiKeyId: null,
      authType: "oauth",
      model,
      inputTokens,
      outputTokens,
      costUsd,
      source: "chat",
      sourceId: conversationId,
      repositoryId: conversation.contextType === "repository" ? conversation.contextId || undefined : undefined,
      projectId: conversation.contextType === "project" ? conversation.contextId || undefined : undefined,
      metadata: {
        conversationTitle: conversation.title,
        messageCount: conversation.messages.length,
        toolCallCount: toolCallsList.length,
      },
    });

    // Emit done with message ID
    yield {
      type: "done",
      messageId: assistantMessage.id,
      usage: {
        inputTokens,
        outputTokens,
        costUsd,
      },
    };
  } catch (err: any) {
    console.error("Chat service error:", err.message);
    if (err.stack) {
      console.error("Stack trace:", err.stack.split("\n").slice(0, 5).join("\n"));
    }

    let errorMessage = err.message || "Chat failed";
    if (errorMessage.includes("authentication") || errorMessage.includes("401")) {
      errorMessage = "AI service authentication failed. Please ensure CLAUDE_CODE_OAUTH_TOKEN is set.";
    } else if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
      errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
    } else if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("fetch failed")) {
      errorMessage = "Could not connect to AI service. Please check your network connection.";
    } else if (errorMessage.includes("spawn") || errorMessage.includes("ENOENT")) {
      errorMessage = "Agent SDK requires Claude Code CLI. Please ensure 'claude' is installed and in PATH.";
    }
    yield { type: "error", error: errorMessage };
  }
}

// ============================================================================
// Non-Streaming Chat (for simple queries)
// ============================================================================

export async function simpleChat(
  userId: string,
  conversationId: string,
  userMessage: string,
  options: {
    attachments?: Attachment[];
    model?: string;
  } = {}
): Promise<{
  content: string;
  toolCalls: ToolCall[];
  artifacts: Artifact[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}> {
  let content = "";
  const collectedToolCalls: ToolCall[] = [];
  const collectedArtifacts: Artifact[] = [];
  let usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  for await (const chunk of streamChat(userId, conversationId, userMessage, options)) {
    if (chunk.type === "text" && chunk.text) {
      content += chunk.text;
    }
    if (chunk.type === "tool_end" && chunk.toolCall) {
      collectedToolCalls.push(chunk.toolCall as ToolCall);
    }
    if (chunk.type === "artifact" && chunk.artifact) {
      collectedArtifacts.push(chunk.artifact);
    }
    if (chunk.type === "done" && chunk.usage) {
      usage = chunk.usage;
    }
    if (chunk.type === "error") {
      throw new Error(chunk.error);
    }
  }

  return { content, toolCalls: collectedToolCalls, artifacts: collectedArtifacts, usage };
}

// ============================================================================
// Task Creation from Chat
// ============================================================================

export async function createTaskFromChat(
  userId: string,
  messageId: string,
  taskData: {
    repositoryId: string;
    title: string;
    description: string;
    type: "improvement" | "bugfix" | "feature" | "refactor" | "security";
    priority: "low" | "medium" | "high" | "critical";
    attachArtifacts?: boolean;
  }
) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: {
      conversation: { select: { userId: true } },
      artifacts: true,
    },
  });

  if (!message || message.conversation.userId !== userId) {
    throw new Error("Message not found");
  }

  const { schedulerService } = await import("./scheduler.js");

  const task = await prisma.task.create({
    data: {
      repositoryId: taskData.repositoryId,
      userId,
      title: taskData.title,
      description: taskData.description,
      type: taskData.type,
      priority: taskData.priority,
      source: "manual",
      status: "planning",
    },
  });

  if (taskData.attachArtifacts && message.artifacts.length > 0) {
    await prisma.chatArtifact.updateMany({
      where: { messageId },
      data: { taskId: task.id },
    });
  }

  await schedulerService.queueTaskPlanning(task.id);

  return task;
}

// ============================================================================
// Voice Settings
// ============================================================================

export async function getVoiceSettings(userId: string) {
  let settings = await prisma.voiceSettings.findUnique({
    where: { userId },
  });

  if (!settings) {
    settings = await prisma.voiceSettings.create({
      data: { userId },
    });
  }

  return settings;
}

export async function updateVoiceSettings(
  userId: string,
  updates: Partial<{
    voiceEnabled: boolean;
    pushToTalk: boolean;
    autoSendDelay: number;
    language: string;
    ttsEnabled: boolean;
    ttsVoice: string;
    ttsSpeed: number;
    ttsVolume: number;
  }>
) {
  return prisma.voiceSettings.upsert({
    where: { userId },
    create: { userId, ...updates },
    update: updates,
  });
}
