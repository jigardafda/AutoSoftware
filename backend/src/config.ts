import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  databaseUrl: process.env.DATABASE_URL!,
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  backendUrl: process.env.BACKEND_URL || "http://localhost:3000",
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
};
