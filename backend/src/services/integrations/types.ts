import type {
  IntegrationProvider,
  IntegrationProviderMeta,
  ExternalProject,
  ExternalItem,
  ExternalItemDetail,
  TaskType,
  TaskPriority,
} from "@autosoftware/shared";

export interface IntegrationAdapter {
  readonly provider: IntegrationProvider;
  readonly meta: IntegrationProviderMeta;

  getOAuthUrl?(state: string, redirectUri: string): string;
  exchangeCode?(code: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    accountId?: string;
    accountEmail?: string;
    config?: Record<string, unknown>;
  }>;

  validateToken?(token: string, config: Record<string, unknown>): Promise<{
    valid: boolean;
    accountEmail?: string;
    displayName?: string;
  }>;

  listProjects(
    accessToken: string,
    config: Record<string, unknown>
  ): Promise<ExternalProject[]>;

  listItems(
    accessToken: string,
    config: Record<string, unknown>,
    externalProjectId: string,
    options?: { cursor?: string; limit?: number; search?: string }
  ): Promise<{ items: ExternalItem[]; nextCursor: string | null; total: number | null }>;

  getItemDetail(
    accessToken: string,
    config: Record<string, unknown>,
    externalProjectId: string,
    itemId: string
  ): Promise<ExternalItemDetail>;

  mapToTaskFields(item: ExternalItem): {
    title: string;
    description: string;
    type: TaskType;
    priority: TaskPriority;
  };
}
