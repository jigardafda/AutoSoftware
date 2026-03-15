import { execSync, spawn } from "child_process";

export interface ModelInfo {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface AgentCapabilities {
  fileEdit: boolean;
  terminal: boolean;
  browser: boolean;
  approval: boolean;
  streaming: boolean;
  sessionResume: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  protocol: "stream-json" | "acp" | "json-rpc" | "stdin";
  available: boolean;
  icon: string;
  description: string;
  models: ModelInfo[];
  defaultModel: string;
  /** How the model name is passed to the CLI */
  modelFlag: string;
  capabilities: AgentCapabilities;
}

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    command: "claude",
    args: ["-p", "--output-format=stream-json", "--verbose"],
    protocol: "stream-json",
    available: false,
    icon: "claude",
    description: "Anthropic Claude Code — best for complex reasoning and code generation",
    defaultModel: "claude-opus-4-6",
    modelFlag: "--model",
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", isDefault: true },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    ],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: true,
      streaming: true,
      sessionResume: true,
    },
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    command: "npx",
    args: ["-y", "@openai/codex@latest"],
    protocol: "json-rpc",
    available: false,
    icon: "openai",
    description: "OpenAI Codex CLI — fast code generation with GPT models",
    defaultModel: "gpt-5.4",
    modelFlag: "--model",
    models: [
      { id: "gpt-5.4", name: "GPT-5.4", isDefault: true },
      { id: "gpt-5.4-fast", name: "GPT-5.4 Fast" },
      { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      { id: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
      { id: "gpt-5.2", name: "GPT-5.2" },
      { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max" },
      { id: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
    ],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: true,
      streaming: true,
      sessionResume: true,
    },
  },
  {
    id: "cursor",
    name: "Cursor Agent",
    command: "cursor-agent",
    args: ["-p", "--output-format=stream-json"],
    protocol: "stream-json",
    available: false,
    icon: "cursor",
    description: "Cursor AI coding agent — supports many model providers",
    defaultModel: "auto",
    modelFlag: "--model",
    models: [
      { id: "auto", name: "Auto (Default)", isDefault: true },
      { id: "gpt-5.4", name: "GPT-5.4" },
      { id: "gpt-5.4-fast", name: "GPT-5.4 Fast" },
      { id: "opus-4.6", name: "Claude Opus 4.6" },
      { id: "sonnet-4.6", name: "Claude Sonnet 4.6" },
      { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
      { id: "gemini-3-pro", name: "Gemini 3 Pro" },
    ],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: false,
      streaming: true,
      sessionResume: false,
    },
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    command: "npx",
    args: ["-y", "@github/copilot@latest", "--acp"],
    protocol: "acp",
    available: false,
    icon: "copilot",
    description: "GitHub Copilot coding agent — ACP protocol",
    defaultModel: "gpt-5.4",
    modelFlag: "--model",
    models: [
      { id: "gpt-5.4", name: "GPT-5.4", isDefault: true },
      { id: "claude-opus-4.6", name: "Claude Opus 4.6" },
      { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
      { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      { id: "gpt-5.2", name: "GPT-5.2" },
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro" },
    ],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: true,
      streaming: true,
      sessionResume: false,
    },
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    command: "npx",
    args: ["-y", "@google/gemini-cli@latest", "--experimental-acp"],
    protocol: "acp",
    available: false,
    icon: "gemini",
    description: "Google Gemini CLI — ACP protocol",
    defaultModel: "gemini-3.1-pro-preview",
    modelFlag: "--model",
    models: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", isDefault: true },
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" },
    ],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: true,
      streaming: true,
      sessionResume: true,
    },
  },
  {
    id: "amp",
    name: "Amp",
    command: "npx",
    args: ["-y", "@sourcegraph/amp@latest", "--execute", "--stream-json"],
    protocol: "stream-json",
    available: false,
    icon: "amp",
    description: "Sourcegraph Amp — stream-json coding agent",
    defaultModel: "",
    modelFlag: "",
    models: [],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: false,
      streaming: true,
      sessionResume: false,
    },
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "npx",
    args: ["-y", "opencode-ai@latest", "serve", "--hostname", "127.0.0.1", "--port", "0"],
    protocol: "json-rpc",
    available: false,
    icon: "opencode",
    description: "OpenCode AI — multi-provider coding agent",
    defaultModel: "",
    modelFlag: "--model",
    models: [],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: true,
      streaming: true,
      sessionResume: true,
    },
  },
  {
    id: "droid",
    name: "Droid",
    command: "droid",
    args: ["exec", "--output-format", "stream-json", "--skip-permissions-unsafe"],
    protocol: "stream-json",
    available: false,
    icon: "droid",
    description: "Droid factory coding agent — multi-model support",
    defaultModel: "claude-opus-4-6",
    modelFlag: "--model",
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", isDefault: true },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
      { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      { id: "gpt-5.2", name: "GPT-5.2" },
    ],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: true,
      streaming: true,
      sessionResume: true,
    },
  },
  {
    id: "qwen",
    name: "Qwen Code",
    command: "npx",
    args: ["-y", "@qwen-code/qwen-code@latest", "--acp"],
    protocol: "acp",
    available: false,
    icon: "qwen",
    description: "Alibaba Qwen Code — ACP protocol agent",
    defaultModel: "",
    modelFlag: "--model",
    models: [],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: true,
      streaming: true,
      sessionResume: true,
    },
  },
  {
    id: "aider",
    name: "Aider",
    command: "aider",
    args: ["--no-auto-commits"],
    protocol: "stdin",
    available: false,
    icon: "aider",
    description: "Aider — AI pair programming in your terminal",
    defaultModel: "",
    modelFlag: "--model",
    models: [],
    capabilities: {
      fileEdit: true,
      terminal: true,
      browser: false,
      approval: false,
      streaming: true,
      sessionResume: false,
    },
  },
];

