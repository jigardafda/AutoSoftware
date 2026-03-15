import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { agentRegistry } from "./agent-registry.js";
import { ACPEventLogger } from "./acp-event-logger.js";
import { config } from "../../config.js";

/**
 * Event shape emitted by ACPSession.
 * Events are normalized from Claude Code's stream-json format.
 */
export interface ACPSessionEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface ACPSessionInfo {
  id: string;
  agentId: string;
  workspacePath: string;
  status: ACPSessionStatus;
  createdAt: number;
}

export type ACPSessionStatus = "starting" | "active" | "stopped" | "error";

export type PermissionPolicy = "auto" | "supervised" | "plan";

/**
 * Manages a Claude Code session using the stream-json protocol.
 *
 * Claude Code is spawned with:
 *   claude -p --output-format=stream-json --verbose --permission-mode=<policy>
 *
 * Communication:
 * - First message: prompt is passed as CLI argument
 * - Follow-up messages: written to stdin as plain text lines
 * - Responses: NDJSON lines on stdout with types: system, assistant, result
 */
export class ACPSession extends EventEmitter {
  readonly id: string;
  readonly agentId: string;
  readonly workspacePath: string;
  readonly createdAt: number;

  private process: ChildProcess | null = null;
  private _status: ACPSessionStatus = "starting";
  private eventLogger: ACPEventLogger | null = null;
  private _permissionPolicy: PermissionPolicy = "auto";
  private _modelId: string | undefined;
  private claudeSessionId: string | null = null;
  private stdoutBuffer = "";
  private isFirstMessage = true;
  private currentAssistantContent = "";
  private eventBuffer: ACPSessionEvent[] = [];

  constructor(
    id: string,
    agentId: string,
    workspacePath: string,
    modelId?: string,
  ) {
    super();
    this.id = id;
    this.agentId = agentId;
    this.workspacePath = workspacePath;
    this._modelId = modelId;
    this.createdAt = Date.now();

    // Prevent unhandled 'error' event crashes — errors are also emitted
    // as ACPSessionEvents via the "event" channel for listeners to consume.
    this.on("error", () => {});
  }

  get modelId(): string | undefined {
    return this._modelId;
  }

  set modelId(model: string | undefined) {
    this._modelId = model;
  }

  get pid(): number | undefined {
    return this.process?.pid;
  }

  get status(): ACPSessionStatus {
    return this._status;
  }

  get permissionPolicy(): PermissionPolicy {
    return this._permissionPolicy;
  }

  set permissionPolicy(policy: PermissionPolicy) {
    this._permissionPolicy = policy;
  }

  /** Get the Claude Code session ID used for --resume */
  getClaudeSessionId(): string | null {
    return this.claudeSessionId;
  }

  /** Pre-set the Claude session ID (for resuming after page reload) */
  setClaudeSessionId(id: string): void {
    this.claudeSessionId = id;
  }

