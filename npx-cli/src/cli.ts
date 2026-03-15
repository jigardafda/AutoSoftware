// Suppress deprecation warnings from third-party packages (e.g. http-proxy using util._extend)
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "DeprecationWarning") return;
  console.warn(warning);
});

import { Command } from "commander";
import chalk from "chalk";
import { startLocalServer } from "./local-server.js";

const program = new Command();

program
  .name("auto-software")
  .description("AI-powered code analysis and improvement platform - run locally")
  .version("0.1.0");

// Default command: start the local server
program
  .command("start", { isDefault: true })
  .description("Start the local AutoSoftware server (default)")
  .option("-p, --port <number>", "backend API port", "8002")
  .option("--frontend-port <number>", "frontend port", "8001")
  .option("--no-open", "do not auto-open the browser")
  .option(
    "--data-dir <path>",
    "directory for local data storage",
    `${process.env.HOME}/.auto-software`
  )
  .option(
    "-f, --force",
    "kill any existing Auto Software instance before starting"
  )
  .action(async (options) => {
    console.log(
      chalk.bold.cyan(`
    ╔═══════════════════════════════════════╗
    ║         Auto Software  v0.1.0        ║
    ║   AI-powered code analysis platform  ║
    ╚═══════════════════════════════════════╝
`)
    );

    try {
      await startLocalServer({
        port: parseInt(options.port, 10),
        frontendPort: parseInt(options.frontendPort, 10),
        open: options.open,
        dataDir: options.dataDir,
        force: options.force ?? false,
      });
    } catch (err) {
      console.error(chalk.red("\nFatal error:"), err);
      process.exit(1);
    }
  });

// Review command: AI-powered PR/MR code review
program
  .command("review <pr-url>")
  .description("AI-powered code review for a pull request or merge request")
  .option("--agent <id>", "agent to use (claude-code, codex, gemini, aider, amp)")
  .option("--gitlab-token <token>", "GitLab personal access token")
  .option("--bitbucket-token <token>", "Bitbucket app password")
  .option(
    "--data-dir <path>",
    "directory for local data storage",
    `${process.env.HOME}/.auto-software`
  )
  .action(async (prUrl: string, options: any) => {
    const { runReview } = await import("./review.js");
    await runReview(prUrl, {
      agent: options.agent,
      gitlabToken: options.gitlabToken,
      bitbucketToken: options.bitbucketToken,
      dataDir: options.dataDir,
    });
  });

program.parse();
