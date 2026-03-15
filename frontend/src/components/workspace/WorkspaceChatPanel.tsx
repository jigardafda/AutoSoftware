import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { toast } from "sonner";
import {
  Bot,
  Send,
  Loader2,
  Clock,
  Circle,
  ArrowDown,
  Paperclip,
  X,
  FileText,
  Files,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChatEntryRenderer,
  ContextUsageGauge,
  PermissionPolicySelector,
  extractArtifacts,
  extractToolCallArtifact,
  ArtifactBadge,
  QuickActions,
  buildQuickActions,
} from "@/components/workspace/chat";
import { WorkspaceContextBanner } from "@/components/workspace/WorkspaceContextBanner";
import { ModelSelector } from "@/components/workspace/chat/ModelSelector";
import { SessionSelector } from "@/components/workspace/SessionSelector";
import type { Artifact } from "@/components/workspace/chat/ArtifactDetector";
import type {
  Attachment,
  ChatEntry,
  UsageInfo,
  ToolCallStatus,
} from "@/components/workspace/chat/types";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { ElementRefBadge } from "@/components/workspace/ElementRefBadge";

const API = "/api";
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Helpers to parse ACP WebSocket events into ChatEntry objects ──

function parseACPEvent(raw: Record<string, unknown>): ChatEntry | null {
  const type = raw.type as string;
  const data = raw.data as Record<string, unknown> | string | undefined;
  const timestamp = (raw.timestamp as number) || Date.now();
  const id = crypto.randomUUID();

  switch (type) {
    case "agent_message_chunk": {
      const content =
        typeof data === "object" && data !== null
          ? (data as any).content?.text ||
            (data as any).text ||
            JSON.stringify(data)
          : typeof data === "string"
            ? data
            : "";
      return { id, type: "agent_message", content, timestamp };
    }

    case "agent_thought_chunk": {
      const content =
        typeof data === "object" && data !== null
          ? (data as any).content?.text ||
            (data as any).text ||
            JSON.stringify(data)
          : typeof data === "string"
            ? data
            : "";
      return { id, type: "thinking", content, timestamp };
    }

    case "tool_call": {
      const d = data as Record<string, unknown> | undefined;
      const toolName =
        (d?.toolName as string) || (d?.tool_name as string) || "Tool";
      const toolInput = d?.input ? JSON.stringify(d.input, null, 2) : undefined;
      const toolUseId = (d?.toolUseId as string) || (d?.id as string);
      const summary = `${toolName}${d?.input ? `: ${truncate(JSON.stringify(d.input), 120)}` : ""}`;
      return {
        id,
        type: "tool_call",
        content: summary,
        timestamp,
        metadata: {
          toolName,
          toolInput,
          toolUseId,
          status: "running" as ToolCallStatus,
        },
      };
    }

    case "tool_call_update": {
      const d = data as Record<string, unknown> | undefined;
      const toolName =
        (d?.toolName as string) || (d?.tool_name as string) || "Tool";
      const toolUseId = d?.toolUseId as string;
      const result = d?.result
        ? typeof d.result === "string"
          ? d.result
          : JSON.stringify(d.result, null, 2)
        : undefined;
      const status: ToolCallStatus =
        d?.error || d?.isError ? "error" : "success";
      const summary = `${toolName} ${status === "success" ? "completed" : "failed"}`;
      return {
        id,
        type: "tool_call",
        content: summary,
        timestamp,
        metadata: {
          toolName,
          toolUseId,
          status,
          result: result || (d?.error as string),
        },
      };
    }

    case "plan": {
      const content =
        typeof data === "object" && data !== null
          ? (data as any).plan || JSON.stringify(data, null, 2)
          : typeof data === "string"
            ? data
            : "";
      return { id, type: "system", content: `Plan: ${content}`, timestamp };
    }

    case "usage_update":
      return {
        id,
        type: "usage_update",
        content: "",
        timestamp,
        metadata: data as Record<string, unknown>,
      };

    case "permission_request": {
      const d = data as Record<string, unknown> | undefined;
      const requestId = (d?.requestId as string) || id;
      const toolCall = d?.toolCall as Record<string, unknown> | undefined;
      const toolName =
        (toolCall?.toolName as string) ||
        (toolCall?.tool_name as string) ||
        "Unknown";
      const toolInput = toolCall?.input
        ? JSON.stringify(toolCall.input, null, 2)
        : undefined;
      const options = d?.options as
        | Array<{ optionId: string; kind: string }>
        | undefined;
      return {
        id,
        type: "permission_request",
        content: `${toolName} requires approval`,
        timestamp,
        metadata: { requestId, toolName, toolInput, status: "pending", options },
      };
    }

    case "stderr": {
      const content =
        typeof data === "string" ? data : JSON.stringify(data);
      return { id, type: "error", content, timestamp };
    }

    case "turn_complete":
    case "done":
      return null;

    case "agent_message": {
      const content =
        typeof data === "object" && data !== null
          ? (data as any).text || JSON.stringify(data)
          : typeof data === "string"
            ? data
            : "";
      return { id, type: "agent_message", content, timestamp };
    }

    case "system": {
      const d = data as Record<string, unknown> | undefined;
      if (d?.subtype === "init") {
        return {
          id,
          type: "system",
          content: `Connected to ${(d as any).model || "agent"}`,
          timestamp,
        };
      }
      return null;
    }

    case "action_buttons": {
      const d = data as Record<string, unknown> | undefined;
      return {
        id,
        type: "action_buttons",
        content: "",
        timestamp,
        metadata: {
          question: (d?.question as string) || undefined,
          choices: (d?.choices as any[]) || [],
          selectionMode: (d?.selectionMode as string) || "button",
          buttons: (d?.buttons as any[]) || undefined,
          label: (d?.label as string) || undefined,
        },
      };
    }

    case "text":
    case "tool_result": {
      const content =
        typeof data === "string" ? data : JSON.stringify(data);
      return { id, type: "agent_message", content, timestamp };
    }

    default:
      return null;
  }
}

