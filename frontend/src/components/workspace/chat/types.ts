/**
 * Chat entry types for the workspace chat interface.
 * Models all possible ACP event types as displayable chat entries.
 */

export type ChatEntryType =
  | "user_message"
  | "agent_message"
  | "thinking"
  | "tool_call"
  | "file_change"
  | "permission_request"
  | "system"
  | "error"
  | "usage_update"
  | "action_buttons";

export type ToolCallStatus = "running" | "success" | "error" | "denied";

export type PermissionPolicy = "auto" | "supervised" | "plan";

export interface Attachment {
  id: string;
  type: "image" | "file";
  name: string;
  mimeType: string;
  size: number;
  /** base64-encoded data */
  data: string;
  /** Object URL for local preview (not persisted) */
  previewUrl?: string;
  /** Server-served URL for viewing after reload (when base64 data is gone) */
  serverUrl?: string;
}

export interface ChatEntry {
  id: string;
  type: ChatEntryType;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  attachments?: Attachment[];
}

export interface ToolCallEntry extends ChatEntry {
  type: "tool_call";
  metadata: {
    toolName: string;
    toolInput?: string;
    status: ToolCallStatus;
    result?: string;
    command?: string;
  };
}

export interface FileChangeEntry extends ChatEntry {
  type: "file_change";
  metadata: {
    filename: string;
    additions?: number;
    deletions?: number;
    status: "modified" | "added" | "deleted";
  };
}

export interface PermissionRequestEntry extends ChatEntry {
  type: "permission_request";
  metadata: {
    requestId: string;
    toolName?: string;
    toolInput?: string;
    status: "pending" | "approved" | "denied";
    options?: Array<{
      optionId: string;
      kind: string;
      label?: string;
    }>;
  };
}

export type SelectionMode = "single" | "multi" | "button";

export interface ActionChoice {
  id: string;
  label: string;
  value: string;
  prompt: string;
}

/** @deprecated Use ActionChoice instead */
export interface ActionButton {
  id: string;
  label: string;
  prompt: string;
  variant?: "default" | "outline" | "destructive";
  icon?: string;
}

export interface ActionButtonsEntry extends ChatEntry {
  type: "action_buttons";
  metadata: {
    question?: string;
    choices: ActionChoice[];
    selectionMode: SelectionMode;
    /** Legacy field — kept for backward compat */
    buttons?: ActionButton[];
    label?: string;
  };
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextWindow: number;
  costUsd: number;
}

export interface ChangesStats {
  filesChanged: number;
  additions: number;
  deletions: number;
}