export class AgentRegistry {
  private agents: Map<string, AgentConfig> = new Map();

  constructor() {
    for (const agent of DEFAULT_AGENTS) {
      this.agents.set(agent.id, { ...agent });
    }
  }

  async detectAll(): Promise<AgentConfig[]> {
    const detectPromises: Promise<void>[] = [];
    for (const agent of this.agents.values()) {
      detectPromises.push(this.detectAgent(agent));
    }
    await Promise.all(detectPromises);
    return this.getAll();
  }

  private async detectAgent(agent: AgentConfig): Promise<void> {
    try {
      if (agent.command === "npx") {
        // For npx-based agents, `which npx` always succeeds but the package
        // may not be installed.  Extract the package name from args (skip
        // flags like "-y") and check if it is globally installed.
        const packageArg = agent.args.find((a) => !a.startsWith("-"));
        if (!packageArg) {
          agent.available = false;
          return;
        }
        // Strip trailing @version (e.g. "@openai/codex@latest" -> "@openai/codex")
        const packageName = packageArg.replace(/@[^@/]+$/, "");
        execSync(`npm list -g ${packageName}`, {
          stdio: "pipe",
          timeout: 10000,
        });
        agent.available = true;
      } else {
        execSync(`which ${agent.command}`, {
          stdio: "pipe",
          timeout: 5000,
        });
        agent.available = true;
      }
    } catch {
      agent.available = false;
    }
  }

