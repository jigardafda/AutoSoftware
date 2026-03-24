/**
 * Agent client for spawning Claude Code and parsing its stream-json output.
 *
 * Claude Code uses a proprietary stream-json format (not ACP protocol).
 * This client spawns claude with -p --output-format=stream-json --verbose
 * and parses the NDJSON output to extract events.
 */

import { spawn } from "child_process";
import * as readline from "readline";
import { ACPEventLogger } from "./acp-event-logger.js";
import { config } from "../config.js";

// Default agent config for Claude Code (uses stream-json protocol)
const DEFAULT_AGENT = {
  command: "claude",
  args: ["-p", "--output-format=stream-json", "--verbose", "--permission-mode=bypassPermissions"],
};

export interface AgentConfig {
  command: string;
  args: string[];
}

export interface ACPQueryOptions {
  /** The prompt to send to the agent */
  prompt: string;
  /** Working directory for the agent session */
  cwd?: string;
  /** System prompt (prepended to user prompt for agents that don't support it natively) */
  systemPrompt?: string;
  /** Agent CLI to use (defaults to Claude Code) */
  agent?: AgentConfig;
  /** Environment variables to pass to the agent process */
  env?: Record<string, string>;
  /** Callback for session updates (text chunks, tool calls, etc.) */
  onUpdate?: (update: SessionUpdateEvent) => void | Promise<void>;
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
}

export interface SessionUpdateEvent {
  type:
    | "text"
    | "thought"
    | "tool_call"
    | "tool_call_update"
    | "plan"
    | "usage_update";
  data: unknown;
}

export interface ACPQueryResult {
  /** The final text result from the agent */
  result: string;
  /** Session ID from the agent */
  sessionId?: string;
  /** Token usage and cost information */
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  /** Stop reason from the agent */
  stopReason: string;
}

/**
 * Run a prompt through Claude Code using stream-json protocol.
 *
 * Spawns Claude with: claude -p --output-format=stream-json --verbose --permission-mode=bypassPermissions
 * Parses NDJSON lines from stdout and extracts events.
 */
