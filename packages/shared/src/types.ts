export type OAuthProvider = "github" | "gitlab" | "bitbucket";
export type RepoStatus = "idle" | "scanning" | "error";
export type TaskType = "improvement" | "bugfix" | "feature" | "refactor" | "security";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "planning" | "awaiting_input" | "planned" | "pending" | "in_progress" | "completed" | "failed" | "cancelled";
export type TaskSource = "auto_scan" | "manual";
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