  /**
   * Spawn the Claude Code process with stream-json protocol.
   * The first user message is passed as the CLI prompt argument.
   */
  async start(
    initialPrompt?: string,
    attachments?: Array<{
      type: "image" | "file";
      name: string;
      mimeType: string;
      data: string;
    }>,
  ): Promise<void> {
    const agent = agentRegistry.getById(this.agentId);
    if (!agent) {
      this._status = "error";
      throw new Error(`Agent "${this.agentId}" is not registered`);
    }
    if (!agent.available) {
      this._status = "error";
      throw new Error(
        `Agent "${this.agentId}" is not available. Ensure "${agent.command}" is installed and on your PATH.`,
      );
    }

    this.eventLogger = new ACPEventLogger(config.workDir, this.id);
    this.eventLogger.log("session_start", {
      agentId: this.agentId,
      workspacePath: this.workspacePath,
    });

    // Strip Claude Code env vars to allow spawning claude inside a Claude Code session (dev mode)
    const childEnv: Record<string, string | undefined> = {
      ...process.env,
      FORCE_COLOR: "0",
    };
    for (const key of Object.keys(childEnv)) {
      if (
        key.startsWith("CLAUDE_CODE") ||
        key === "CLAUDECODE" ||
        key === "ANTHROPIC_MODEL" ||
        key === "ANTHROPIC_SMALL_FAST_MODEL"
      ) {
        delete childEnv[key];
      }
    }

    // If no initial prompt, just mark as ready — process spawns on first sendMessage
    if (!initialPrompt) {
      this._status = "active";
      this.eventLogger?.log("session_active", { lazy: true });
      return;
    }

    // Process attachments into the prompt
    let fullPrompt = initialPrompt;
    if (attachments?.length) {
      const attachDir = path.join(
        this.workspacePath,
        ".auto-software/attachments",
      );
      await fs.mkdir(attachDir, { recursive: true });

      for (const att of attachments) {
        const buf = Buffer.from(att.data, "base64");
        if (att.type === "image") {
          const filename = `${crypto.randomUUID().slice(0, 8)}-${att.name}`;
          const imagePath = path.join(attachDir, filename);
          await fs.writeFile(imagePath, buf);
          fullPrompt += `\n\n[Attached image: ${att.name}] — saved at ${imagePath}`;
        } else if (isBinaryFile(att.name, att.mimeType)) {
          // Binary files (PDF, docx, xlsx, etc.) — save to disk and reference by path
          const filename = `${crypto.randomUUID().slice(0, 8)}-${att.name}`;
          const filePath = path.join(attachDir, filename);
          await fs.writeFile(filePath, buf);
          fullPrompt += `\n\n[Attached file: ${att.name}] — saved at ${filePath}. Please read this file to see its contents.`;
        } else {
          // Text files — inline content
          const decoded = buf.toString("utf-8");
          fullPrompt += `\n\n--- File: ${att.name} ---\n${decoded}\n---`;
        }
      }
    }

    // Map permission policy to Claude Code's --permission-mode flag
    const permissionMode =
      this._permissionPolicy === "auto"
        ? "bypassPermissions"
        : this._permissionPolicy === "plan"
          ? "plan"
          : "default";

    // Build args: base args from registry + model + permission + prompt
    const args = [...agent.args];

    // Add model flag if specified
    if (this._modelId && agent.modelFlag) {
      args.push(agent.modelFlag, this._modelId);
    }

    // Add permission mode for agents that support it
    if (agent.protocol === "stream-json") {
      args.push("--permission-mode", permissionMode);
      // Set a stable session ID so follow-up messages can --resume
      this.claudeSessionId = crypto.randomUUID();
      args.push("--session-id", this.claudeSessionId);
    }

    // Add the prompt as the final argument
    args.push(fullPrompt);

    this.process = spawn(agent.command, args, {
      cwd: this.workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
    });

    // Prompt is passed via CLI args — close stdin so the process doesn't hang
    this.process.stdin?.end();

    this.setupProcessHandlers(this.process);

    this._status = "active";
    this.isFirstMessage = false;
    this.eventLogger?.log("session_active", {});
  }

  /**
   * Parse a single NDJSON line from Claude Code's stream-json output.
   * Event types: system, assistant, user, result, rate_limit_event
   */
  private handleStreamJsonLine(line: string): void {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      this.eventLogger?.log("parse_error", { line });
      return;
    }

    this.eventLogger?.log("stream_event", event);

    const type = event.type as string;

    switch (type) {
      case "system": {
        // System events: init, hook_started, hook_response
        if (event.subtype === "init") {
          this.claudeSessionId = event.session_id;
          this.emitEvent("system", {
            subtype: "init",
            sessionId: event.session_id,
            tools: event.tools,
            model: event.model,
          });
        }
        break;
      }

      case "assistant": {
        // Assistant message with content blocks
        const message = event.message;
        if (!message?.content) break;

        for (const block of message.content) {
          if (block.type === "text") {
            // Accumulate text and emit as agent_message
            this.currentAssistantContent += block.text;
            this.emitEvent("agent_message_chunk", {
              text: block.text,
              fullText: this.currentAssistantContent,
            });
          } else if (block.type === "thinking") {
            this.emitEvent("agent_thought_chunk", {
              text: block.thinking || block.text || "",
            });
          } else if (block.type === "tool_use") {
            this.emitEvent("tool_call", {
              toolName: block.name,
              toolUseId: block.id,
              input: block.input,
            });
          } else if (block.type === "tool_result") {
            const resultContent = Array.isArray(block.content)
              ? block.content.map((c: any) => c.text || "").join("\n")
              : typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content);
            this.emitEvent("tool_call_update", {
              toolUseId: block.tool_use_id,
              result: resultContent,
              isError: block.is_error,
            });
          }
        }
        break;
      }

