import { registerAdapter } from "./registry.js";
import { linearAdapter } from "./providers/linear.js";
import { githubIssuesAdapter } from "./providers/github-issues.js";
import { jiraAdapter } from "./providers/jira.js";
import { sentryAdapter } from "./providers/sentry.js";
import { azureDevOpsAdapter } from "./providers/azure-devops.js";
import { asanaAdapter } from "./providers/asana.js";

registerAdapter(linearAdapter);
registerAdapter(githubIssuesAdapter);
registerAdapter(jiraAdapter);
registerAdapter(sentryAdapter);
registerAdapter(azureDevOpsAdapter);
registerAdapter(asanaAdapter);

export { getAdapter, getAllAdapters } from "./registry.js";
export { encryptToken, decryptToken, getValidAccessToken } from "./token-manager.js";
