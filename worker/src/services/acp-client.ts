/**
 * ACP (Agent Client Protocol) client for spawning and communicating with
 * any coding agent CLI (Claude Code, Codex, Gemini, Aider, etc.).
 *
 * Replaces the Claude-specific Agent SDK with the standard ACP protocol,
 * allowing any ACP-compatible agent to be used interchangeably.
 */

import { spawn, type ChildProcess } from "child_process";
import { Writable, Readable } from "stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type Usage,
} from "@agentclientprotocol/sdk";
import { ACPEventLogger } from "./acp-event-logger.js";
import { config } from "../config.js";

// Default agent config for Claude Code
const DEFAULT_AGENT = {
  command: "claude",
  args: ["--acp"],
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
  /** Callback for permission requests (auto-approves if not provided) */
  onPermission?: (
    params: RequestPermissionRequest
  ) => Promise<RequestPermissionResponse>;
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
 * Run a prompt through an ACP-compatible agent CLI.
 *
 * Spawns the agent process, establishes an ACP connection,
 * creates a session, sends the prompt, collects results, and cleans up.
 */
export async function acpQuery(options: ACPQueryOptions): Promise<ACPQueryResult> {
  const {
    prompt,
    cwd = process.cwd(),
    systemPrompt,
    agent = DEFAULT_AGENT,
    env,
    onUpdate,
    onPermission,
    signal,
  } = options;

  // Spawn the agent CLI process
  const agentProcess = spawn(agent.command, agent.args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env, FORCE_COLOR: "0" },
  });

  // Capture stderr for debugging
  let stderrOutput = "";
  agentProcess.stderr?.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  // Create ACP streams (cast to satisfy Web Streams API types)
  const input = Writable.toWeb(agentProcess.stdin!) as WritableStream<Uint8Array>;
  const output = Readable.toWeb(agentProcess.stdout!) as ReadableStream<Uint8Array>;
  const stream = ndJsonStream(input, output);

  // Accumulated result text
  let resultText = "";
  let usageData: Usage | null = null;
  let costUsd = 0;

  // Event logger (will be initialized after we get a session ID)
  let eventLogger: ACPEventLogger | null = null;

  // Create ACP client that handles agent notifications
  const client: Client = {
    async requestPermission(params) {
      eventLogger?.log("permission_request", params);
      if (onPermission) {
        return onPermission(params);
      }
      // Auto-approve: find the "allow_once" or "allow_always" option
      const allowAlways = params.options.find((o) => o.kind === "allow_always");
      const allowOnce = params.options.find((o) => o.kind === "allow_once");
      const selected = allowAlways || allowOnce || params.options[0];
      const response = {
        outcome: {
          outcome: "selected" as const,
          optionId: selected.optionId,
        },
      };
      eventLogger?.log("permission_response", response);
      return response;
    },

    async sessionUpdate(params: SessionNotification) {
      const update = params.update;
      eventLogger?.log(update.sessionUpdate, update);
      switch (update.sessionUpdate) {
        case "agent_message_chunk":
          if (update.content.type === "text") {
            resultText += update.content.text;
            await onUpdate?.({
              type: "text",
              data: { text: update.content.text },
            });
          }
          break;

        case "agent_thought_chunk":
          await onUpdate?.({
            type: "thought",
            data: update,
          });
          break;

        case "tool_call":
          await onUpdate?.({
            type: "tool_call",
            data: update,
          });
          break;

        case "tool_call_update":
          await onUpdate?.({
            type: "tool_call_update",
            data: update,
          });
          break;

        case "plan":
          await onUpdate?.({
            type: "plan",
            data: update,
          });
          break;

        case "usage_update":
          if (update.cost) {
            costUsd = update.cost.amount;
          }
          await onUpdate?.({
            type: "usage_update",
            data: update,
          });
          break;

        default:
          break;
      }
    },
  };

  // Create the ACP connection
  const connection = new ClientSideConnection((_agent) => client, stream);

  let sessionId: string | undefined;
  let stopReason = "end_turn";

  // Set up abort handler for cancellation
  const onAbort = async () => {
    if (sessionId) {
      try {
        eventLogger?.log("cancel", { sessionId });
        await connection.cancel({ sessionId });
      } catch {
        // Agent may already be gone
      }
    }
    if (!agentProcess.killed) {
      agentProcess.kill("SIGTERM");
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    // Initialize the ACP connection
    await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    // Create a new session
    const sessionResult = await connection.newSession({
      cwd,
      mcpServers: [],
    });
    sessionId = sessionResult.sessionId;

    // Initialize event logger now that we have a session ID
    eventLogger = new ACPEventLogger(config.workDir, sessionId);
    eventLogger.log("session_start", { agentCommand: agent.command, cwd });

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error("Query was cancelled");
    }

    // Build the full prompt (prepend system prompt if provided)
    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\n---\n\n${prompt}`
      : prompt;

    // Send the prompt
    const promptResult = await connection.prompt({
      sessionId: sessionResult.sessionId,
      prompt: [{ type: "text", text: fullPrompt }],
    });

    stopReason = promptResult.stopReason;

    // Extract usage from response
    if (promptResult.usage) {
      usageData = promptResult.usage;
    }
  } catch (err) {
    eventLogger?.log("error", { message: err instanceof Error ? err.message : String(err) });
    // If the process crashed, include stderr in the error
    if (stderrOutput) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`ACP agent error: ${msg}\nStderr: ${stderrOutput}`);
    }
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    eventLogger?.log("session_end", { stopReason, sessionId });
    eventLogger?.close();
    // Clean up the agent process
    if (!agentProcess.killed) {
      agentProcess.kill("SIGTERM");
      setTimeout(() => {
        if (!agentProcess.killed) {
          agentProcess.kill("SIGKILL");
        }
      }, 5000);
    }
  }

  return {
    result: resultText,
    sessionId,
    usage: {
      inputTokens: usageData?.inputTokens || 0,
      outputTokens: usageData?.outputTokens || 0,
      costUsd,
    },
    stopReason,
  };
}

/**
 * Run an ACP query with streaming text output.
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
    onPermission,
    signal,
  } = options;

  // Spawn the agent CLI process
  const agentProcess = spawn(agent.command, agent.args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env, FORCE_COLOR: "0" },
  });

  agentProcess.stderr?.on("data", () => {});

  const input = Writable.toWeb(agentProcess.stdin!) as WritableStream<Uint8Array>;
  const output = Readable.toWeb(agentProcess.stdout!) as ReadableStream<Uint8Array>;
  const acpStream = ndJsonStream(input, output);

  // Use a queue to yield text chunks from the callback
  const textQueue: string[] = [];
  const state = {
    resolveWaiting: null as (() => void) | null,
    done: false,
    finalUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    finalStopReason: "end_turn",
  };

  let eventLogger: ACPEventLogger | null = null;

  const client: Client = {
    async requestPermission(params) {
      eventLogger?.log("permission_request", params);
      if (onPermission) {
        return onPermission(params);
      }
      const allowAlways = params.options.find((o) => o.kind === "allow_always");
      const allowOnce = params.options.find((o) => o.kind === "allow_once");
      const selected = allowAlways || allowOnce || params.options[0];
      return {
        outcome: { outcome: "selected", optionId: selected.optionId },
      };
    },

    async sessionUpdate(params: SessionNotification) {
      const update = params.update;
      eventLogger?.log(update.sessionUpdate, update);
      if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
        textQueue.push(update.content.text);
        state.resolveWaiting?.();
      }
      if (update.sessionUpdate === "usage_update" && update.cost) {
        state.finalUsage.costUsd = update.cost.amount;
      }
    },
  };

  const connection = new ClientSideConnection((_agent) => client, acpStream);

  // Run the prompt in a separate async context
  const promptPromise = (async () => {
    let sessionId: string | undefined;

    // Set up abort handler
    const onAbort = async () => {
      if (sessionId) {
        try {
          eventLogger?.log("cancel", { sessionId });
          await connection.cancel({ sessionId });
        } catch {
          // Agent may already be gone
        }
      }
      if (!agentProcess.killed) {
        agentProcess.kill("SIGTERM");
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });

      const sessionResult = await connection.newSession({
        cwd,
        mcpServers: [],
      });
      sessionId = sessionResult.sessionId;

      eventLogger = new ACPEventLogger(config.workDir, sessionId);
      eventLogger.log("session_start", { agentCommand: agent.command, cwd, streaming: true });

      if (signal?.aborted) {
        throw new Error("Query was cancelled");
      }

      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\n---\n\n${prompt}`
        : prompt;

      const promptResult = await connection.prompt({
        sessionId: sessionResult.sessionId,
        prompt: [{ type: "text", text: fullPrompt }],
      });

      state.finalStopReason = promptResult.stopReason;
      if (promptResult.usage) {
        state.finalUsage.inputTokens = promptResult.usage.inputTokens;
        state.finalUsage.outputTokens = promptResult.usage.outputTokens;
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      state.done = true;
      state.resolveWaiting?.();
      eventLogger?.log("session_end", { stopReason: state.finalStopReason });
      eventLogger?.close();
      if (!agentProcess.killed) {
        agentProcess.kill("SIGTERM");
      }
    }
  })();

  // Yield text chunks as they arrive
  while (true) {
    while (textQueue.length > 0) {
      yield { text: textQueue.shift()!, done: false as const };
    }

    if (state.done) break;

    // Wait for next text chunk
    await new Promise<void>((resolve) => {
      state.resolveWaiting = resolve;
    });
  }

  // Drain remaining chunks
  while (textQueue.length > 0) {
    yield { text: textQueue.shift()!, done: false as const };
  }

  await promptPromise;

  yield {
    text: "",
    done: true as const,
    usage: state.finalUsage,
    stopReason: state.finalStopReason,
  };
}

/**
 * Resolve agent config from an agent ID string.
 * Returns the command and args needed to spawn the agent CLI.
 */
export function resolveAgentConfig(agentId?: string): AgentConfig {
  switch (agentId) {
    case "codex":
      return { command: "codex", args: [] };
    case "gemini":
      return { command: "gemini", args: [] };
    case "aider":
      return { command: "aider", args: ["--no-auto-commits"] };
    case "amp":
      return { command: "amp", args: [] };
    case "claude-code":
    default:
      return DEFAULT_AGENT;
  }
}