/** Map DB messages (role-based) back into ChatEntry objects for display.
 *  Merges tool_result entries into their matching tool_call entries by toolUseId. */
function mapDbMessages(messages: any[], workspaceId?: string): ChatEntry[] {
  const roleToType: Record<string, ChatEntry["type"]> = {
    user: "user_message",
    assistant: "agent_message",
    system: "system",
    thinking: "thinking",
    tool_call: "tool_call",
  };

  // First pass: collect all tool_results by toolUseId
  const toolResults = new Map<
    string,
    { result: string; isError: boolean }
  >();
  for (const msg of messages) {
    if (msg.role === "tool_result") {
      const meta =
        msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {};
      const toolUseId = meta.toolUseId as string;
      if (toolUseId) {
        toolResults.set(toolUseId, {
          result: msg.content,
          isError: !!meta.isError,
        });
      }
    }
  }

  // Second pass: build entries, merging tool_results into tool_calls
  const entries: ChatEntry[] = [];
  for (const msg of messages) {
    const meta =
      msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {};

    // Skip tool_results — they're merged into tool_calls above
    if (msg.role === "tool_result") continue;

    const type = roleToType[msg.role] || "system";
    const entry: ChatEntry = {
      id: msg.id || crypto.randomUUID(),
      type,
      content: msg.content,
      timestamp: new Date(msg.createdAt).getTime(),
    };

    // Restore attachment metadata for user messages
    if (
      msg.role === "user" &&
      meta.attachments &&
      Array.isArray(meta.attachments)
    ) {
      entry.attachments = (meta.attachments as any[]).map((a: any) => ({
        id: a.id || crypto.randomUUID(),
        type: a.type || "file",
        name: a.name || "attachment",
        mimeType: a.mimeType || "application/octet-stream",
        size: a.size || 0,
        data: "",
        serverUrl:
          a.filename && workspaceId
            ? `/api/workspaces/${workspaceId}/attachments/${encodeURIComponent(a.filename)}`
            : undefined,
      }));
    }

    // Restore metadata for tool calls — merge in the tool_result
    if (msg.role === "tool_call") {
      const toolUseId = meta.toolUseId as string;
      const result = toolUseId ? toolResults.get(toolUseId) : undefined;
      const status = result
        ? result.isError
          ? ("error" as const)
          : ("success" as const)
        : ("success" as const);
      entry.metadata = {
        toolName: meta.toolName || msg.content,
        toolInput: meta.input
          ? JSON.stringify(meta.input, null, 2)
          : undefined,
        toolUseId,
        status,
        result: result?.result,
      };
      entry.content = `${meta.toolName || msg.content} ${status === "error" ? "failed" : "completed"}`;
    }

    entries.push(entry);
  }

  return entries;
}

