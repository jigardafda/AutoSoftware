import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, access, constants } from "node:fs/promises";
import { accessSync, constants as fsConstants } from "node:fs";
import { execFile, fork, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import chalk from "chalk";
import ora from "ora";
import httpProxy from "http-proxy";
import { LocalDatabase } from "./embedded-db.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the project root — either the bundle (published) or the monorepo (dev)
function resolveProjectRoot(): { root: string; bundled: boolean } {
  // When published: npx-cli/src/local-server.ts (or bin/cli.js) -> npx-cli/bundle/
  const bundlePath = path.resolve(__dirname, "../bundle");
  // When running from monorepo: npx-cli/src -> npx-cli -> AutoSoftware/
  const monoRoot = path.resolve(__dirname, "../..");

  try {
    // Check if bundle exists (published npm package)
    const bundleBackend = path.join(bundlePath, "backend", "src", "index.ts");
    accessSync(bundleBackend, fsConstants.R_OK);
    return { root: bundlePath, bundled: true };
  } catch {
    // Fall back to monorepo root (development)
    return { root: monoRoot, bundled: false };
  }
}

const { root: PROJECT_ROOT, bundled: IS_BUNDLED } = resolveProjectRoot();

export interface LocalServerOptions {
  port: number;
  frontendPort: number;
  open: boolean;
  dataDir: string;
  force: boolean;
}

interface LocalConfig {
  sessionSecret: string;
  apiKeyEncryptionSecret: string;
}

async function loadOrCreateConfig(dataDir: string): Promise<LocalConfig> {
  const configPath = path.join(dataDir, "config.json");

  try {
    await access(configPath, constants.R_OK);
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as LocalConfig;

    // Ensure both secrets exist (migration from older config)
    if (!config.sessionSecret) {
      config.sessionSecret = crypto.randomBytes(32).toString("hex");
    }
    if (!config.apiKeyEncryptionSecret) {
      config.apiKeyEncryptionSecret = crypto.randomBytes(32).toString("hex");
    }

    await writeFile(configPath, JSON.stringify(config, null, 2));
    return config;
  } catch {
    // First run — generate fresh secrets
    const config: LocalConfig = {
      sessionSecret: crypto.randomBytes(32).toString("hex"),
      apiKeyEncryptionSecret: crypto.randomBytes(32).toString("hex"),
    };

    await mkdir(dataDir, { recursive: true });
    await writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.gray(`Created config at ${configPath}`));
    return config;
  }
}

async function installBundleDeps(): Promise<void> {
  if (!IS_BUNDLED) return;

  // npm publish may strip or break node_modules (especially file: symlinks).
  // Check for @autosoftware/shared specifically — it's the most fragile dependency.
  const sharedInBackend = path.join(PROJECT_ROOT, "backend", "node_modules", "@autosoftware", "shared");
  try {
    await access(sharedInBackend, constants.R_OK);
    return; // Already installed correctly
  } catch {
    // Need to install (missing or broken symlink)
  }

  const spinner = ora("Installing bundle dependencies (first run)...").start();

  const dirs = ["packages/shared", "backend", "worker"];
  for (const dir of dirs) {
    const dirPath = path.join(PROJECT_ROOT, dir);
    try {
      await execFileAsync("npm", ["install", "--omit=dev", "--ignore-scripts"], {
        cwd: dirPath,
        env: { ...process.env },
        timeout: 120_000,
      });
    } catch (err: unknown) {
      spinner.fail(chalk.red(`Failed to install dependencies in ${dir}`));
      throw err;
    }
  }

  spinner.succeed(chalk.green("Bundle dependencies installed"));
}

async function runPrismaMigrations(databaseUrl: string): Promise<void> {
  const spinner = ora("Running database migrations...").start();

  try {
    const configPath = path.join(PROJECT_ROOT, "prisma.config.ts");
    const { stdout, stderr } = await execFileAsync(
      "npx",
      ["prisma", "migrate", "deploy", "--config", configPath],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
        timeout: 120_000,
      }
    );

    if (stderr && !stderr.includes("Already in sync")) {
      console.log(chalk.gray(stderr));
    }

    spinner.succeed(chalk.green("Database migrations applied"));
  } catch (err: unknown) {
    spinner.fail(chalk.red("Migration failed"));
    const message = err instanceof Error ? err.message : String(err);
    // If there is stdout/stderr on the error, print it
    if (typeof err === "object" && err !== null) {
      const execErr = err as { stdout?: string; stderr?: string };
      if (execErr.stdout) console.log(execErr.stdout);
      if (execErr.stderr) console.error(execErr.stderr);
    }
    throw new Error(`Prisma migrate deploy failed: ${message}`);
  }
}

