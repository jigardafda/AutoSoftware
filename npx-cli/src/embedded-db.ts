import EmbeddedPostgres from "embedded-postgres";
import { mkdir, access, readFile, unlink, constants } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import { execFileSync } from "node:child_process";

export class LocalDatabase {
  private pg: EmbeddedPostgres | null = null;
  private dataDir: string;
  private port: number;
  private _shuttingDown = false;
  private _force: boolean;

  constructor(dataDir: string, port: number = 5433, force: boolean = false) {
    this.dataDir = dataDir;
    this.port = port;
    this._force = force;
  }

  /** Mark as shutting down to suppress all PostgreSQL output immediately */
  markShuttingDown(): void {
    this._shuttingDown = true;
  }

  async start(): Promise<string> {
    const spinner = ora("Starting embedded PostgreSQL...").start();

    try {
      const pgDataDir = path.join(this.dataDir, "pgdata");
      await mkdir(pgDataDir, { recursive: true });

      this.pg = new EmbeddedPostgres({
        databaseDir: pgDataDir,
        port: this.port,
        persistent: true,
        onLog: (message: string) => {
          if (!this._shuttingDown) {
            console.log(message);
          }
        },
        onError: (messageOrError: string | Error | unknown) => {
          if (!this._shuttingDown) {
            console.error(messageOrError);
          }
        },
      });

      // Only initialise if the data directory hasn't been set up yet
      const pgVersionFile = path.join(pgDataDir, "PG_VERSION");
      let alreadyInitialised = false;
      try {
        await access(pgVersionFile, constants.R_OK);
        alreadyInitialised = true;
      } catch {
        // Not initialised yet
      }

      if (!alreadyInitialised) {
        await this.pg.initialise();
      }

      // Clean up stale lock file from a previous unclean shutdown
      await this.cleanStalePidFile(pgDataDir);

      await this.pg.start();

      spinner.text = "Creating database...";

      // Create the autosoftware database if it does not exist
      try {
        await this.pg.createDatabase("autosoftware");
      } catch (err: unknown) {
        // Database may already exist — that is fine
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("already exists")) {
          throw err;
        }
      }

      const databaseUrl = `postgresql://postgres:password@localhost:${this.port}/autosoftware`;

      spinner.succeed(
        chalk.green(`PostgreSQL running on port ${this.port}`)
      );

      return databaseUrl;
    } catch (err) {
      spinner.fail(chalk.red("Failed to start PostgreSQL"));
      throw err;
    }
  }

  /**
   * Remove postmaster.pid if the PID inside it is no longer running.
   * This handles unclean shutdowns that leave a stale lock file behind.
   */
  private async cleanStalePidFile(pgDataDir: string): Promise<void> {
    const pidFile = path.join(pgDataDir, "postmaster.pid");
    try {
      await access(pidFile, constants.R_OK);
    } catch {
      return; // No pid file — nothing to clean
    }

    try {
      const content = await readFile(pidFile, "utf-8");
      const pid = parseInt(content.split("\n")[0], 10);
      if (!pid || isNaN(pid)) {
        await unlink(pidFile);
        return;
      }

      // Check if the process is still running
      try {
        process.kill(pid, 0); // signal 0 = existence check, doesn't kill
        // Process IS running — another instance is genuinely active
        if (this._force) {
          console.log(chalk.yellow(`Killing existing Auto Software instance (postgres PID ${pid})...`));
          await this.killExistingInstance(pid);
          // Remove the stale pid file after killing
          await unlink(pidFile).catch(() => {});
        } else {
          throw new Error(
            `Another Auto Software instance (PID ${pid}) is already running. ` +
            `Stop it first, use --force to kill it, or use a different --data-dir.`
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ESRCH") {
          // Process not found — stale pid file, safe to remove
          await unlink(pidFile);
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Another Auto Software")) {
        throw err;
      }
      // Any other error reading/parsing the pid file — just remove it
      await unlink(pidFile).catch(() => {});
    }
  }

  /**
   * Kill an existing Auto Software instance by finding the parent CLI process
   * of the postgres PID and sending SIGTERM (then SIGKILL if needed).
   * This stops frontend, backend, and postgres all at once.
   */
  private async killExistingInstance(postgresPid: number): Promise<void> {
    // Find the parent process (the CLI node process that spawned postgres)
    let parentPid: number | null = null;
    try {
      const ppidStr = execFileSync("ps", ["-o", "ppid=", "-p", String(postgresPid)], {
        encoding: "utf-8",
      }).trim();
      parentPid = parseInt(ppidStr, 10);
    } catch {
      // Can't find parent — just kill the postgres process directly
    }

    // Kill the parent CLI process (which triggers graceful shutdown of all children)
    // If no parent found, kill the postgres process directly
    const targetPid = parentPid && parentPid > 1 ? parentPid : postgresPid;

    try {
      // Send SIGTERM first for graceful shutdown
      process.kill(targetPid, "SIGTERM");

      // Wait up to 5 seconds for the process to exit
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          process.kill(targetPid, 0);
        } catch {
          // Process is gone
          console.log(chalk.green("Previous instance stopped."));
          // Give a moment for the pid file to be cleaned up
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return;
        }
      }

      // Still running — force kill
      console.log(chalk.yellow("Force killing previous instance..."));
      process.kill(targetPid, "SIGKILL");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ESRCH") {
        // Already dead
        return;
      }
      throw err;
    }

    // Also kill postgres directly if we killed the parent and postgres is still alive
    if (targetPid !== postgresPid) {
      try {
        process.kill(postgresPid, "SIGKILL");
      } catch {
        // Already dead
      }
    }

    console.log(chalk.green("Previous instance stopped."));
  }

  async stop(): Promise<void> {
    this._shuttingDown = true;
    if (this.pg) {
      try {
        await this.pg.stop();
        console.log(chalk.gray("PostgreSQL stopped."));
      } catch {
        // Suppress errors during shutdown
      }
      this.pg = null;
    }
  }
}