/** Pending attachments bar with click-to-preview */
function PendingAttachmentsBar({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}) {
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-2">
        {attachments.map((att) => (
          <div key={att.id} className="relative group">
            <div
              className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
              onClick={() => setPreviewAtt(att)}
            >
              {att.type === "image" && att.previewUrl ? (
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="h-16 w-16 object-cover"
                />
              ) : (
                <div className="h-16 w-20 flex flex-col items-center justify-center gap-1 px-1">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground truncate max-w-full">
                    {att.name}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(att.id);
              }}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      {previewAtt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPreviewAtt(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-auto bg-background p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewAtt(null)}
              className="absolute top-3 right-3 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 p-1.5 shadow-lg z-10 transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            {(() => {
              const isPdf =
                previewAtt.mimeType === "application/pdf" ||
                previewAtt.name.toLowerCase().endsWith(".pdf");
              const isImage =
                previewAtt.type === "image" ||
                previewAtt.mimeType?.startsWith("image/");
              const isText =
                previewAtt.mimeType?.startsWith("text/") ||
                [
                  "json",
                  "xml",
                  "md",
                  "txt",
                  "csv",
                  "log",
                  "yml",
                  "yaml",
                  "js",
                  "ts",
                  "tsx",
                  "py",
                  "sh",
                  "html",
                  "css",
                  "sql",
                ].includes(
                  previewAtt.name.split(".").pop()?.toLowerCase() || ""
                );

              if (isPdf && previewAtt.data) {
                return (
                  <iframe
                    src={`data:application/pdf;base64,${previewAtt.data}`}
                    title={previewAtt.name}
                    className="w-[80vw] h-[85vh] rounded border-0"
                  />
                );
              }
              if (isImage && previewAtt.previewUrl) {
                return (
                  <img
                    src={previewAtt.previewUrl}
                    alt={previewAtt.name}
                    className="max-w-full max-h-[85vh] object-contain rounded"
                  />
                );
              }
              if (isText && previewAtt.data) {
                return (
                  <pre className="p-4 text-sm whitespace-pre-wrap break-words max-w-[80vw] max-h-[85vh] overflow-auto">
                    {atob(previewAtt.data)}
                  </pre>
                );
              }
              return (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">{previewAtt.name}</p>
                  <p className="text-xs mt-1">
                    {previewAtt.mimeType} — {formatBytes(previewAtt.size)}
                  </p>
                </div>
              );
            })()}
            <p className="text-center text-xs text-muted-foreground mt-2">
              {previewAtt.name}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ── Callbacks from workspace detail that the chat panel can optionally hook into ──

export interface WorkspaceChatPanelCallbacks {
  /** Called when a tool_call_update for Bash is received — used to show terminal content */
  onTerminalContent?: (content: {
    toolName: string;
    command?: string;
    output: string;
    isError?: boolean;
  }) => void;
  /** Called when agent working state changes */
  onAgentWorkingChange?: (working: boolean) => void;
  /** Called when entries change */
  onEntriesChange?: (entries: ChatEntry[]) => void;
  /** Called when an artifact is selected from a message */
  onArtifactSelect?: (artifact: Artifact) => void;
  /** Called when changes stats button is clicked */
  onChangesClick?: () => void;
}

export interface ChangesStats {
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface ElementRef {
  tagName: string;
  id: string | null;
  className: string;
  textContent: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  component?: string | null;
  file?: string | null;
  line?: number | null;
  column?: number | null;
  framework?: string | null;
  stack?: Array<{ name: string; file: string | null }>;
  htmlPreview?: string;
}

export interface WorkspaceChatPanelProps {
  workspaceId: string;
  /** Optional workspace data — if not provided, will be fetched */
  workspace?: any;
  /** Show workspace context banner (PR/task info) */
  showContextBanner?: boolean;
  /** Show "Open Workspace" button at bottom (for inline/embedded mode) */
  showOpenWorkspaceButton?: boolean;
  /** Show session selector */
  showSessionSelector?: boolean;
  /** Show model selector + permission policy + attachments */
  showFullInputBar?: boolean;
  /** Compact mode — smaller padding, no session selector */
  compact?: boolean;
  /** Changes stats to show in the input header */
  changesStats?: ChangesStats;
  /** Element references from browser DevTools */
  elementRefs?: ElementRef[];
  /** Called to clear element refs after sending */
  onElementRefsChange?: (refs: ElementRef[]) => void;
  /** Use permission policy from workspace store (full workspace mode) */
  useStorePermissionPolicy?: boolean;
  /** Callbacks */
  callbacks?: WorkspaceChatPanelCallbacks;
  className?: string;
}

export function WorkspaceChatPanel({
  workspaceId,
  workspace: externalWorkspace,
  showContextBanner = false,
  showOpenWorkspaceButton = false,
  showSessionSelector = true,
  showFullInputBar = true,
  compact = false,
  changesStats,
  elementRefs,
  onElementRefsChange,
  useStorePermissionPolicy = false,
  callbacks,
  className,
}: WorkspaceChatPanelProps) {
  const navigate = useNavigate();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [isNewSessionMode, setIsNewSessionMode] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const [localPermissionPolicy, setLocalPermissionPolicy] = useState<"auto" | "supervised" | "plan">("supervised");
  const [retryContent, setRetryContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!externalWorkspace);
  const [workspace, setWorkspace] = useState<any>(externalWorkspace || null);

  // Use workspace store permission policy in full workspace mode
  const { permissionPolicy: storePermissionPolicy, setPermissionPolicy: setStorePermissionPolicy } = useWorkspaceStore();
  const permissionPolicy = useStorePermissionPolicy ? storePermissionPolicy : localPermissionPolicy;
  const setPermissionPolicy = useStorePermissionPolicy ? setStorePermissionPolicy : setLocalPermissionPolicy;

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const agentTextAccum = useRef("");
  const thinkingAccum = useRef("");
  const queuedMessageRef = useRef<string | null>(null);

  const sessionActive = !!acpSessionId;

  // Sync external workspace
  useEffect(() => {
    if (externalWorkspace) {
      setWorkspace(externalWorkspace);
      setIsLoading(false);
    }
  }, [externalWorkspace]);

  // Fetch workspace if not provided externally
  useEffect(() => {
    if (externalWorkspace || !workspaceId) return;

    (async () => {
      try {
        const res = await fetch(`${API}/workspaces/${workspaceId}`, {
          credentials: "include",
        });
        const data = await res.json();
        const ws = data.data ?? data.workspace ?? data;
        setWorkspace(ws);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, [workspaceId, externalWorkspace]);

  // Load saved model preference
  useEffect(() => {
    if (!workspace?.agentId || selectedModelId) return;

    (async () => {
      try {
        const res = await fetch(`${API}/settings`, { credentials: "include" });
        const data = await res.json();
        const saved = data.data?.agentModels?.[workspace.agentId];
        if (saved) setSelectedModelId(saved);
      } catch {
        // ignore
      }
    })();
  }, [workspace?.agentId, selectedModelId]);

  // Session list from workspace data
  const sessions = useMemo(() => {
    if (!workspace?.sessions) return [];
    return workspace.sessions.map((s: any, i: number) => ({
      id: s.id,
      createdAt: s.startedAt || s.createdAt,
      isLatest: i === 0,
    }));
  }, [workspace]);

  // Auto-select latest session on workspace load
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!workspace?.sessions?.length || hasInitialized.current) return;
    if (dbSessionId || isNewSessionMode) return;

    hasInitialized.current = true;
    const latestSession = workspace.sessions[0];
    setDbSessionId(latestSession.id);

    if (latestSession.messages?.length) {
      setEntries(mapDbMessages(latestSession.messages, workspaceId));
    }
  }, [workspace, dbSessionId, isNewSessionMode, workspaceId]);

  // Keep queuedMessage ref in sync
  useEffect(() => {
    queuedMessageRef.current = queuedMessage;
  }, [queuedMessage]);

  // Notify parent of agent working state changes
  useEffect(() => {
    callbacks?.onAgentWorkingChange?.(isAgentWorking);
  }, [isAgentWorking, callbacks]);

  // Notify parent of entries changes
  useEffect(() => {
    callbacks?.onEntriesChange?.(entries);
  }, [entries, callbacks]);

  // WebSocket connection for real-time ACP events
  useEffect(() => {
    if (!workspaceId || !acpSessionId) return;

    const ws = new WebSocket(`${WS_URL}/ws/workspace/${workspaceId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", acpSessionId }));
    };

    let textFlushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushAgentText = () => {
      if (!agentTextAccum.current) return;
      const text = agentTextAccum.current;
      agentTextAccum.current = "";
      setEntries((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === "agent_message") {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + text },
          ];
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "agent_message" as const,
            content: text,
            timestamp: Date.now(),
          },
        ];
      });
    };

    const flushThinking = () => {
      if (!thinkingAccum.current) return;
      const text = thinkingAccum.current;
      thinkingAccum.current = "";
      setEntries((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === "thinking") {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + text },
          ];
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "thinking" as const,
            content: text,
            timestamp: Date.now(),
          },
        ];
      });
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        const acpType = raw.type as string;
        const d =
          typeof raw.data === "object" && raw.data !== null
            ? (raw.data as Record<string, unknown>)
            : undefined;

        if (acpType === "agent_message_chunk" || acpType === "text") {
          setIsAgentWorking(true);
          flushThinking();
          const chunkText =
            (d?.text as string) ||
            (typeof raw.data === "string" ? raw.data : "");
          if (chunkText) {
            agentTextAccum.current += chunkText;
            if (textFlushTimer) clearTimeout(textFlushTimer);
            textFlushTimer = setTimeout(flushAgentText, 80);
          }
          return;
        }

        if (acpType === "agent_thought_chunk") {
          setIsAgentWorking(true);
          const chunkText =
            (d?.text as string) ||
            (typeof raw.data === "string" ? raw.data : "");
          if (chunkText) {
            thinkingAccum.current += chunkText;
            if (textFlushTimer) clearTimeout(textFlushTimer);
            textFlushTimer = setTimeout(flushThinking, 150);
          }
          return;
        }

        if (acpType === "usage_update") {
          if (d) {
            const input = (d.inputTokens as number) || 0;
            const output = (d.outputTokens as number) || 0;
            const cacheCreation =
              (d.cacheCreationInputTokens as number) || 0;
            const cacheRead = (d.cacheReadInputTokens as number) || 0;
            const totalTokens = input + output + cacheCreation + cacheRead;
            const apiContextWindow = (d.contextWindow as number) || 0;
            setUsageInfo((prev) => ({
              inputTokens: input,
              outputTokens: output,
              totalTokens,
              contextWindow:
                apiContextWindow || prev?.contextWindow || 200_000,
              costUsd: (d.totalCost as number) || 0,
            }));
          }
          return;
        }

        if (acpType === "turn_complete" || acpType === "done") {
          setIsAgentWorking(false);
          flushAgentText();
          flushThinking();

          if (queuedMessageRef.current) {
            const msg = queuedMessageRef.current;
            setQueuedMessage(null);
            queuedMessageRef.current = null;
            setTimeout(() => {
              setInputValue(msg);
            }, 300);
          }
          return;
        }

        if (acpType === "tool_call_update") {
          flushAgentText();
          flushThinking();
          const toolUseId = d?.toolUseId as string;
          const result = d?.result
            ? typeof d.result === "string"
              ? d.result
              : JSON.stringify(d.result, null, 2)
            : undefined;
          const isError = !!(d?.error || d?.isError);
          const status: ToolCallStatus = isError ? "error" : "success";

          if (toolUseId) {
            setEntries((prev) => {
              const idx = prev.findIndex(
                (e) =>
                  e.type === "tool_call" &&
                  (e.metadata as any)?.toolUseId === toolUseId
              );
              if (idx !== -1) {
                const existing = prev[idx];
                const meta = existing.metadata as any;
                const updatedMeta = {
                  ...meta,
                  status,
                  result: result || (d?.error as string),
                };

                // Notify parent about terminal-like content
                const tn = (meta.toolName || "").toLowerCase();
                if (
                  tn === "bash" ||
                  tn.includes("terminal") ||
                  tn.includes("command")
                ) {
                  let cmd: string | undefined;
                  try {
                    cmd = JSON.parse(meta.toolInput || "{}")?.command;
                  } catch {
                    // ignore
                  }
                  callbacks?.onTerminalContent?.({
                    toolName: meta.toolName,
                    command: cmd,
                    output: updatedMeta.result || "",
                    isError,
                  });
                }

                return [
                  ...prev.slice(0, idx),
                  {
                    ...existing,
                    content: `${meta.toolName} ${status === "success" ? "completed" : "failed"}`,
                    metadata: updatedMeta,
                  },
                  ...prev.slice(idx + 1),
                ];
              }
              const parsed = parseACPEvent(raw);
              if (parsed) return [...prev, parsed];
              return prev;
            });
          } else {
            const parsed = parseACPEvent(raw);
            if (parsed) setEntries((prev) => [...prev, parsed]);
          }
          return;
        }

        if (acpType === "tool_call") {
          setIsAgentWorking(true);
          flushAgentText();
          flushThinking();
          const toolName =
            (d?.toolName as string) || (d?.tool_name as string) || "Tool";
          const toolInput = d?.input
            ? JSON.stringify(d.input, null, 2)
            : undefined;
          const toolUseId =
            (d?.toolUseId as string) || (d?.id as string);
          const summary = `${toolName}${d?.input ? `: ${truncate(JSON.stringify(d.input), 120)}` : ""}`;

          setEntries((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              type: "tool_call" as const,
              content: summary,
              timestamp: raw.timestamp || Date.now(),
              metadata: {
                toolName,
                toolInput,
                toolUseId,
                status: "running" as ToolCallStatus,
              },
            },
          ]);
          return;
        }

        if (acpType === "terminal_output" || acpType === "stderr") {
          return;
        }

        if (acpType === "system") {
          if (d?.subtype === "init") {
            setEntries((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                type: "system" as const,
                content: `Connected to ${(d as any).model || "agent"}`,
                timestamp: raw.timestamp || Date.now(),
              },
            ]);
          }
          return;
        }

        if (acpType === "error") {
          const content =
            (d?.message as string) ||
            (typeof raw.data === "string"
              ? raw.data
              : JSON.stringify(raw.data));
          setEntries((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              type: "error" as const,
              content,
              timestamp: raw.timestamp || Date.now(),
            },
          ]);
          return;
        }

        const parsed = parseACPEvent(raw);
        if (parsed) {
          flushAgentText();
          flushThinking();
          setEntries((prev) => [...prev, parsed]);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      if (textFlushTimer) clearTimeout(textFlushTimer);
      ws.close();
      wsRef.current = null;
    };
  }, [workspaceId, acpSessionId, callbacks]);

  // File -> Attachment helper
  const fileToAttachment = useCallback(
    (file: File): Promise<Attachment> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve({
            id: crypto.randomUUID(),
            type: file.type.startsWith("image/") ? "image" : "file",
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            data: base64,
            previewUrl: file.type.startsWith("image/")
              ? URL.createObjectURL(file)
              : undefined,
          });
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    },
    []
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;

      const maxSize = 10 * 1024 * 1024;
      const newAttachments: Attachment[] = [];

      for (const file of Array.from(files)) {
        if (file.size > maxSize) {
          toast.error(`${file.name} is too large (max 10MB)`);
          continue;
        }
        try {
          newAttachments.push(await fileToAttachment(file));
        } catch {
          toast.error(`Failed to read ${file.name}`);
        }
      }

      if (newAttachments.length) {
        setPendingAttachments((prev) => [...prev, ...newAttachments]);
      }

      e.target.value = "";
    },
    [fileToAttachment]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          try {
            const att = await fileToAttachment(file);
            setPendingAttachments((prev) => [...prev, att]);
          } catch {
            toast.error("Failed to paste image");
          }
        }
      }
    },
    [fileToAttachment]
  );

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (dbSessionId && !isNewSessionMode) return dbSessionId;

    const res = await fetch(`${API}/workspaces/${workspaceId}/sessions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error?.message || "Failed to create session");

    const newSessionId = data.session.id;
    setDbSessionId(newSessionId);
    setIsNewSessionMode(false);
    return newSessionId;
  }, [dbSessionId, isNewSessionMode, workspaceId]);

  const sendMessage = useCallback(async () => {
    if (
      (!inputValue.trim() && pendingAttachments.length === 0) ||
      isSending
    )
      return;

    // Build content with element references if any
    let content = inputValue;
    if (elementRefs && elementRefs.length > 0) {
      const refDescriptions = elementRefs.map((el) => {
        if (el.file) {
          const loc = el.file + (el.line ? `:${el.line}` : "") + (el.column ? `:${el.column}` : "");
          const comp = el.component ? `<${el.component}/>` : el.tagName;
          const stackStr = el.stack?.filter(s => s.file).map(s => `${s.name} (${s.file})`).join(" → ") || "";
          return `[Element: ${comp} at ${loc}${stackStr ? ` | Stack: ${stackStr}` : ""} — ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}]`;
        }
        const label = el.tagName + (el.id ? `#${el.id}` : "") + (el.className ? `.${el.className.split(" ").slice(0, 2).join(".")}` : "");
        return `[Element: ${label} (${el.selector}) — ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}]`;
      });
      content = refDescriptions.join("\n") + "\n\n" + content;
      onElementRefsChange?.([]);
    }
    const attachments =
      pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    setInputValue("");
    setPendingAttachments([]);
    setIsSending(true);

    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: "user_message",
        content,
        timestamp: Date.now(),
        attachments,
      },
    ]);

    try {
      const sessionId = await ensureSession();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);

      const res = await fetch(
        `${API}/workspaces/${workspaceId}/sessions/${sessionId}/send`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            acpSessionId: acpSessionId || undefined,
            modelId: selectedModelId || undefined,
            attachments: attachments?.map(
              ({ previewUrl, ...rest }) => rest
            ),
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error?.message || "Failed to send");

      if (data.acpSessionId && data.acpSessionId !== acpSessionId) {
        setAcpSessionId(data.acpSessionId);
      }

      setIsAgentWorking(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [
    inputValue,
    pendingAttachments,
    elementRefs,
    isSending,
    ensureSession,
    workspaceId,
    acpSessionId,
    selectedModelId,
    onElementRefsChange,
  ]);

  useEffect(() => {
    if (retryContent && inputValue === retryContent && !isSending) {
      setRetryContent(null);
      sendMessage();
    }
  }, [retryContent, inputValue, isSending, sendMessage]);

  const queueMessage = useCallback(() => {
    if (!inputValue.trim()) return;
    setQueuedMessage(inputValue);
    setInputValue("");
    toast.info("Message queued — will send when agent finishes");
  }, [inputValue]);

  const cancelQueue = useCallback(() => {
    if (queuedMessage) {
      setInputValue(queuedMessage);
      setQueuedMessage(null);
    }
  }, [queuedMessage]);

  const stopSession = useCallback(async () => {
    if (!acpSessionId || !dbSessionId) return;
    try {
      await fetch(
        `${API}/workspaces/${workspaceId}/sessions/${dbSessionId}/stop`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acpSessionId }),
        }
      );
      setIsAgentWorking(false);
      setAcpSessionId(null);
      toast.info("Agent stopped");
    } catch {
      toast.error("Failed to stop session");
    }
  }, [acpSessionId, dbSessionId, workspaceId]);

  const handleApproval = useCallback(
    async (requestId: string, approved: boolean, reason?: string) => {
      if (!acpSessionId) return;
      try {
        await fetch(
          `${API}/workspaces/${workspaceId}/sessions/${dbSessionId}/approve`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              acpSessionId,
              requestId,
              approved,
              reason,
            }),
          }
        );
        setEntries((prev) =>
          prev.map((e) =>
            e.type === "permission_request" &&
            (e.metadata as any)?.requestId === requestId
              ? {
                  ...e,
                  metadata: {
                    ...e.metadata,
                    status: approved ? "approved" : "denied",
                  },
                }
              : e
          )
        );
      } catch {
        toast.error("Failed to send approval");
      }
    },
    [acpSessionId, dbSessionId, workspaceId]
  );

  const selectSession = useCallback(
    async (sessionId: string) => {
      setDbSessionId(sessionId);
      setIsNewSessionMode(false);
      setAcpSessionId(null);
      setEntries([]);
      setUsageInfo(null);
      setIsAgentWorking(false);

      try {
        const msgRes = await fetch(
          `${API}/workspaces/${workspaceId}/sessions/${sessionId}/messages`,
          { credentials: "include" }
        );
        const msgData = await msgRes.json();
        const messages = msgData.messages || [];
        setEntries(mapDbMessages(messages, workspaceId));
      } catch {
        // ignore
      }
    },
    [workspaceId]
  );

  const startNewSession = useCallback(() => {
    setIsNewSessionMode(true);
    setDbSessionId(null);
    setAcpSessionId(null);
    setEntries([]);
    setUsageInfo(null);
    setIsAgentWorking(false);
    setQueuedMessage(null);
    pendingAttachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setPendingAttachments([]);
    agentTextAccum.current = "";
    inputRef.current?.focus();
  }, [pendingAttachments]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await fetch(
          `${API}/workspaces/${workspaceId}/sessions/${sessionId}`,
          {
            method: "DELETE",
            credentials: "include",
          }
        );
        if (dbSessionId === sessionId) {
          startNewSession();
        }
        toast.success("Session deleted");
      } catch {
        toast.error("Failed to delete session");
      }
    },
    [workspaceId, dbSessionId, startNewSession]
  );

  const handleEditMessage = useCallback((content: string) => {
    setInputValue(content);
    inputRef.current?.focus();
  }, []);

  const handleRetryMessage = useCallback(
    async (entry: ChatEntry) => {
      if (isAgentWorking) {
        toast.info("Agent is busy — message queued for retry.");
        setQueuedMessage(entry.content);
        return;
      }

      if (entry.attachments?.length) {
        const reAttachments: Attachment[] = [];
        for (const att of entry.attachments) {
          if (att.data) {
            reAttachments.push({ ...att });
          } else if (att.serverUrl) {
            try {
              const res = await fetch(att.serverUrl, {
                credentials: "include",
              });
              const blob = await res.blob();
              const reader = new FileReader();
              const base64 = await new Promise<string>((resolve) => {
                reader.onload = () =>
                  resolve((reader.result as string).split(",")[1]);
                reader.readAsDataURL(blob);
              });
              reAttachments.push({ ...att, data: base64 });
            } catch {
              reAttachments.push({ ...att });
            }
          }
        }
        setPendingAttachments(reAttachments);
      }

      setInputValue(entry.content);
      setRetryContent(entry.content);
    },
    [isAgentWorking]
  );

  const handleShowInTerminal = useCallback(
    (entry: ChatEntry) => {
      const meta = entry.metadata as any;
      if (!meta) return;

      const toolName = meta.toolName || "Tool";
      const cmd = meta.toolInput
        ? (() => {
            try {
              return JSON.parse(meta.toolInput)?.command;
            } catch {
              return undefined;
            }
          })()
        : undefined;
      const result = meta.result || "";

      callbacks?.onTerminalContent?.({
        toolName,
        command: cmd,
        output: result,
        isError: meta.status === "error",
      });
    },
    [callbacks]
  );

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: entries.length - 1,
      behavior: "smooth",
    });
  }, [entries.length]);

  const quickActions = workspace ? buildQuickActions(workspace) : [];

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 p-8",
          className
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Loading workspace...
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Context banner for linked PR review or task */}
      {showContextBanner && workspace && (
        <WorkspaceContextBanner workspace={workspace} />
      )}

      {/* Chat Messages */}
      <div className="relative flex-1 min-h-0">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-4">
            <div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-sm font-semibold mb-1">
                {isNewSessionMode
                  ? "Start a new conversation"
                  : "What can I help you with?"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                {!(workspace?.worktreePath || workspace?.localPath)
                  ? "Repository not available locally. The agent can help you plan and discuss, but cannot access files."
                  : "Send a message to start working with the agent on this workspace."}
              </p>
            </div>

            {/* No working directory notice */}
            {!(workspace?.worktreePath || workspace?.localPath) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs max-w-sm">
                <Circle className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />
                <span>
                  No repository access — planning mode only. Connect a
                  repository or clone it to enable file operations.
                </span>
              </div>
            )}

            {/* Quick action suggestions based on workspace context */}
            <QuickActions
              actions={quickActions}
              onSelect={(prompt) => {
                setInputValue(prompt);
                setRetryContent(prompt);
              }}
              className="max-w-md"
            />
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={entries.filter(
              (e) =>
                e.type !== "usage_update" &&
                !(e.type === "system" && !e.content)
            )}
            followOutput="smooth"
            alignToBottom
            atBottomStateChange={(atBottom) =>
              setShowScrollDown(!atBottom)
            }
            className="h-full"
            itemContent={(_, entry) => {
              let artifacts: Artifact[] = [];
              if (entry.type === "agent_message") {
                artifacts = extractArtifacts(entry.content);
              } else if (entry.type === "tool_call") {
                const meta = entry.metadata as any;
                if (meta?.status === "success") {
                  const toolArtifact = extractToolCallArtifact(
                    meta.toolName || "",
                    meta.toolInput
                  );
                  if (toolArtifact) artifacts = [toolArtifact];
                }
              }
              return (
                <div className={compact ? "px-3 py-0.5" : "px-4 py-1"}>
                  <ChatEntryRenderer
                    entry={entry}
                    onApprove={(rid) => handleApproval(rid, true)}
                    onReject={(rid, reason) =>
                      handleApproval(rid, false, reason)
                    }
                    onEdit={
                      entry.type === "user_message"
                        ? handleEditMessage
                        : undefined
                    }
                    onRetry={
                      entry.type === "user_message"
                        ? handleRetryMessage
                        : undefined
                    }
                    onShowInTerminal={handleShowInTerminal}
                    onAction={(prompt) => {
                      setInputValue(prompt);
                      setRetryContent(prompt);
                    }}
                  />
                  {artifacts.length > 0 && (
                    <div className="ml-6 mt-0.5">
                      <ArtifactBadge
                        artifacts={artifacts}
                        onSelect={(artifact) => {
                          callbacks?.onArtifactSelect?.(artifact);
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            }}
          />
        )}

        {showScrollDown && entries.length > 0 && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute bottom-2 right-4 h-8 w-8 rounded-full shadow-lg"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Agent working indicator */}
      {isAgentWorking && (
        <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground border-t border-border/30">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Agent is working...</span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="destructive"
            className="h-6 text-xs px-2"
            onClick={stopSession}
          >
            <Square className="h-3 w-3 mr-1" />
            Stop
          </Button>
        </div>
      )}

      {/* Queued message indicator */}
      {queuedMessage && (
        <div className="px-4 py-1.5 flex items-center gap-2 text-xs border-t border-amber-500/20 bg-amber-500/5">
          <Clock className="h-3 w-3 text-amber-500" />
          <span className="text-amber-600 dark:text-amber-400 flex-1 truncate">
            Queued: {queuedMessage}
          </span>
          <button
            onClick={cancelQueue}
            className="text-amber-500 hover:text-amber-600 text-xs font-medium"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Open Workspace button (for inline/embedded mode) */}
      {showOpenWorkspaceButton && (
        <div className="px-3 py-1.5 border-t bg-muted/20">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-7 bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary"
            onClick={() => navigate(`/workspaces/${workspaceId}`)}
          >
            <Bot className="h-3 w-3 mr-1.5" />
            Open Workspace
          </Button>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border/50 bg-background shrink-0">
        {/* Chat input header: file stats, context gauge, session selector */}
        <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            {changesStats && changesStats.filesChanged > 0 && (
              <button
                onClick={() => callbacks?.onChangesClick?.()}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <Files className="h-3 w-3" />
                {changesStats.filesChanged} file{changesStats.filesChanged !== 1 ? "s" : ""}
                {(changesStats.additions > 0 || changesStats.deletions > 0) && (
                  <span className="ml-0.5">
                    {changesStats.additions > 0 && <span className="text-green-500 font-mono">+{changesStats.additions}</span>}
                    {changesStats.additions > 0 && changesStats.deletions > 0 && " "}
                    {changesStats.deletions > 0 && <span className="text-red-500 font-mono">-{changesStats.deletions}</span>}
                  </span>
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <ContextUsageGauge usage={usageInfo} />
            {showSessionSelector && sessions.length > 0 && (
              <SessionSelector
                sessions={sessions}
                currentSessionId={isNewSessionMode ? null : dbSessionId}
                onSelectSession={selectSession}
                onNewSession={startNewSession}
                onDeleteSession={handleDeleteSession}
                disabled={isSending}
              />
            )}
          </div>
        </div>
        <div className="px-3 pb-3">
          {pendingAttachments.length > 0 && (
            <PendingAttachmentsBar
              attachments={pendingAttachments}
              onRemove={removeAttachment}
            />
          )}

          {elementRefs && elementRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {elementRefs.map((el, i) => (
                <ElementRefBadge
                  key={`${el.selector}-${i}`}
                  element={el}
                  onRemove={() => onElementRefsChange?.(elementRefs.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isAgentWorking && inputValue.trim()) {
                queueMessage();
              } else {
                sendMessage();
              }
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (isAgentWorking && inputValue.trim()) {
                    queueMessage();
                  } else {
                    sendMessage();
                  }
                }
              }}
              placeholder={
                isNewSessionMode
                  ? "Start a new conversation..."
                  : "Continue working on this task..."
              }
              className={cn(
                "flex-1 resize-none rounded-lg border border-border/50 bg-background/50 px-3 py-2.5 text-sm",
                "placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
                "min-h-[40px] max-h-[120px] transition-all duration-200"
              )}
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
            />
            {queuedMessage ? (
              <div className="flex items-center gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={cancelQueue}
                  className="h-10 text-xs gap-1.5 border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
                  Cancel Queue
                </Button>
                <Button type="button" size="icon" variant="destructive" onClick={stopSession} className="h-10 w-10 shrink-0 rounded-lg">
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            ) : isAgentWorking ? (
              <div className="flex items-center gap-1.5">
                {inputValue.trim() && (
                  <Button type="button" size="sm" variant="outline" onClick={queueMessage} className="h-10 text-xs gap-1.5">
                    Queue
                  </Button>
                )}
                <Button type="button" size="icon" variant="destructive" onClick={stopSession} className="h-10 w-10 shrink-0 rounded-lg">
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button type="submit" size="icon" disabled={!inputValue.trim() && pendingAttachments.length === 0} className="h-10 w-10 shrink-0 rounded-lg">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            )}
          </form>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.go,.rs,.java,.c,.cpp,.h,.css,.html,.xml,.yaml,.yml,.toml,.csv,.log,.sql,.sh,.rb,.php,.swift,.kt,.r,.m,.svg"
            onChange={handleFileSelect}
            className="hidden"
          />

          {showFullInputBar && (
            <div className="flex items-center gap-1 mt-1.5 px-0.5">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
              <PermissionPolicySelector
                value={permissionPolicy}
                onChange={(policy) => {
                  setPermissionPolicy(policy);
                  if (
                    wsRef.current?.readyState === 1 &&
                    acpSessionId
                  ) {
                    wsRef.current.send(
                      JSON.stringify({
                        type: "set_permission_policy",
                        acpSessionId,
                        policy,
                      })
                    );
                  }
                }}
              />
              <ModelSelector
                agentId={workspace?.agentId || "claude-code"}
                value={selectedModelId}
                onChange={setSelectedModelId}
                disabled={isAgentWorking}
              />
              <div className="flex-1" />
              <p className="text-[10px] text-muted-foreground/50">
                {isAgentWorking ? "Enter to queue" : "Enter to send"},
                Shift+Enter for new line
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