      case "user": {
        // User message echoed back — contains tool results from executed tools
        const message = event.message;
        if (!message?.content) break;

        for (const block of message.content) {
          if (block.type === "tool_result") {
            // Extract tool result content
            let resultContent: string;
            if (Array.isArray(block.content)) {
              resultContent = block.content
                .map((c: any) => c.text || "")
                .join("\n");
            } else if (typeof block.content === "string") {
              resultContent = block.content;
            } else {
              resultContent = JSON.stringify(block.content);
            }

            // Also include stdout/stderr from tool_use_result if available
            const toolResult = event.tool_use_result;
            if (toolResult) {
              if (
                toolResult.stdout &&
                !resultContent.includes(toolResult.stdout)
              ) {
                resultContent = toolResult.stdout;
              }
            }

            this.emitEvent("tool_call_update", {
              toolUseId: block.tool_use_id,
              result: resultContent,
              isError: block.is_error || false,
            });
          }
        }
        break;
      }

      case "rate_limit_event": {
        // Forward rate limit info (optional)
        this.emitEvent("rate_limit_event", event.rate_limit_info || event);
        break;
      }

      case "result": {
        // End of turn — don't emit agent_message here because the frontend
        // already accumulates agent_message_chunk events into an entry.

        // Before resetting, scan for question patterns with numbered options
        // so we can emit action_buttons for interactive choices.
        if (this.currentAssistantContent) {
          const actionData = this.extractActionButtons(this.currentAssistantContent);
          if (actionData) {
            this.emitEvent("action_buttons", actionData);
          }
        }

        // Reset the accumulator.
        this.currentAssistantContent = "";

        // Extract context window from model_usage if available
        let contextWindow: number | undefined;
        if (event.model_usage || event.modelUsage) {
          const modelUsage = event.model_usage || event.modelUsage;
          // model_usage is a map of model name → { context_window }
          for (const [, usage] of Object.entries(modelUsage as Record<string, any>)) {
            if (usage?.context_window) {
              contextWindow = usage.context_window;
              break;
            }
          }
        }

        this.emitEvent("usage_update", {
          inputTokens: event.usage?.input_tokens || 0,
          outputTokens: event.usage?.output_tokens || 0,
          cacheCreationInputTokens: event.usage?.cache_creation_input_tokens || 0,
          cacheReadInputTokens: event.usage?.cache_read_input_tokens || 0,
          totalCost: event.total_cost_usd || 0,
          contextWindow,
          durationMs: event.duration_ms || 0,
          numTurns: event.num_turns || 0,
          stopReason: event.stop_reason,
          isError: event.is_error || false,
          result: event.result,
        });
        break;
      }