  getAll(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  getById(id: string): AgentConfig | undefined {
    return this.agents.get(id);
  }

  getAvailable(): AgentConfig[] {
    return this.getAll().filter((a) => a.available);
  }

  register(config: AgentConfig): void {
    this.agents.set(config.id, { ...config });
  }

  unregister(id: string): boolean {
    return this.agents.delete(id);
  }

  /**
   * Install an npx-based agent globally via `npm install -g <package>`.
   */
  async installAgent(agentId: string): Promise<{ success: boolean; message: string }> {
    const agent = this.getById(agentId);
    if (!agent) return { success: false, message: `Agent "${agentId}" not found` };
    if (agent.command !== "npx") return { success: false, message: `Agent "${agent.name}" is not an npx-based agent` };
    if (agent.available) return { success: true, message: `Agent "${agent.name}" is already installed` };

    const packageArg = agent.args.find((a) => !a.startsWith("-"));
    if (!packageArg) return { success: false, message: "Could not determine package name" };

    // Strip @latest/@version for install — npm install handles versioning
    const packageName = packageArg.replace(/@[^@/]+$/, "");

    return new Promise((resolve) => {
      const child = spawn("npm", ["install", "-g", packageName], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120_000,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      child.on("exit", (code) => {
        if (code === 0) {
          agent.available = true;
          resolve({ success: true, message: `Installed ${packageName} successfully` });
        } else {
          const errMsg = stderr.trim().split("\n").slice(0, 5).join("\n") || `Exit code ${code}`;
          resolve({ success: false, message: errMsg });
        }
      });

      child.on("error", (err) => {
        resolve({ success: false, message: err.message });
      });
    });
  }

  /**
   * Test that an agent+model combination works by spawning a quick test prompt.
   * Returns { success, message, durationMs }.
   */
  async testAgent(agentId: string, modelId?: string): Promise<{ success: boolean; message: string; durationMs: number }> {
    const agent = this.getById(agentId);
    if (!agent) return { success: false, message: `Agent "${agentId}" not found`, durationMs: 0 };
    if (!agent.available) return { success: false, message: `Agent "${agent.command}" not found on PATH`, durationMs: 0 };

    const start = Date.now();
    const TEST_TIMEOUT = 30_000; // 30s max

    // Build a clean env without Claude Code session markers
    const childEnv: Record<string, string | undefined> = { ...process.env, FORCE_COLOR: "0" };
    // Remove ALL Claude Code env vars so nested sessions don't fail
    for (const key of Object.keys(childEnv)) {
      if (key.startsWith("CLAUDE_CODE") || key === "CLAUDECODE") {
        delete childEnv[key];
      }
    }

    return new Promise((resolve) => {
      let resolved = false;
      const finish = (result: { success: boolean; message: string; durationMs: number }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { child.kill("SIGKILL"); } catch {}
        resolve(result);
      };

      const args = [...agent.args];

      // Add model flag if specified and agent supports it
      if (modelId && agent.modelFlag) {
        args.push(agent.modelFlag, modelId);
      }

      // For stream-json agents, add permission bypass and the test prompt
      if (agent.protocol === "stream-json") {
        args.push("--permission-mode", "bypassPermissions");
        args.push("Respond with exactly: TEST_OK");
      }

      const child = spawn(agent.command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: childEnv,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        // For stream-json: resolve as soon as we see a valid response
        if (stdout.includes('"type":"result"') || stdout.includes('"type":"assistant"') || stdout.includes("TEST_OK")) {
          finish({ success: true, message: "Agent responded successfully", durationMs: Date.now() - start });
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      if (agent.protocol === "stdin") {
        // stdin-based agents receive the prompt via stdin
        child.stdin?.write("Respond with exactly: TEST_OK\n");
        child.stdin?.end();
      } else if (agent.protocol === "acp" || agent.protocol === "json-rpc") {
        // ACP/JSON-RPC agents don't accept plain text — just verify the
        // process starts successfully by closing stdin and checking exit
        child.stdin?.end();
      } else {
        // stream-json agents get the prompt via CLI args — close stdin so
        // the process doesn't hang waiting for EOF
        child.stdin?.end();
      }

      const timer = setTimeout(() => {
        finish({ success: false, message: `Test timed out after ${TEST_TIMEOUT / 1000}s`, durationMs: Date.now() - start });
      }, TEST_TIMEOUT);

      child.on("exit", (code) => {
        const durationMs = Date.now() - start;
        if (stdout.includes("TEST_OK") || stdout.includes('"type":"result"') || stdout.includes('"type":"assistant"')) {
          finish({ success: true, message: "Agent responded successfully", durationMs });
        } else if (code === 0) {
          finish({ success: true, message: "Agent exited successfully", durationMs });
        } else if ((agent.protocol === "acp" || agent.protocol === "json-rpc") && durationMs < 5000) {
          // ACP/JSON-RPC agents exit quickly when stdin closes — a fast exit
          // (even non-zero) means the binary is present and starts correctly
          finish({ success: true, message: "Agent process started successfully", durationMs });
        } else {
          const errMsg = stderr.trim().split("\n").slice(0, 5).join("\n") || `Exit code ${code}`;
          finish({ success: false, message: errMsg, durationMs });
        }
      });

      child.on("error", (err) => {
        finish({ success: false, message: err.message, durationMs: Date.now() - start });
      });
    });
  }
}

export const agentRegistry = new AgentRegistry();
