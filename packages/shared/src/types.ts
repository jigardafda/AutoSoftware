export type OAuthProvider = "github" | "gitlab" | "bitbucket";
export type RepoStatus = "idle" | "scanning" | "error";
export type TaskType = "improvement" | "bugfix" | "feature" | "refactor" | "security";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "planning" | "awaiting_input" | "planned" | "pending" | "in_progress" | "completed" | "failed" | "cancelled";
export type TaskSource = "auto_scan" | "manual" | "external_import" | "embed";
export type ScanStatus = "in_progress" | "completed" | "failed";

export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  providers: OAuthProvider[];
}

export interface RepositoryDTO {
  id: string;
  provider: OAuthProvider;
  fullName: string;
  defaultBranch: string;
  isActive: boolean;
  scanInterval: number;
  lastScannedAt: string | null;
  status: RepoStatus;
}

export interface TaskDTO {
  id: string;
  repositoryId: string;
  repositoryName: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  source: TaskSource;
  planningRound: number;
  enhancedPlan: string | null;
  affectedFiles: string[];
  pullRequestUrl: string | null;
  pullRequestStatus: string | null;
  scanResult?: {
    id: string;
    scannedAt: string;
    status: string;
    summary: string | null;
    tasksCreated: number;
  } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  planningQuestions?: PlanningQuestionDTO[];
}

export interface PlanningQuestionDTO {
  id: string;
  questionKey: string;
  round: number;
  label: string;
  type: "select" | "multi_select" | "confirm";
  options: { value: string; label: string }[];
  answer: string | string[] | boolean | null;
  required: boolean;
  sortOrder: number;
}

export interface SubmitAnswersInput {
  answers: Record<string, string | string[] | boolean>;
}

export interface ScanResultDTO {
  id: string;
  repositoryId: string;
  scannedAt: string;
  status: ScanStatus;
  summary: string | null;
  tasksCreated: number;
}

export interface CreateTaskInput {
  repositoryId: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
}

export interface ConnectRepoInput {
  provider: OAuthProvider;
  providerRepoId: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch?: string;
}

export interface UpdateRepoInput {
  isActive?: boolean;
  scanInterval?: number;
  settings?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiError {
  data?: never;
  error: { message: string; code?: string };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// --- Integration types ---

export type IntegrationProvider = "linear" | "github_issues" | "jira" | "sentry" | "azure_devops" | "asana";
export type IntegrationAuthType = "oauth2" | "api_token";
export type IntegrationStatus = "connected" | "error" | "expired";
export type IntegrationCategory = "project_management" | "monitoring";

export interface IntegrationProviderMeta {
  type: IntegrationProvider;
  name: string;
  category: IntegrationCategory;
  authMethod: IntegrationAuthType;
  description: string;
  itemNoun: string;
  configFields?: { key: string; label: string; placeholder: string; required: boolean }[];
}

export interface ExternalProject {
  id: string;
  name: string;
  key: string;
  url: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
}

export interface ExternalItem {
  id: string;
  title: string;
  description: string;
  url: string | null;
  type: string;
  status: string;
  priority: string | null;
  labels: string[];
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  itemType: "issue" | "bug" | "story" | "error" | "incident" | "alert" | "work_item";
  metadata: Record<string, unknown>;
}

export interface ExternalItemDetail extends ExternalItem {
  comments: { id: string; author: string; body: string; createdAt: string }[];
  stackTrace: string | null;
  rawPayload: Record<string, unknown>;
}

export interface IntegrationDTO {
  id: string;
  provider: IntegrationProvider;
  authType: IntegrationAuthType;
  status: IntegrationStatus;
  displayName: string;
  accountEmail: string | null;
  config: Record<string, unknown>;
  lastSyncedAt: string | null;
  lastError: string | null;
  linkCount: number;
  createdAt: string;
}

export interface IntegrationLinkDTO {
  id: string;
  integrationId: string;
  projectId: string;
  externalProjectId: string;
  externalProjectName: string;
  externalProjectKey: string;
  externalProjectUrl: string | null;
  lastSyncedAt: string | null;
  importCount: number;
  integration?: { provider: IntegrationProvider; displayName: string };
}

// --- Embed types ---

export type EmbedScreeningStatus = "pending" | "screening" | "needs_input" | "scored" | "approved" | "rejected";

export interface EmbedConfigDTO {
  id: string;
  projectId: string;
  enabled: boolean;
  title: string;
  welcomeMessage: string | null;
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  fontFamily: string;
  scoreThreshold: number;
  maxFileSize: number;
  maxTotalSize: number;
  allowedFileTypes: string[];
  language: string;
}

export interface EmbedSubmissionDTO {
  id: string;
  projectId: string;
  title: string;
  description: string;
  inputMethod: string;
  screeningStatus: EmbedScreeningStatus;
  screeningScore: number | null;
  screeningReason: string | null;
  clarificationRound: number;
  taskId: string | null;
  attachments: { filename: string; mimeType: string; size: number }[];
  questions?: EmbedQuestionDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface EmbedQuestionDTO {
  id: string;
  questionKey: string;
  round: number;
  label: string;
  type: "select" | "multi_select" | "confirm" | "text";
  options: { value: string; label: string }[];
  answer: string | string[] | boolean | null;
  required: boolean;
  sortOrder: number;
}

export interface UpdateEmbedConfigInput {
  enabled?: boolean;
  title?: string;
  welcomeMessage?: string | null;
  logoUrl?: string | null;
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  scoreThreshold?: number;
  maxFileSize?: number;
  maxTotalSize?: number;
  allowedFileTypes?: string[];
  language?: string;
}