      default:
        // Forward unknown events as-is
        this.emitEvent(type, event);
        break;
    }
  }

  /**
   * Send a follow-up message to the running Claude Code process.
   * For the stream-json protocol, follow-up messages are written to stdin.
   * The process must be restarted for each conversation turn since
   * claude -p exits after completing a prompt.
   */
  async sendMessage(
    content: string,
    attachments?: Array<{
      type: "image" | "file";
      name: string;
      mimeType: string;
      data: string;
    }>,
  ): Promise<void> {
    if (this._status !== "active" && this._status !== "stopped") {
      throw new Error("Session is not available for messages");
    }

    // Build the full content with attachments
    let fullContent = content;
    if (attachments?.length) {
      // Ensure attachments directory exists in workspace
      const attachDir = path.join(
        this.workspacePath,
        ".auto-software/attachments",
      );
      await fs.mkdir(attachDir, { recursive: true });

      for (const att of attachments) {
        const buf = Buffer.from(att.data, "base64");
        if (att.type === "image") {
          const filename = `${crypto.randomUUID().slice(0, 8)}-${att.name}`;
          const imagePath = path.join(attachDir, filename);
          await fs.writeFile(imagePath, buf);
          fullContent += `\n\n[Attached image: ${att.name}] — saved at ${imagePath}`;
        } else if (isBinaryFile(att.name, att.mimeType)) {
          // Binary files (PDF, docx, xlsx, etc.) — save to disk and reference by path
          const filename = `${crypto.randomUUID().slice(0, 8)}-${att.name}`;
          const filePath = path.join(attachDir, filename);
          await fs.writeFile(filePath, buf);
          fullContent += `\n\n[Attached file: ${att.name}] — saved at ${filePath}. Please read this file to see its contents.`;
        } else {
          // Text files — inline content
          const decoded = buf.toString("utf-8");
          fullContent += `\n\n--- File: ${att.name} ---\n${decoded}\n---`;
        }
      }
    }

    this.eventLogger?.log("user_message", { content: fullContent });

    // Claude Code -p mode exits after each prompt completes.
    // For follow-up messages, we spawn a new process with --resume if available,
    // or just start a fresh prompt.
    // Reset current content accumulator
    this.currentAssistantContent = "";

    if (this.process && this._status === "active") {
      // Process is still running — it's processing the previous message.
      // Cannot send another message until the current turn completes.
      throw new Error(
        "Agent is still processing the previous message. Please wait for it to finish.",
      );
    }

    // Previous process exited - spawn a new one
    const agent = agentRegistry.getById(this.agentId);
    if (!agent) throw new Error(`Agent "${this.agentId}" is not registered`);

    const childEnv: Record<string, string | undefined> = {
      ...process.env,
      FORCE_COLOR: "0",
    };
    for (const key of Object.keys(childEnv)) {
      if (
        key.startsWith("CLAUDE_CODE") ||
        key === "CLAUDECODE" ||
        key === "ANTHROPIC_MODEL" ||
        key === "ANTHROPIC_SMALL_FAST_MODEL"
      ) {
        delete childEnv[key];
      }
    }

    const permissionMode =
      this._permissionPolicy === "auto"
        ? "bypassPermissions"
        : this._permissionPolicy === "plan"
          ? "plan"
          : "default";

    const args = [...agent.args];

    // Add model flag if specified
    if (this._modelId && agent.modelFlag) {
      args.push(agent.modelFlag, this._modelId);
    }

    if (agent.protocol === "stream-json") {
      args.push("--permission-mode", permissionMode);
    }

    // Resume the conversation using the session ID from the first spawn
    if (this.claudeSessionId) {
      args.push("--resume", this.claudeSessionId);
    }

    args.push(fullContent);

    this.process = spawn(agent.command, args, {
      cwd: this.workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
    });

    // Prompt is passed via CLI args — close stdin so the process doesn't hang
    this.process.stdin?.end();

    this.setupProcessHandlers(this.process);
    this._status = "active";
  }

  /**
   * Wire up stdout/stderr/exit/error handlers on a spawned child process.
   */
  private setupProcessHandlers(proc: ChildProcess): void {
    this.stdoutBuffer = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString();
      const lines = this.stdoutBuffer.split("\n");
      this.stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleStreamJsonLine(line.trim());
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (!text.trim()) return;
      this.eventLogger?.log("stderr", text);
    });

    proc.on("exit", (code: number | null) => {
      if (this.stdoutBuffer.trim()) {
        this.handleStreamJsonLine(this.stdoutBuffer.trim());
        this.stdoutBuffer = "";
      }
      this.process = null;
      this._status = "stopped";
      this.eventLogger?.log("process_exit", { exitCode: code });
      // Emit "turn_complete" (not "done") so the frontend knows the agent
      // is ready for the next message without closing the session.
      this.emitEvent("turn_complete", { exitCode: code });
      this.emit("done", code);
    });

    proc.on("error", (err: Error) => {
      this.process = null;
      this._status = "error";
      this.eventLogger?.log("process_error", { message: err.message });
      this.emitEvent("error", { message: err.message });
      this.emit("error", err);
    });
  }

  /**
   * Gracefully stop the agent process.
   */
  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");

      const forceKillTimer = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);

      this.process.once("exit", () => {
        clearTimeout(forceKillTimer);
      });
    }
    this._status = "stopped";
    this.eventLogger?.close();
  }

  toInfo(): ACPSessionInfo {
    return {
      id: this.id,
      agentId: this.agentId,
      workspacePath: this.workspacePath,
      status: this._status,
      createdAt: this.createdAt,
    };
  }

  /** Get all buffered events (for replaying to late-joining WebSocket clients). */
  getBufferedEvents(): ACPSessionEvent[] {
    return [...this.eventBuffer];
  }

  /**
   * Parse the assistant's accumulated text for question + choice patterns.
   * Returns structured choices if a question with options is detected.
   */
  private extractActionButtons(
    text: string,
  ): {
    question: string;
    choices: Array<{ id: string; label: string; value: string; prompt: string }>;
    selectionMode: "single" | "multi" | "button";
  } | null {
    const lines = text.split("\n").map((l) => l.trim());

    // --- Yes/No or short binary questions ---
    const yesNoMatch = text.match(
      /([^\n]*\?)\s*(?:\(?\s*(yes|no|y\/n|proceed|cancel|continue|stop)\s*[/|,]\s*(yes|no|y\/n|proceed|cancel|continue|stop)\s*\)?)/i,
    );
    if (yesNoMatch) {
      const question = yesNoMatch[1].trim();
      const opt1 = yesNoMatch[2].trim();
      const opt2 = yesNoMatch[3].trim();
      return {
        question,
        choices: [
          { id: "btn-1", label: opt1.charAt(0).toUpperCase() + opt1.slice(1), value: opt1, prompt: opt1 },
          { id: "btn-2", label: opt2.charAt(0).toUpperCase() + opt2.slice(1), value: opt2, prompt: opt2 },
        ],
        selectionMode: "button",
      };
    }

    // Also detect standalone "Would you like me to proceed?" / "Should I continue?" without explicit options
    const proceedMatch = text.match(
      /((?:Would you like|Do you want|Should I|Shall I|Can I|May I)[^?]*\?)\s*$/m,
    );
    if (proceedMatch && !text.match(/^\s*(?:\d+[.)]\s|[a-z][.)]\s|-\s|\*\s)/m)) {
      return {
        question: proceedMatch[1].trim(),
        choices: [
          { id: "btn-yes", label: "Yes", value: "yes", prompt: "Yes" },
          { id: "btn-no", label: "No", value: "no", prompt: "No" },
        ],
        selectionMode: "button",
      };
    }

    // --- Numbered or lettered list with a question (before or after the list) ---
    const listPattern = /^(?:(\d+)[.)]\s+|([a-zA-Z])[.)]\s+|[-*]\s+)(.+)/;

    // First, collect ALL list items and their line indices
    const allListItems: Array<{ idx: number; marker: string; text: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(listPattern);
      if (match) {
        const marker = match[1] || match[2] || "-";
        allListItems.push({ idx: i, marker, text: match[3].trim() });
      }
    }

    if (allListItems.length < 2) return null;

    // Find the largest contiguous run of list items
    let bestRun: typeof allListItems = [];
    let currentRun: typeof allListItems = [allListItems[0]];
    for (let i = 1; i < allListItems.length; i++) {
      // Allow gaps of up to 2 lines (for blank lines between items)
      if (allListItems[i].idx - allListItems[i - 1].idx <= 3) {
        currentRun.push(allListItems[i]);
      } else {
        if (currentRun.length > bestRun.length) bestRun = currentRun;
        currentRun = [allListItems[i]];
      }
    }
    if (currentRun.length > bestRun.length) bestRun = currentRun;

    if (bestRun.length < 2) return null;

    const listStartIdx = bestRun[0].idx;
    const listEndIdx = bestRun[bestRun.length - 1].idx;

    // Find a question line — look BEFORE the list, then AFTER the list
    let questionText = "";
    // Search before the list (upward)
    for (let i = listStartIdx - 1; i >= 0; i--) {
      if (!lines[i]) continue;
      if (lines[i].endsWith("?") || lines[i].match(/\?\s*$/) ||
          lines[i].match(/(?:choose|select|pick|which|prefer|option|approach)[^.]*[:]/i)) {
        questionText = lines[i];
        break;
      }
      // Stop searching if we hit a non-empty, non-question line more than 2 lines away
      if (listStartIdx - i > 3) break;
    }
    // Search after the list (downward)
    if (!questionText) {
      for (let i = listEndIdx + 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        if (lines[i].endsWith("?") || lines[i].match(/\?\s*$/)) {
          questionText = lines[i];
          break;
        }
        if (i - listEndIdx > 3) break;
      }
    }

    if (!questionText) return null;

    // Determine selection mode
    const isMulti =
      /select (?:all|multiple|any)|check.?all|choose (?:all|multiple|any)|pick (?:all|multiple|any)/i.test(
        questionText,
      );

    // Strip markdown bold markers from labels for cleaner display
    const choices = bestRun.map((item, idx) => {
      const cleanLabel = item.text.replace(/\*\*/g, "");
      return {
        id: `choice-${idx}`,
        label: cleanLabel,
        value: item.marker !== "-" ? item.marker : String(idx + 1),
        prompt: `${item.marker !== "-" ? item.marker : idx + 1}. ${cleanLabel}`,
      };
    });

    return {
      question: questionText,
      choices,
      selectionMode: isMulti ? "multi" : "single",
    };
  }

  private emitEvent(type: string, data: unknown): void {
    const event: ACPSessionEvent = { type, data, timestamp: Date.now() };
    this.eventBuffer.push(event);
    this.emit("event", event);
  }
}

