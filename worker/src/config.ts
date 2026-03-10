import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  workDir: process.env.WORK_DIR || "/tmp/autosoftware-workspaces",
  defaultScanBudget: parseFloat(process.env.DEFAULT_SCAN_BUDGET || "2.0"),
  defaultTaskBudget: parseFloat(process.env.DEFAULT_TASK_BUDGET || "10.0"),
  apiKeyEncryptionSecret: process.env.API_KEY_ENCRYPTION_SECRET || "",
};
