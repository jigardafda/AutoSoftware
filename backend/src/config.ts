import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  port: parseInt(process.env.PORT || "5002"),
  databaseUrl: process.env.DATABASE_URL!,
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5001",
  backendUrl: process.env.BACKEND_URL || "http://localhost:5002",
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  },
  gitlab: {
    clientId: process.env.GITLAB_CLIENT_ID || "",
    clientSecret: process.env.GITLAB_CLIENT_SECRET || "",
  },
  bitbucket: {
    clientId: process.env.BITBUCKET_CLIENT_ID || "",
    clientSecret: process.env.BITBUCKET_CLIENT_SECRET || "",
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  apiKeyEncryptionSecret: process.env.API_KEY_ENCRYPTION_SECRET || "",
};