async function generatePrismaClient(databaseUrl: string): Promise<void> {
  const spinner = ora("Generating Prisma client...").start();

  try {
    await execFileAsync("npx", ["prisma", "generate"], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      timeout: 120_000,
    });

    spinner.succeed(chalk.green("Prisma client generated"));
  } catch (err: unknown) {
    spinner.fail(chalk.red("Prisma generate failed"));
    throw err;
  }
}

function startBackendProcess(
  env: Record<string, string>,
  isShuttingDownFn: () => boolean
): ChildProcess {
  const backendEntry = path.join(PROJECT_ROOT, "backend", "src", "index.ts");
  // NODE_PATH ensures generated/prisma can resolve @prisma/client from backend's node_modules
  const nodePath = [
    path.join(PROJECT_ROOT, "backend", "node_modules"),
    process.env.NODE_PATH,
  ].filter(Boolean).join(path.delimiter);

  const child = fork(backendEntry, [], {
    cwd: path.join(PROJECT_ROOT, "backend"),
    env: { ...process.env, ...env, NODE_PATH: nodePath },
    execArgv: ["--import", "tsx"],
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  child.stdout?.on("data", (data: Buffer) => {
    if (isShuttingDownFn()) return;
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      console.log(chalk.blue("[backend]"), line);
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    if (isShuttingDownFn()) return;
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      console.error(chalk.blue("[backend]"), chalk.yellow(line));
    }
  });

  child.on("error", (err) => {
    if (isShuttingDownFn()) return;
    console.error(chalk.red("[backend] Process error:"), err.message);
  });

  return child;
}

function startWorkerProcess(
  env: Record<string, string>,
  isShuttingDownFn: () => boolean
): ChildProcess {
  const workerEntry = path.join(PROJECT_ROOT, "worker", "src", "index.ts");

  // NODE_PATH ensures generated/prisma can resolve @prisma/client from worker's node_modules
  const workerNodePath = [
    path.join(PROJECT_ROOT, "worker", "node_modules"),
    process.env.NODE_PATH,
  ].filter(Boolean).join(path.delimiter);

  const child = fork(workerEntry, [], {
    cwd: path.join(PROJECT_ROOT, "worker"),
    env: { ...process.env, ...env, NODE_PATH: workerNodePath },
    execArgv: ["--import", "tsx"],
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  child.stdout?.on("data", (data: Buffer) => {
    if (isShuttingDownFn()) return;
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      console.log(chalk.magenta("[worker]"), line);
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    if (isShuttingDownFn()) return;
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      console.error(chalk.magenta("[worker]"), chalk.yellow(line));
    }
  });

  child.on("error", (err) => {
    if (isShuttingDownFn()) return;
    console.error(chalk.red("[worker] Process error:"), err.message);
  });

  return child;
}

function startFrontendProxy(
  frontendPort: number,
  backendPort: number,
  isShuttingDownFn: () => boolean
): ReturnType<typeof createHttpServer> {
  const frontendDistDir = path.join(PROJECT_ROOT, "frontend", "dist");
  const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${backendPort}`,
    ws: true,
  });

  proxy.on("error", (err, _req, res) => {
    if (isShuttingDownFn()) return;
    console.error(chalk.yellow("[proxy] Error:"), err.message);
    if (res && "writeHead" in res && typeof res.writeHead === "function") {
      (res as ServerResponse).writeHead(502, { "Content-Type": "text/plain" });
      (res as ServerResponse).end("Backend unavailable. It may still be starting up.");
    }
  });

  const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";

    // Proxy API, embed, and WebSocket requests to the backend
    if (
      url.startsWith("/api/") ||
      url.startsWith("/embed/") ||
      url.startsWith("/webhooks/")
    ) {
      proxy.web(req, res);
      return;
    }

    // Serve static frontend files
    try {
      let filePath: string;

      if (url === "/" || url === "") {
        filePath = path.join(frontendDistDir, "index.html");
      } else {
        // Strip query params
        const cleanUrl = url.split("?")[0];
        filePath = path.join(frontendDistDir, cleanUrl);
      }

      try {
        await access(filePath, constants.R_OK);
      } catch {
        // SPA fallback: serve index.html for any route not found on disk
        filePath = path.join(frontendDistDir, "index.html");
      }

      let content = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();

      // Inject LOCAL_MODE flag into HTML so the frontend knows it's running via CLI
      if (ext === ".html") {
        const injection = `<script>window.__LOCAL_MODE__=true</script>`;
        content = Buffer.from(
          content.toString().replace("<head>", `<head>${injection}`)
        );
      }
      const mimeTypes: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".map": "application/json",
      };

      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      });
      res.end(content);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  });

  // Handle WebSocket upgrades
  server.on("upgrade", (req, socket, head) => {
    proxy.ws(req, socket, head);
  });

  return server;
}

async function waitForBackendReady(port: number, timeoutMs: number = 30_000): Promise<void> {
  const spinner = ora("Waiting for backend to be ready...").start();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        spinner.succeed(chalk.green("Backend is ready"));
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  spinner.fail(chalk.red("Backend did not become ready in time"));
  throw new Error(`Backend failed to start within ${timeoutMs}ms`);
}

async function ensureFrontendBuilt(): Promise<void> {
  const distDir = path.join(PROJECT_ROOT, "frontend", "dist");

  try {
    await access(path.join(distDir, "index.html"), constants.R_OK);
    console.log(chalk.gray("Frontend build found."));
  } catch {
    if (IS_BUNDLED) {
      throw new Error("Frontend build missing from bundle. The npm package may be corrupted.");
    }
    const spinner = ora("Building frontend (first run)...").start();
    try {
      await execFileAsync("npm", ["run", "build"], {
        cwd: path.join(PROJECT_ROOT, "frontend"),
        env: { ...process.env },
        timeout: 300_000,
      });
      spinner.succeed(chalk.green("Frontend built successfully"));
    } catch (err) {
      spinner.fail(chalk.red("Frontend build failed"));
      throw err;
    }
  }
}

/**
 * Check if the CLI's embedded server is already running at the given port.
 */
export async function isServerRunning(port: number = 8002): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure the CLI's embedded server is running.
 * If it's already up, returns immediately.
 * If not, spawns `auto-software start` as a detached background process and waits for it.
 */
export async function ensureServerRunning(options?: {
  port?: number;
  frontendPort?: number;
  dataDir?: string;
}): Promise<void> {
  const port = options?.port ?? 8002;
  const frontendPort = options?.frontendPort ?? 8001;
  const dataDir = options?.dataDir ?? `${process.env.HOME}/.auto-software`;

  if (await isServerRunning(port)) {
    return; // Already running
  }

  const spinner = ora("Starting Auto Software server in the background...").start();

  // Spawn the CLI's own start command as a detached process
  const { spawn } = await import("node:child_process");
  const cliPath = process.argv[1]; // Path to the currently running CLI script

  const child = spawn(process.execPath, [cliPath, "start", "--port", String(port), "--frontend-port", String(frontendPort), "--data-dir", dataDir, "--no-open"], {
    detached: true,
    stdio: "ignore",
  });

  child.unref(); // Let the child run independently

  // Wait for the server to become ready
  const timeoutMs = 60_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await isServerRunning(port)) {
      spinner.succeed(chalk.green("Auto Software server is running"));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  spinner.fail(chalk.red("Server did not start in time"));
  throw new Error(`Auto Software server failed to start within ${timeoutMs / 1000}s`);
}

export async function startLocalServer(options: LocalServerOptions): Promise<void> {
  const { port, frontendPort, open: shouldOpen, dataDir, force } = options;

  // 1. Load or create local config
  const config = await loadOrCreateConfig(dataDir);

  // 2. Start embedded PostgreSQL
  const db = new LocalDatabase(dataDir, 5433, force);
  const databaseUrl = await db.start();

  // Set up graceful shutdown
  let isShuttingDown = false;
  const childProcesses: ChildProcess[] = [];
  let frontendServer: ReturnType<typeof createHttpServer> | null = null;

  async function shutdown(signal?: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    // Immediately suppress all PostgreSQL output (before AsyncExitHook fires)
    db.markShuttingDown();

    console.log(chalk.yellow(`\nGracefully shutting down Auto Software...`));

    // Suppress any uncaught errors and noisy output during shutdown
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    process.on("uncaughtException", () => {});
    process.on("unhandledRejection", () => {});

    // Mute stdout/stderr to suppress pg/embedded-postgres shutdown noise
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;

    // Stop child processes
    for (const child of childProcesses) {
      try {
        child.kill("SIGTERM");
      } catch {
        // Already dead
      }
    }

    // Stop frontend server
    if (frontendServer) {
      frontendServer.close();
    }

    // Wait a moment for children to exit, then stop DB (with timeout in case
    // embedded-postgres AsyncExitHook already stopped it and .stop() hangs)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await Promise.race([
      db.stop(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    // Restore stdout/stderr for our own message, then exit cleanly
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    console.log(chalk.green("Auto Software stopped. See you next time!"));
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    // 3. Install bundle dependencies if needed (npm strips node_modules on publish)
    await installBundleDeps();

    // 4. Run Prisma migrations (skip generate when bundled — client is pre-built)
    if (!IS_BUNDLED) {
      await generatePrismaClient(databaseUrl);
    }
    await runPrismaMigrations(databaseUrl);

    // 5. Prepare environment variables
    const workDir = path.join(dataDir, "workspaces");
    await mkdir(workDir, { recursive: true });

    const env: Record<string, string> = {
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: config.sessionSecret,
      API_KEY_ENCRYPTION_SECRET: config.apiKeyEncryptionSecret,
      FRONTEND_URL: `http://localhost:${frontendPort}`,
      BACKEND_URL: `http://localhost:${port}`,
      PORT: String(port),
      WORK_DIR: workDir,
      NODE_ENV: "development",
      IS_BUNDLED: "1",
      // Pass through any existing Anthropic keys
      ...(process.env.ANTHROPIC_API_KEY
        ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }
        : {}),
      ...(process.env.CLAUDE_CODE_OAUTH_TOKEN
        ? { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN }
        : {}),
    };

    // 5. Ensure frontend is built
    await ensureFrontendBuilt();

    // 6. Start backend
    const backendSpinner = ora("Starting backend server...").start();
    const backendChild = startBackendProcess(env, () => isShuttingDown);
    childProcesses.push(backendChild);

    backendChild.on("exit", (code) => {
      if (!isShuttingDown) {
        console.error(chalk.red(`[backend] Process exited with code ${code}`));
      }
    });

    backendSpinner.succeed(chalk.green("Backend process started"));

    // 7. Start worker
    const workerSpinner = ora("Starting worker...").start();
    const workerChild = startWorkerProcess(env, () => isShuttingDown);
    childProcesses.push(workerChild);

    workerChild.on("exit", (code) => {
      if (!isShuttingDown) {
        console.error(chalk.red(`[worker] Process exited with code ${code}`));
      }
    });

    workerSpinner.succeed(chalk.green("Worker process started"));

    // 8. Wait for backend to be ready
    await waitForBackendReady(port);

    // 9. Start frontend proxy server (serves static build + proxies /api to backend)
    frontendServer = startFrontendProxy(frontendPort, port, () => isShuttingDown);

    await new Promise<void>((resolve, reject) => {
      frontendServer!.listen(frontendPort, "0.0.0.0", () => resolve());
      frontendServer!.on("error", reject);
    });

    // 10. Print ready message
    const appUrl = `http://localhost:${frontendPort}`;
    console.log(
      chalk.bold.green(`
  ╔═══════════════════════════════════════════════╗
  ║            Auto Software is running!          ║
  ╠═══════════════════════════════════════════════╣
  ║                                               ║
  ║  App:      ${chalk.cyan(appUrl.padEnd(34))}║
  ║  Backend:  ${chalk.cyan(`http://localhost:${port}`.padEnd(34))}║
  ║  Data:     ${chalk.gray(dataDir.padEnd(34))}║
  ║                                               ║
  ║  Press ${chalk.yellow("Ctrl+C")} to stop                        ║
  ╚═══════════════════════════════════════════════╝
`)
    );

    // 11. Open browser
    if (shouldOpen) {
      try {
        const openModule = await import("open");
        await openModule.default(appUrl);
      } catch {
        console.log(
          chalk.gray(`Open ${appUrl} in your browser to get started.`)
        );
      }
    }

    // Keep the process alive
    await new Promise(() => {
      // This promise never resolves — the process runs until SIGINT/SIGTERM
    });
  } catch (err) {
    await shutdown();
    throw err;
  }
}