export async function acpQuery(options: ACPQueryOptions): Promise<ACPQueryResult> {
  const {
    prompt,
    cwd = process.cwd(),
    systemPrompt,
    agent = DEFAULT_AGENT,
    env,
    onUpdate,
    signal,
  } = options;

  // Build the full prompt (prepend system prompt if provided)
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n\n${prompt}`
    : prompt;

  // Spawn the agent CLI process with the prompt as argument
  const args = [...agent.args, fullPrompt];
  const agentProcess = spawn(agent.command, args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env, FORCE_COLOR: "0" },
  });

  // Close stdin so Claude starts processing immediately
  agentProcess.stdin?.end();

  // Capture stderr for debugging
  let stderrOutput = "";
  agentProcess.stderr?.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  // State for accumulating results
  let resultText = "";
  let sessionId: string | undefined;
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = "end_turn";

  // Event logger (initialized after we get a session ID)
  let eventLogger: ACPEventLogger | null = null;

  // Parse stdout as NDJSON lines
  const rl = readline.createInterface({
    input: agentProcess.stdout!,
    crlfDelay: Infinity,
  });

  // Set up abort handler for cancellation
  const onAbort = () => {
    if (!agentProcess.killed) {
      agentProcess.kill("SIGTERM");
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  return new Promise<ACPQueryResult>((resolve, reject) => {
    rl.on("line", async (line) => {
      if (!line.trim()) return;

      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        // Skip non-JSON lines
        return;
      }

      // Initialize logger on first event with session_id
      if (event.session_id && !sessionId) {
        sessionId = event.session_id;
        eventLogger = new ACPEventLogger(config.workDir, sessionId as string);
        eventLogger.log("session_start", { agentCommand: agent.command, cwd });
      }

      eventLogger?.log("stream_event", event);

      const type = event.type as string;

      switch (type) {
        case "system": {
          // System events: init, hook_started, hook_response
          if (event.subtype === "init") {
            sessionId = event.session_id;
          }
          break;
        }

        case "assistant": {
          // Assistant message with content blocks
          const message = event.message;
          if (!message?.content) break;

          for (const block of message.content) {
            if (block.type === "text") {
              resultText += block.text;
              await onUpdate?.({
                type: "text",
                data: { text: block.text },
              });
            } else if (block.type === "thinking") {
              await onUpdate?.({
                type: "thought",
                data: { text: block.thinking || block.text || "" },
              });
            } else if (block.type === "tool_use") {
              // Emit tool_call event with detailed info
              await onUpdate?.({
                type: "tool_call",
                data: {
                  title: block.name,
                  toolUseId: block.id,
                  rawInput: block.input,
                  status: "running",
                },
              });
            } else if (block.type === "tool_result") {
              const resultContent = Array.isArray(block.content)
                ? block.content.map((c: any) => c.text || "").join("\n")
                : typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content);
              await onUpdate?.({
                type: "tool_call_update",
                data: {
                  toolUseId: block.tool_use_id,
                  result: resultContent,
                  isError: block.is_error,
                  status: block.is_error ? "error" : "completed",
                },
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

              await onUpdate?.({
                type: "tool_call_update",
                data: {
                  toolUseId: block.tool_use_id,
                  result: resultContent,
                  isError: block.is_error || false,
                  status: block.is_error ? "error" : "completed",
                },
              });
            }
          }
          break;
        }

        case "result": {
          // End of turn - extract final results
          stopReason = event.stop_reason || "end_turn";
          costUsd = event.total_cost_usd || 0;

          // Extract usage from result
          if (event.usage) {
            inputTokens = event.usage.input_tokens || 0;
            outputTokens = event.usage.output_tokens || 0;
          }

          // Also check modelUsage for token counts
          if (event.modelUsage) {
            for (const [, usage] of Object.entries(event.modelUsage as Record<string, any>)) {
              if (usage) {
                inputTokens = usage.inputTokens || inputTokens;
                outputTokens = usage.outputTokens || outputTokens;
              }
            }
          }
          break;
        }
      }
    });

    rl.on("close", () => {
      signal?.removeEventListener("abort", onAbort);
      eventLogger?.log("session_end", { stopReason, sessionId });
      eventLogger?.close();

      resolve({
        result: resultText,
        sessionId,
        usage: {
          inputTokens,
          outputTokens,
          costUsd,
        },
        stopReason,
      });
    });

    rl.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      eventLogger?.log("error", { message: err.message });
      eventLogger?.close();

      if (!agentProcess.killed) {
        agentProcess.kill("SIGTERM");
      }

      reject(new Error(`Stream error: ${err.message}\nStderr: ${stderrOutput}`));
    });

    agentProcess.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      eventLogger?.log("error", { message: err.message });
      eventLogger?.close();

      reject(new Error(`Agent process error: ${err.message}\nStderr: ${stderrOutput}`));
    });

    agentProcess.on("exit", (code) => {
      if (code !== 0 && !signal?.aborted) {
        // Process exited with error before we got results
        // This will be handled by rl.on('close') if we already have results
        if (!resultText) {
          signal?.removeEventListener("abort", onAbort);
          eventLogger?.close();
          reject(new Error(`Agent exited with code ${code}\nStderr: ${stderrOutput}`));
        }
      }
    });
  });
}

/**
 * Run a query with streaming text output.
 * Yields text chunks as they arrive from the agent.
 */
export async function* acpStreamQuery(
  options: ACPQueryOptions
): AsyncGenerator<
  | { text: string; done: false }
  | { text: string; done: true; usage: ACPQueryResult["usage"]; stopReason: string },
  void,
  unknown
> {
  const {
    prompt,
    cwd = process.cwd(),
    systemPrompt,
    agent = DEFAULT_AGENT,
    env,
    signal,
  } = options;

  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n\n${prompt}`
    : prompt;

  const args = [...agent.args, fullPrompt];
  const agentProcess = spawn(agent.command, args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env, FORCE_COLOR: "0" },
  });

  // Close stdin so Claude starts processing immediately
  agentProcess.stdin?.end();

  agentProcess.stderr?.on("data", () => {});

  const state = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    stopReason: "end_turn",
    sessionId: undefined as string | undefined,
  };

  let eventLogger: ACPEventLogger | null = null;

  const rl = readline.createInterface({
    input: agentProcess.stdout!,
    crlfDelay: Infinity,
  });

  const onAbort = () => {
    if (!agentProcess.killed) {
      agentProcess.kill("SIGTERM");
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  // Use async iteration over readline
  for await (const line of rl) {
    if (!line.trim()) continue;

    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.session_id && !state.sessionId) {
      state.sessionId = event.session_id;
      eventLogger = new ACPEventLogger(config.workDir, state.sessionId as string);
      eventLogger.log("session_start", { agentCommand: agent.command, cwd, streaming: true });
    }

    eventLogger?.log("stream_event", event);

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          yield { text: block.text, done: false };
        }
      }
    }

    if (event.type === "result") {
      state.stopReason = event.stop_reason || "end_turn";
      state.costUsd = event.total_cost_usd || 0;
      if (event.usage) {
        state.inputTokens = event.usage.input_tokens || 0;
        state.outputTokens = event.usage.output_tokens || 0;
      }
      if (event.modelUsage) {
        for (const [, usage] of Object.entries(event.modelUsage as Record<string, any>)) {
          if (usage) {
            state.inputTokens = usage.inputTokens || state.inputTokens;
            state.outputTokens = usage.outputTokens || state.outputTokens;
          }
        }
      }
    }
  }

  signal?.removeEventListener("abort", onAbort);
  eventLogger?.log("session_end", { stopReason: state.stopReason });
  eventLogger?.close();

  if (!agentProcess.killed) {
    agentProcess.kill("SIGTERM");
  }

  yield {
    text: "",
    done: true,
    usage: {
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      costUsd: state.costUsd,
    },
    stopReason: state.stopReason,
  };
}

/**
 * Resolve agent config from an agent ID string.
 * Returns the command and args needed to spawn the agent CLI.
 */
export function resolveAgentConfig(agentId?: string): AgentConfig {
  switch (agentId) {
    case "codex":
      return { command: "codex", args: ["exec", "--output-format", "stream-json", "--skip-permissions-unsafe"] };
    case "gemini":
      return { command: "gemini", args: [] };
    case "aider":
      return { command: "aider", args: ["--no-auto-commits"] };
    case "amp":
      return { command: "amp", args: ["-y", "@sourcegraph/amp@latest", "--execute", "--stream-json"] };
    case "claude-code":
    default:
      return DEFAULT_AGENT;
  }
}
