export type OAuthProvider = "github" | "gitlab" | "bitbucket";
export type RepoStatus = "idle" | "scanning" | "error";
export type TaskType = "improvement" | "bugfix" | "feature" | "refactor" | "security";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";
export type TaskSource = "auto_scan" | "manual";
export type ScanStatus = "completed" | "failed";

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
  pullRequestUrl: string | null;
  pullRequestStatus: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
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
