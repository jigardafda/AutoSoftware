import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  workDir: process.env.WORK_DIR || "/tmp/autosoftware-workspaces",
  defaultScanBudget: parseFloat(process.env.DEFAULT_SCAN_BUDGET || "2.0"),
  defaultTaskBudget: parseFloat(process.env.DEFAULT_TASK_BUDGET || "10.0"),
};
