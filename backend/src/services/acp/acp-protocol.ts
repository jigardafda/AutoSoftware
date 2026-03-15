/**
 * ACP (Agent Client Protocol) types — re-exported from the official SDK.
 */

export type {
  SessionNotification,
  SessionUpdate,
  ToolCall,
  ContentBlock,
  ContentChunk,
  Usage,
  StopReason,
  PromptRequest,
  PromptResponse,
  NewSessionRequest,
  NewSessionResponse,
  InitializeRequest,
  InitializeResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  Client,
} from "@agentclientprotocol/sdk";

export {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
