/**
 * ACP (Agent Client Protocol) client for spawning and communicating with
 * any coding agent CLI (Claude Code, Codex, Gemini, Aider, etc.).
 *
 * Used by the backend for chat and simple queries. Replaces the
 * Claude-specific Agent SDK with the standard ACP protocol.
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
import { ACPEventLogger } from "./acp/acp-event-logger.js";
import { config } from "../config.js";

const DEFAULT_AGENT = {
  command: "claude",
  args: ["--acp"],
};

export interface AgentConfig {
  command: string;
  args: string[];
}

export interface ACPQueryOptions {
  prompt: string;
  cwd?: string;
  systemPrompt?: string;
  agent?: AgentConfig;
  env?: Record<string, string>;
  onUpdate?: (update: SessionUpdateEvent) => void | Promise<void>;
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
  result: string;
  sessionId?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  stopReason: string;
}

/**
 * Run a prompt through an ACP-compatible agent CLI.
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

  const agentProcess = spawn(agent.command, agent.args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env, FORCE_COLOR: "0" },
  });

  let stderrOutput = "";
  agentProcess.stderr?.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  const input = Writable.toWeb(agentProcess.stdin!) as WritableStream<Uint8Array>;
  const output = Readable.toWeb(agentProcess.stdout!) as ReadableStream<Uint8Array>;
  const stream = ndJsonStream(input, output);

  let resultText = "";
  let usageData: Usage | null = null;
  let costUsd = 0;
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
            await onUpdate?.({ type: "text", data: { text: update.content.text } });
          }
          break;
        case "agent_thought_chunk":
          await onUpdate?.({ type: "thought", data: update });
          break;
        case "tool_call":
          await onUpdate?.({ type: "tool_call", data: update });
          break;
        case "tool_call_update":
          await onUpdate?.({ type: "tool_call_update", data: update });
          break;
        case "plan":
          await onUpdate?.({ type: "plan", data: update });
          break;
        case "usage_update":
          if (update.cost) {
            costUsd = update.cost.amount;
          }
          await onUpdate?.({ type: "usage_update", data: update });
          break;
        default:
          break;
      }
    },
  };

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
    eventLogger.log("session_start", { agentCommand: agent.command, cwd });

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

    stopReason = promptResult.stopReason;

    if (promptResult.usage) {
      usageData = promptResult.usage;
    }
  } catch (err) {
    eventLogger?.log("error", { message: err instanceof Error ? err.message : String(err) });
    if (stderrOutput) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`ACP agent error: ${msg}\nStderr: ${stderrOutput}`);
    }
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    eventLogger?.log("session_end", { stopReason, sessionId });
    eventLogger?.close();
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

  const agentProcess = spawn(agent.command, agent.args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env, FORCE_COLOR: "0" },
  });

  agentProcess.stderr?.on("data", () => {});

  const input = Writable.toWeb(agentProcess.stdin!) as WritableStream<Uint8Array>;
  const output = Readable.toWeb(agentProcess.stdout!) as ReadableStream<Uint8Array>;
  const acpStream = ndJsonStream(input, output);

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

  const promptPromise = (async () => {
    let sessionId: string | undefined;

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

  while (true) {
    while (textQueue.length > 0) {
      yield { text: textQueue.shift()!, done: false as const };
    }
    if (state.done) break;
    await new Promise<void>((resolve) => {
      state.resolveWaiting = resolve;
    });
  }

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