/**
 * Pool that manages multiple concurrent sessions.
 */
export class ACPSessionPool {
  private sessions: Map<string, ACPSession> = new Map();

  create(agentId: string, workspacePath: string, modelId?: string): ACPSession {
    const id = crypto.randomUUID();
    const session = new ACPSession(id, agentId, workspacePath, modelId);
    this.sessions.set(id, session);

    session.on("done", () => {
      // no-op: session stays in pool marked as 'stopped'
    });

    return session;
  }

  get(id: string): ACPSession | undefined {
    return this.sessions.get(id);
  }

  getAll(): ACPSession[] {
    return Array.from(this.sessions.values());
  }

  async stopAll(): Promise<void> {
    const stopPromises: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      if (session.status === "active" || session.status === "starting") {
        stopPromises.push(session.stop());
      }
    }
    await Promise.all(stopPromises);
  }

  async remove(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      await session.stop();
      this.sessions.delete(id);
    }
  }
}

/** Check if a file is binary (can't be safely inlined as UTF-8 text in CLI args). */
function isBinaryFile(name: string, mimeType?: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const binaryExts = new Set([
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "odt", "ods", "odp", "rtf",
    "zip", "gz", "tar", "rar", "7z",
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg",
    "mp3", "mp4", "wav", "avi", "mov", "mkv",
    "woff", "woff2", "ttf", "otf", "eot",
    "exe", "dll", "so", "dylib", "bin",
    "sqlite", "db",
  ]);
  if (binaryExts.has(ext)) return true;
  if (mimeType && (
    mimeType.startsWith("application/") &&
    !mimeType.includes("json") &&
    !mimeType.includes("xml") &&
    !mimeType.includes("javascript") &&
    !mimeType.includes("text")
  )) return true;
  return false;
}

export const sessionPool = new ACPSessionPool();
