import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  GitBranch,
  Square,
  Terminal as TerminalIcon,
  Files,
  Globe,
  Send,
  Loader2,
  Clock,
  Circle,
  ArrowDown,
  Paperclip,
  X,
  FileText,
  ScrollText,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiffFileList } from "@/components/diff/DiffFileList";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import {
  ChatEntryRenderer,
  ContextUsageGauge,
  ChangesBar,
  PermissionPolicySelector,
  extractArtifacts,
  extractToolCallArtifact,
  ArtifactPreview,
  ArtifactBadge,
  QuickActions,
  buildQuickActions,
} from "@/components/workspace/chat";
import { WorkspaceContextBanner } from "@/components/workspace/WorkspaceContextBanner";
import { ModelSelector } from "@/components/workspace/chat/ModelSelector";
import type { Artifact } from "@/components/workspace/chat/ArtifactDetector";
import type {
  Attachment,
  ChatEntry,
  UsageInfo,
  ChangesStats,
  ToolCallStatus,
} from "@/components/workspace/chat/types";
import { WorkspaceToolbar } from "@/components/workspace/WorkspaceToolbar";
import { FloatingContextBar } from "@/components/workspace/FloatingContextBar";
import { SessionSelector } from "@/components/workspace/SessionSelector";
import { CollapsibleSection } from "@/components/workspace/CollapsibleSection";
import { GitPanel } from "@/components/workspace/GitPanel";
import { ProcessList } from "@/components/workspace/ProcessList";
import WorkspaceNotes from "@/components/workspace/WorkspaceNotes";
import { WorkspaceTerminal } from "@/components/workspace/WorkspaceTerminal";
import { WorkspaceBrowser } from "@/components/workspace/WorkspaceBrowser";
import { useDevServer } from "@/hooks/useDevServer";
import { ElementRefBadge } from "@/components/workspace/ElementRefBadge";

const API = "/api";
const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

interface ChangedFile {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
}

async function fetchWorkspace(id: string) {
  const res = await fetch(`${API}/workspaces/${id}`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Failed to fetch");
  return data.data ?? data.workspace;
}

async function fetchDiff(id: string) {
  const res = await fetch(`${API}/workspaces/${id}/diff`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) return "";
  return data.diff || "";
}

async function fetchChangedFiles(id: string): Promise<ChangedFile[]> {
  const res = await fetch(`${API}/workspaces/${id}/files`, { credentials: "include" });
  const data = await res.json();
  if (!res.ok) return [];
  const files = data.data?.files ?? data.files ?? [];
  return files.map((f: any) =>
    typeof f === "string"
      ? { path: f, status: "modified" as const, additions: 0, deletions: 0 }
      : { path: f.path, status: f.status || "modified", additions: f.additions || 0, deletions: f.deletions || 0 }
  );
}

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor Agent",
  copilot: "GitHub Copilot",
  gemini: "Gemini CLI",
  amp: "Amp",
  opencode: "OpenCode",
  droid: "Droid",
  qwen: "Qwen Code",
  aider: "Aider",
};

// ── Helpers to parse ACP WebSocket events into ChatEntry objects ──

function parseACPEvent(raw: Record<string, unknown>): ChatEntry | null {
  const type = raw.type as string;
  const data = raw.data as Record<string, unknown> | string | undefined;
  const timestamp = (raw.timestamp as number) || Date.now();
  const id = crypto.randomUUID();

  switch (type) {
    case "agent_message_chunk": {
      const content = typeof data === "object" && data !== null
        ? (data as any).content?.text || (data as any).text || JSON.stringify(data)
        : typeof data === "string" ? data : "";
      return { id, type: "agent_message", content, timestamp };
    }

    case "agent_thought_chunk": {
      const content = typeof data === "object" && data !== null
        ? (data as any).content?.text || (data as any).text || JSON.stringify(data)
        : typeof data === "string" ? data : "";
      return { id, type: "thinking", content, timestamp };
    }

    case "tool_call": {
      const d = data as Record<string, unknown> | undefined;
      const toolName = (d?.toolName as string) || (d?.tool_name as string) || "Tool";
      const toolInput = d?.input ? JSON.stringify(d.input, null, 2) : undefined;
      const toolUseId = (d?.toolUseId as string) || (d?.id as string);
      const summary = `${toolName}${d?.input ? `: ${truncate(JSON.stringify(d.input), 120)}` : ""}`;
      return {
        id,
        type: "tool_call",
        content: summary,
        timestamp,
        metadata: { toolName, toolInput, toolUseId, status: "running" as ToolCallStatus },
      };
    }

    case "tool_call_update": {
      const d = data as Record<string, unknown> | undefined;
      const toolName = (d?.toolName as string) || (d?.tool_name as string) || "Tool";
      const toolUseId = (d?.toolUseId as string);
      const result = d?.result ? (typeof d.result === "string" ? d.result : JSON.stringify(d.result, null, 2)) : undefined;
      const status: ToolCallStatus = (d?.error || d?.isError) ? "error" : "success";
      const summary = `${toolName} ${status === "success" ? "completed" : "failed"}`;
      return {
        id, type: "tool_call", content: summary, timestamp,
        metadata: { toolName, toolUseId, status, result: result || (d?.error as string) },
      };
    }

    case "plan": {
      const content = typeof data === "object" && data !== null
        ? (data as any).plan || JSON.stringify(data, null, 2)
        : typeof data === "string" ? data : "";
      return { id, type: "system", content: `Plan: ${content}`, timestamp };
    }

    case "usage_update":
      return { id, type: "usage_update", content: "", timestamp, metadata: data as Record<string, unknown> };

    case "permission_request": {
      const d = data as Record<string, unknown> | undefined;
      const requestId = (d?.requestId as string) || id;
      const toolCall = d?.toolCall as Record<string, unknown> | undefined;
      const toolName = (toolCall?.toolName as string) || (toolCall?.tool_name as string) || "Unknown";
      const toolInput = toolCall?.input ? JSON.stringify(toolCall.input, null, 2) : undefined;
      const options = d?.options as Array<{ optionId: string; kind: string }> | undefined;
      return {
        id, type: "permission_request", content: `${toolName} requires approval`, timestamp,
        metadata: { requestId, toolName, toolInput, status: "pending", options },
      };
    }

    case "stderr": {
      const content = typeof data === "string" ? data : JSON.stringify(data);
      return { id, type: "error", content, timestamp };
    }

    case "turn_complete":
    case "done":
      return null;

    case "agent_message": {
      const content = typeof data === "object" && data !== null
        ? (data as any).text || JSON.stringify(data)
        : typeof data === "string" ? data : "";
      return { id, type: "agent_message", content, timestamp };
    }

    case "system": {
      const d = data as Record<string, unknown> | undefined;
      if (d?.subtype === "init") {
        return { id, type: "system", content: `Connected to ${(d as any).model || "agent"}`, timestamp };
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
      const content = typeof data === "string" ? data : JSON.stringify(data);
      return { id, type: "agent_message", content, timestamp };
    }

    default:
      return null;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/** Pending attachments bar with click-to-preview */
function PendingAttachmentsBar({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (id: string) => void }) {
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
                <img src={att.previewUrl} alt={att.name} className="h-16 w-16 object-cover" />
              ) : (
                <div className="h-16 w-20 flex flex-col items-center justify-center gap-1 px-1">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground truncate max-w-full">{att.name}</span>
                </div>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(att.id); }}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      {previewAtt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreviewAtt(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-auto bg-background p-2 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewAtt(null)}
              className="absolute top-3 right-3 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 p-1.5 shadow-lg z-10 transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
            {(() => {
              const isPdf = previewAtt.mimeType === "application/pdf" || previewAtt.name.toLowerCase().endsWith(".pdf");
              const isImage = previewAtt.type === "image" || previewAtt.mimeType?.startsWith("image/");
              const isText = previewAtt.mimeType?.startsWith("text/") || ["json", "xml", "md", "txt", "csv", "log", "yml", "yaml", "js", "ts", "tsx", "py", "sh", "html", "css", "sql"].includes(previewAtt.name.split(".").pop()?.toLowerCase() || "");

              if (isPdf && previewAtt.data) {
                return <iframe src={`data:application/pdf;base64,${previewAtt.data}`} title={previewAtt.name} className="w-[80vw] h-[85vh] rounded border-0" />;
              }
              if (isImage && previewAtt.previewUrl) {
                return <img src={previewAtt.previewUrl} alt={previewAtt.name} className="max-w-full max-h-[85vh] object-contain rounded" />;
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
                  <p className="text-xs mt-1">{previewAtt.mimeType} — {formatBytes(previewAtt.size)}</p>
                </div>
              );
            })()}
            <p className="text-center text-xs text-muted-foreground mt-2">{previewAtt.name}</p>
          </div>
        </div>
      )}
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const toolResults = new Map<string, { result: string; isError: boolean }>();
  for (const msg of messages) {
    if (msg.role === "tool_result") {
      const meta = msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {};
      const toolUseId = meta.toolUseId as string;
      if (toolUseId) {
        toolResults.set(toolUseId, { result: msg.content, isError: !!meta.isError });
      }
    }
  }

  // Second pass: build entries, merging tool_results into tool_calls
  const entries: ChatEntry[] = [];
  for (const msg of messages) {
    const meta = msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {};

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
    if (msg.role === "user" && meta.attachments && Array.isArray(meta.attachments)) {
      entry.attachments = (meta.attachments as any[]).map((a: any) => ({
        id: a.id || crypto.randomUUID(),
        type: a.type || "file",
        name: a.name || "attachment",
        mimeType: a.mimeType || "application/octet-stream",
        size: a.size || 0,
        data: "",
        // Construct server URL for reload if filename was saved
        serverUrl: a.filename && workspaceId
          ? `/api/workspaces/${workspaceId}/attachments/${encodeURIComponent(a.filename)}`
          : undefined,
      }));
    }

    // Restore metadata for tool calls — merge in the tool_result
    if (msg.role === "tool_call") {
      const toolUseId = meta.toolUseId as string;
      const result = toolUseId ? toolResults.get(toolUseId) : undefined;
      const status = result ? (result.isError ? "error" as const : "success" as const) : "success" as const;
      entry.metadata = {
        toolName: meta.toolName || msg.content,
        toolInput: meta.input ? JSON.stringify(meta.input, null, 2) : undefined,
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

// ── Dev Server Logs Panel ──

function DevServerLogsPanel({
  devServerProcesses,
  selectedProcessId,
  selectedProcessLogs,
  onSelectProcess,
  terminalContent,
  isServerRunning,
}: {
  devServerProcesses: Array<{ id: string; status: string; startedAt: number; script: string }>;
  selectedProcessId: string | null;
  selectedProcessLogs: string;
  onSelectProcess: (id: string) => void;
  terminalContent: { toolName: string; command?: string; output: string; isError?: boolean } | null;
  isServerRunning: boolean;
}) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const selectedProc = devServerProcesses.find((p) => p.id === selectedProcessId);
  const isLive = selectedProc?.status === "running";

  // Auto-select the most recent process if none is selected
  useEffect(() => {
    if (!selectedProcessId && devServerProcesses.length > 0) {
      const running = devServerProcesses.find((p) => p.status === "running");
      onSelectProcess((running || devServerProcesses[0]).id);
    }
  }, [selectedProcessId, devServerProcesses, onSelectProcess]);

  // Auto-scroll when logs update for live processes
  useEffect(() => {
    if (isLive && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedProcessLogs, isLive]);

  // If no dev server processes, fall back to terminal content view
  if (devServerProcesses.length === 0 && !terminalContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center bg-[#0d1117]">
        <TerminalIcon className="h-8 w-8 text-[#484f58] mb-3" />
        <p className="text-sm text-[#8b949e]">No Logs Yet</p>
        <p className="text-xs text-[#484f58] mt-1">Start a dev server to see execution logs here</p>
      </div>
    );
  }

  // If no dev server processes but terminal content, show terminal content
  if (devServerProcesses.length === 0 && terminalContent) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-[#0d1117] text-[#c9d1d9]">
        <div className="px-4 py-2.5 border-b border-[#30363d] shrink-0">
          <span className="text-sm font-semibold text-[#f0f6fc]">{terminalContent.toolName}</span>
        </div>
        {terminalContent.command && (
          <div className="px-4 py-2 border-b border-[#30363d] shrink-0">
            <pre className="text-sm font-mono text-[#7ee787]">$ {terminalContent.command}</pre>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
          <pre className={cn(
            "text-sm font-mono whitespace-pre-wrap break-words leading-relaxed",
            terminalContent.isError ? "text-[#ff7b72]" : "text-[#c9d1d9]"
          )}>{terminalContent.output}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0d1117]">
      {/* Process selector header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#30363d] shrink-0 overflow-x-auto">
        {devServerProcesses.map((proc) => {
          const isActive = proc.id === selectedProcessId;
          const isRunning = proc.status === "running";
          const time = new Date(proc.startedAt);
          return (
            <button
              key={proc.id}
              onClick={() => onSelectProcess(proc.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-[#1f2937] text-[#f0f6fc] border border-[#30363d]"
                  : "text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]"
              )}
            >
              <span className={cn(
                "h-2 w-2 rounded-full shrink-0",
                isRunning ? "bg-green-500 animate-pulse" :
                proc.status === "failed" ? "bg-red-500" :
                proc.status === "killed" ? "bg-yellow-500" : "bg-[#484f58]"
              )} />
              <span>Dev Server</span>
              <span className="text-[10px] text-[#484f58]">
                {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </button>
          );
        })}
      </div>

      {/* Script info */}
      {selectedProc && (
        <div className="px-4 py-2 border-b border-[#30363d] shrink-0">
          <pre className="text-xs font-mono text-[#7ee787]">$ {selectedProc.script}</pre>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              "text-[10px] font-medium",
              isLive ? "text-green-400" : selectedProc.status === "failed" ? "text-red-400" : "text-[#8b949e]"
            )}>
              {isLive ? "Running" : selectedProc.status === "failed" ? "Failed" : selectedProc.status === "killed" ? "Stopped" : "Completed"}
            </span>
            <span className="text-[10px] text-[#484f58]">
              Started {new Date(selectedProc.startedAt).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Log output */}
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        {selectedProcessLogs ? (
          <>
            <pre className="text-sm font-mono whitespace-pre-wrap break-words leading-relaxed text-[#c9d1d9]">
              {selectedProcessLogs}
            </pre>
            <div ref={logsEndRef} />
          </>
        ) : selectedProcessId ? (
          <div className="flex items-center gap-2 text-[#8b949e] text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading logs...</span>
          </div>
        ) : (
          <p className="text-sm text-[#484f58]">Select a dev server run to view its logs</p>
        )}
      </div>

      {/* Live indicator */}
      {isLive && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-[#30363d] bg-[#161b22] shrink-0">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400 font-medium">Live</span>
          <span className="text-[10px] text-[#484f58]">Streaming logs in real-time</span>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const {
    showRightSidebar,
    rightMainPanelMode,
    setRightMainPanelMode,
    permissionPolicy,
    setPermissionPolicy,
  } = useWorkspaceStore();

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [isNewSessionMode, setIsNewSessionMode] = useState(false);
  const [terminalContent, setTerminalContent] = useState<{ toolName: string; command?: string; output: string; isError?: boolean } | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [elementRefs, setElementRefs] = useState<Array<{ tagName: string; id: string | null; className: string; textContent: string; selector: string; rect: { x: number; y: number; width: number; height: number }; component?: string | null; file?: string | null; line?: number | null; column?: number | null; framework?: string | null; stack?: Array<{ name: string; file: string | null }>; htmlPreview?: string }>>([]);
  const [retryContent, setRetryContent] = useState<string | null>(null);

  const { data: workspace, isLoading } = useQuery({
    queryKey: ["workspace", id],
    queryFn: () => fetchWorkspace(id!),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  // Load saved model preference for the current agent
  const { data: userSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch(`${API}/settings`, { credentials: "include" });
      const data = await res.json();
      return data.data;
    },
    staleTime: 60_000,
  });

  // Fetch repository to get devServerScript
  const { data: repository } = useQuery({
    queryKey: ["repo", workspace?.repositoryId],
    queryFn: async () => {
      const res = await fetch(`${API}/repos/${workspace.repositoryId}`, { credentials: "include" });
      const data = await res.json();
      return data.data ?? data;
    },
    enabled: !!workspace?.repositoryId,
    staleTime: 30_000,
  });

  // Initialize selectedModelId from saved preferences when workspace loads
  useEffect(() => {
    if (workspace?.agentId && userSettings?.agentModels && !selectedModelId) {
      const savedModel = userSettings.agentModels[workspace.agentId];
      if (savedModel) {
        setSelectedModelId(savedModel);
      }
    }
  }, [workspace?.agentId, userSettings?.agentModels, selectedModelId]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const agentTextAccum = useRef("");
  const thinkingAccum = useRef("");
  const queuedMessageRef = useRef<string | null>(null);

  const sessionActive = !!acpSessionId;

  // Only fetch changes when there's an active agent session doing work
  const hasAgentActivity = useMemo(() =>
    entries.some((e) => e.type === "tool_call" || (e.type === "agent_message" && e.content.length > 0)),
    [entries]
  );

  const { data: diff = "" } = useQuery({
    queryKey: ["workspace-diff", id, dbSessionId],
    queryFn: () => fetchDiff(id!),
    enabled: !!id,
    refetchInterval: isAgentWorking ? 5000 : false,
  });

  const { data: rawChangedFiles = [] } = useQuery<ChangedFile[]>({
    queryKey: ["workspace-files", id, dbSessionId],
    queryFn: () => fetchChangedFiles(id!),
    enabled: !!id,
    refetchInterval: isAgentWorking ? 5000 : false,
  });

  // Filter out .auto-software/ internal files from the changes list
  const changedFiles = useMemo(() =>
    rawChangedFiles.filter((f) => !f.path.includes('.auto-software/')),
    [rawChangedFiles]
  );

  const changesStats = useMemo<ChangesStats>(() => ({
    filesChanged: changedFiles.length,
    additions: changedFiles.reduce((sum, f) => sum + f.additions, 0),
    deletions: changedFiles.reduce((sum, f) => sum + f.deletions, 0),
  }), [changedFiles]);

  // Dev server state for floating bar + logs
  const {
    processes: devServerProcesses,
    isStarting: isDevServerStarting,
    isStopping: isDevServerStopping,
    isServerRunning: isDevServerRunning,
    selectedProcessId: selectedDevProcessId,
    selectedProcessLogs: devServerLogs,
    start: startDevServer,
    stop: stopDevServer,
    selectProcess: selectDevServerProcess,
    refetch: refetchDevServer,
  } = useDevServer(id);

  // Session list from workspace data
  const sessions = useMemo(() => {
    if (!workspace?.sessions) return [];
    return workspace.sessions.map((s: any, i: number) => ({
      id: s.id,
      createdAt: s.startedAt || s.createdAt,
      isLatest: i === 0,
    }));
  }, [workspace]);

  // Auto-select latest session on workspace load (runs once, not on every refetch)
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!workspace?.sessions?.length || hasInitialized.current) return;
    if (dbSessionId || isNewSessionMode) return;

    hasInitialized.current = true;
    const latestSession = workspace.sessions[0];
    setDbSessionId(latestSession.id);

    if (latestSession.messages?.length) {
      setEntries(mapDbMessages(latestSession.messages, id));
    }
  }, [workspace, dbSessionId, isNewSessionMode, id]);

  // Restore artifacts and terminal content from loaded entries after reload
  const hasRestoredContext = useRef(false);
  useEffect(() => {
    if (hasRestoredContext.current || entries.length === 0) return;
    if (acpSessionId) return;

    hasRestoredContext.current = true;

    let lastArtifact: Artifact | null = null;
    let lastBashTerminal: { toolName: string; command?: string; output: string; isError?: boolean } | null = null;

    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (!lastArtifact && e.type === "agent_message") {
        const arts = extractArtifacts(e.content);
        if (arts.length > 0) {
          lastArtifact = arts[arts.length - 1];
        }
      }
      if (!lastBashTerminal && e.type === "tool_call") {
        const meta = e.metadata as any;
        const tn = (meta?.toolName || "").toLowerCase();
        if ((tn === "bash" || tn.includes("terminal") || tn.includes("command")) && meta?.result) {
          let cmd: string | undefined;
          try { cmd = JSON.parse(meta.toolInput || "{}")?.command; } catch {}
          lastBashTerminal = { toolName: meta.toolName, command: cmd, output: meta.result, isError: meta.status === "error" };
        }
      }
      if (lastArtifact && lastBashTerminal) break;
    }

    if (lastBashTerminal) {
      setTerminalContent(lastBashTerminal);
    }

    if (lastArtifact) {
      setSelectedArtifact(lastArtifact);
    }
  }, [entries, acpSessionId, setRightMainPanelMode]);

  // Keep queuedMessage ref in sync
  useEffect(() => { queuedMessageRef.current = queuedMessage; }, [queuedMessage]);

  // WebSocket connection for real-time ACP events
  useEffect(() => {
    if (!id || !acpSessionId) return;

    const ws = new WebSocket(`${WS_URL}/ws/workspace/${id}`);
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
          return [...prev.slice(0, -1), { ...last, content: last.content + text }];
        }
        return [...prev, { id: crypto.randomUUID(), type: "agent_message" as const, content: text, timestamp: Date.now() }];
      });
    };

    const flushThinking = () => {
      if (!thinkingAccum.current) return;
      const text = thinkingAccum.current;
      thinkingAccum.current = "";
      setEntries((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === "thinking") {
          return [...prev.slice(0, -1), { ...last, content: last.content + text }];
        }
        return [...prev, { id: crypto.randomUUID(), type: "thinking" as const, content: text, timestamp: Date.now() }];
      });
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        const acpType = raw.type as string;
        const d = typeof raw.data === "object" && raw.data !== null ? (raw.data as Record<string, unknown>) : undefined;

        if (acpType === "agent_message_chunk" || acpType === "text") {
          setIsAgentWorking(true);
          flushThinking();
          const chunkText = d?.text as string || (typeof raw.data === "string" ? raw.data : "");
          if (chunkText) {
            agentTextAccum.current += chunkText;
            if (textFlushTimer) clearTimeout(textFlushTimer);
            textFlushTimer = setTimeout(flushAgentText, 80);
          }
          return;
        }

        if (acpType === "agent_thought_chunk") {
          setIsAgentWorking(true);
          const chunkText = d?.text as string || (typeof raw.data === "string" ? raw.data : "");
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
            const cacheCreation = (d.cacheCreationInputTokens as number) || 0;
            const cacheRead = (d.cacheReadInputTokens as number) || 0;
            const totalTokens = input + output + cacheCreation + cacheRead;
            const apiContextWindow = (d.contextWindow as number) || 0;
            setUsageInfo((prev) => ({
              inputTokens: input,
              outputTokens: output,
              totalTokens,
              contextWindow: apiContextWindow || prev?.contextWindow || 200_000,
              costUsd: (d.totalCost as number) || 0,
            }));
          }
          return;
        }

        if (acpType === "turn_complete" || acpType === "done") {
          setIsAgentWorking(false);
          flushAgentText();
          flushThinking();
          queryClient.invalidateQueries({ queryKey: ["workspace-diff", id] });
          queryClient.invalidateQueries({ queryKey: ["workspace-files", id] });

          if (queuedMessageRef.current) {
            const msg = queuedMessageRef.current;
            setQueuedMessage(null);
            queuedMessageRef.current = null;
            setTimeout(() => { setInputValue(msg); }, 300);
          }
          return;
        }

        if (acpType === "tool_call_update") {
          flushAgentText();
          flushThinking();
          const toolUseId = d?.toolUseId as string;
          const result = d?.result ? (typeof d.result === "string" ? d.result : JSON.stringify(d.result, null, 2)) : undefined;
          const isError = !!(d?.error || d?.isError);
          const status: ToolCallStatus = isError ? "error" : "success";

          if (toolUseId) {
            setEntries((prev) => {
              const idx = prev.findIndex(
                (e) => e.type === "tool_call" && (e.metadata as any)?.toolUseId === toolUseId
              );
              if (idx !== -1) {
                const existing = prev[idx];
                const meta = existing.metadata as any;
                const updatedMeta = { ...meta, status, result: result || (d?.error as string) };

                const tn = (meta.toolName || "").toLowerCase();
                if (tn === "bash" || tn.includes("terminal") || tn.includes("command")) {
                  let cmd: string | undefined;
                  try { cmd = JSON.parse(meta.toolInput || "{}")?.command; } catch {}
                  setTerminalContent({ toolName: meta.toolName, command: cmd, output: updatedMeta.result || "", isError });
                  setRightMainPanelMode("logs");
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
          const toolName = (d?.toolName as string) || (d?.tool_name as string) || "Tool";
          const toolInput = d?.input ? JSON.stringify(d.input, null, 2) : undefined;
          const toolUseId = d?.toolUseId as string || d?.id as string;
          const summary = `${toolName}${d?.input ? `: ${truncate(JSON.stringify(d.input), 120)}` : ""}`;

          setEntries((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              type: "tool_call" as const,
              content: summary,
              timestamp: raw.timestamp || Date.now(),
              metadata: { toolName, toolInput, toolUseId, status: "running" as ToolCallStatus },
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
              { id: crypto.randomUUID(), type: "system" as const, content: `Connected to ${(d as any).model || "agent"}`, timestamp: raw.timestamp || Date.now() },
            ]);
          }
          return;
        }

        if (acpType === "error") {
          const content = d?.message as string || (typeof raw.data === "string" ? raw.data : JSON.stringify(raw.data));
          setEntries((prev) => [
            ...prev,
            { id: crypto.randomUUID(), type: "error" as const, content, timestamp: raw.timestamp || Date.now() },
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
  }, [id, acpSessionId, queryClient, setRightMainPanelMode]);

  // File → Attachment helper
  const fileToAttachment = useCallback((file: File): Promise<Attachment> => {
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
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        });
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [fileToAttachment]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
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
  }, [fileToAttachment]);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (dbSessionId && !isNewSessionMode) return dbSessionId;

    const res = await fetch(`${API}/workspaces/${id}/sessions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Failed to create session");

    const newSessionId = data.session.id;
    setDbSessionId(newSessionId);
    setIsNewSessionMode(false);
    return newSessionId;
  }, [dbSessionId, isNewSessionMode, id]);

  const sendMessage = useCallback(async () => {
    if ((!inputValue.trim() && pendingAttachments.length === 0) || isSending) return;

    // Build content with element references if any
    let content = inputValue;
    if (elementRefs.length > 0) {
      const refDescriptions = elementRefs.map((el) => {
        if (el.file) {
          // Source-mapped reference: show component + file:line
          const loc = el.file + (el.line ? `:${el.line}` : "") + (el.column ? `:${el.column}` : "");
          const comp = el.component ? `<${el.component}/>` : el.tagName;
          const stackStr = el.stack?.filter(s => s.file).map(s => `${s.name} (${s.file})`).join(" → ") || "";
          return `[Element: ${comp} at ${loc}${stackStr ? ` | Stack: ${stackStr}` : ""} — ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}]`;
        }
        // Fallback: raw CSS selector
        const label = el.tagName + (el.id ? `#${el.id}` : "") + (el.className ? `.${el.className.split(" ").slice(0, 2).join(".")}` : "");
        return `[Element: ${label} (${el.selector}) — ${Math.round(el.rect.width)}x${Math.round(el.rect.height)}]`;
      });
      content = refDescriptions.join("\n") + "\n\n" + content;
    }
    const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    setInputValue("");
    setPendingAttachments([]);
    setElementRefs([]);
    setIsSending(true);

    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: "user_message", content, timestamp: Date.now(), attachments },
    ]);

    try {
      const sessionId = await ensureSession();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);

      const res = await fetch(`${API}/workspaces/${id}/sessions/${sessionId}/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          acpSessionId: acpSessionId || undefined,
          modelId: selectedModelId || undefined,
          attachments: attachments?.map(({ previewUrl, ...rest }) => rest),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to send");

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
  }, [inputValue, pendingAttachments, elementRefs, isSending, ensureSession, id, acpSessionId]);

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
      await fetch(`${API}/workspaces/${id}/sessions/${dbSessionId}/stop`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acpSessionId }),
      });
      setIsAgentWorking(false);
      setAcpSessionId(null);
      toast.info("Agent stopped");
    } catch {
      toast.error("Failed to stop session");
    }
  }, [acpSessionId, dbSessionId, id]);

  const handleApproval = useCallback(
    async (requestId: string, approved: boolean, reason?: string) => {
      if (!acpSessionId) return;
      try {
        await fetch(`${API}/workspaces/${id}/sessions/${dbSessionId}/approve`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acpSessionId, requestId, approved, reason }),
        });
        setEntries((prev) =>
          prev.map((e) =>
            e.type === "permission_request" && (e.metadata as any)?.requestId === requestId
              ? { ...e, metadata: { ...e.metadata, status: approved ? "approved" : "denied" } }
              : e
          )
        );
      } catch {
        toast.error("Failed to send approval");
      }
    },
    [acpSessionId, dbSessionId, id]
  );

  const startNewSession = useCallback(() => {
    setIsNewSessionMode(true);
    setDbSessionId(null);
    setAcpSessionId(null);
    setEntries([]);
    setTerminalContent(null);
    setSelectedArtifact(null);
    setUsageInfo(null);
    setIsAgentWorking(false);
    hasRestoredContext.current = false;
    setQueuedMessage(null);
    pendingAttachments.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
    setPendingAttachments([]);
    agentTextAccum.current = "";
    inputRef.current?.focus();
  }, [pendingAttachments]);

  const handleEditMessage = useCallback((content: string) => {
    setInputValue(content);
    inputRef.current?.focus();
  }, []);

  const handleRetryMessage = useCallback(async (entry: ChatEntry) => {
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
            const res = await fetch(att.serverUrl, { credentials: "include" });
            const blob = await res.blob();
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
              reader.onload = () => resolve((reader.result as string).split(",")[1]);
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
  }, [isAgentWorking]);

  const handleShowInTerminal = useCallback((entry: ChatEntry) => {
    const meta = entry.metadata as any;
    if (!meta) return;

    const toolName = meta.toolName || "Tool";
    const cmd = meta.toolInput ? (() => {
      try { return JSON.parse(meta.toolInput)?.command; } catch { return undefined; }
    })() : undefined;
    const result = meta.result || "";

    setTerminalContent({ toolName, command: cmd, output: result, isError: meta.status === "error" });
    setRightMainPanelMode("logs");
  }, [setRightMainPanelMode]);

  const handleDownloadArtifact = useCallback((artifact: Artifact) => {
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.filename || "artifact.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const selectSession = useCallback((sessionId: string) => {
    const session = workspace?.sessions?.find((s: any) => s.id === sessionId);
    if (!session) return;

    setDbSessionId(sessionId);
    setAcpSessionId(null);
    setIsNewSessionMode(false);
    setIsAgentWorking(false);
    setQueuedMessage(null);
    setTerminalContent(null);
    setSelectedArtifact(null);
    setUsageInfo(null);
    agentTextAccum.current = "";
    hasRestoredContext.current = false;

    setEntries(session.messages?.length ? mapDbMessages(session.messages, id) : []);
  }, [workspace, id]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (!id) return;
    try {
      const res = await fetch(`${API}/workspaces/${id}/sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || data.error || "Failed to delete session");
      }

      await queryClient.invalidateQueries({ queryKey: ["workspace", id] });

      if (dbSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        if (remaining.length > 0) {
          selectSession(remaining[0].id);
        } else {
          startNewSession();
        }
      }

      toast.success("Session deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete session");
    }
  }, [id, dbSessionId, sessions, queryClient, selectSession, startNewSession]);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: entries.length - 1, behavior: "smooth" });
  }, [entries.length]);

  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new Event("open-command-palette"));
  }, []);

  // Build process list from entries for the Logs panel
  const processes = useMemo(() => {
    const procs: Array<{
      id: string;
      type: "coding_agent" | "dev_server" | "terminal" | "script";
      status: "running" | "completed" | "failed" | "stopped";
      label: string;
      startedAt: Date;
    }> = [];

    // Add the current agent session as a process
    if (sessionActive || hasAgentActivity) {
      procs.push({
        id: "agent-session",
        type: "coding_agent",
        status: isAgentWorking ? "running" : sessionActive ? "completed" : "stopped",
        label: `${AGENT_LABELS[workspace?.agentId] || "Agent"} session`,
        startedAt: entries.length > 0 ? new Date(entries[0].timestamp) : new Date(),
      });
    }

    // Add dev server processes
    for (const dp of devServerProcesses) {
      procs.push({
        id: dp.id,
        type: "dev_server",
        status: dp.status === "running" ? "running" : dp.status === "killed" ? "stopped" : dp.status === "completed" ? "completed" : "failed",
        label: "Dev Server",
        startedAt: new Date(dp.startedAt),
      });
    }

    // Extract bash/terminal tool calls as individual process entries
    for (const e of entries) {
      if (e.type === "tool_call") {
        const meta = e.metadata as any;
        const tn = (meta?.toolName || "").toLowerCase();
        if (tn === "bash" || tn.includes("terminal") || tn.includes("command")) {
          let cmd: string | undefined;
          try { cmd = JSON.parse(meta?.toolInput || "{}")?.command; } catch {}
          procs.push({
            id: e.id,
            type: "terminal",
            status: meta?.status === "running" ? "running" : meta?.status === "error" ? "failed" : "completed",
            label: cmd ? truncate(cmd, 60) : meta?.toolName || "Bash",
            startedAt: new Date(e.timestamp),
          });
        }
      }
    }

    return procs;
  }, [entries, sessionActive, isAgentWorking, hasAgentActivity, workspace?.agentId, devServerProcesses]);

  if (isLoading || !workspace) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const agentLabel = AGENT_LABELS[workspace.agentId] || workspace.agentId;
  const branchDisplay = workspace.worktreeBranch || workspace.branch;

  const renderActionButton = () => {
    if (queuedMessage) {
      return (
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={cancelQueue}
            className="h-10 text-xs gap-1.5 border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
            Cancel Queue
          </Button>
          <Button type="button" size="icon" variant="destructive" onClick={stopSession} className="h-10 w-10 shrink-0 rounded-lg">
            <Square className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    if (isAgentWorking) {
      return (
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
      );
    }

    return (
      <Button type="submit" size="icon" disabled={!inputValue.trim() || isSending} className="h-10 w-10 shrink-0 rounded-lg">
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    );
  };

  // Extract repo name from path or linked entity
  const repoName = workspace.localPath
    ? workspace.localPath.split("/").pop() || workspace.localPath
    : workspace.prReview
      ? `${workspace.prReview.owner}/${workspace.prReview.repo}`
      : workspace.name;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-4 sm:-m-6">
      {/* ── Status Bar (Top) ── */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate("/workspaces")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold truncate">{workspace.name}</h2>
          <Badge variant="secondary" className="hidden sm:flex shrink-0 gap-1.5 text-xs">
            <Bot className="h-3 w-3" />
            {agentLabel}
          </Badge>
          {branchDisplay && (
            <Badge variant="secondary" className="hidden md:flex shrink-0 gap-1.5 text-xs font-mono">
              <GitBranch className="h-3 w-3" />
              {branchDisplay}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="secondary"
            className={cn(
              "gap-1.5 text-xs font-medium",
              isAgentWorking ? "text-green-500" : "text-muted-foreground"
            )}
          >
            <Circle className={cn("h-2 w-2 fill-current", isAgentWorking ? "text-green-500" : "text-muted-foreground")} />
            {isAgentWorking ? "Working" : sessionActive ? "Connected" : "Idle"}
          </Badge>

          {isAgentWorking && (
            <Button size="sm" variant="destructive" onClick={stopSession}>
              <Square className="h-3.5 w-3.5 mr-1.5" />
              Stop
            </Button>
          )}

          <div className="h-5 w-px bg-border/50 mx-1" />

          <WorkspaceToolbar
            onOpenCommandPalette={openCommandPalette}
            onOpenSettings={() => navigate("/settings")}
          />
        </div>
      </div>

      {/* ── Main Content: 3-panel resizable layout ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <PanelGroup orientation="horizontal">
          {/* ── Chat Panel (center-left) ── */}
          <Panel defaultSize={rightMainPanelMode ? "50%" : "65%"} minSize="30%">
            <div className="h-full flex flex-col overflow-hidden">
              {/* Context banner for linked PR review or task */}
              <WorkspaceContextBanner workspace={workspace} />

              {/* Chat Messages */}
              <div className="relative flex-1 min-h-0">
                {entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-4">
                    <div>
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                        <Bot className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold mb-1">
                        {isNewSessionMode ? "Start a new conversation" : "What can I help you with?"}
                      </h3>
                      <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                        Send a message to start working with the agent on this workspace.
                      </p>
                    </div>

                    {/* Quick action suggestions based on workspace context */}
                    <QuickActions
                      actions={buildQuickActions(workspace)}
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
                    data={entries}
                    followOutput="smooth"
                    atBottomStateChange={(atBottom) => setShowScrollDown(!atBottom)}
                    className="h-full"
                    itemContent={(_, entry) => {
                      let artifacts: Artifact[] = [];
                      if (entry.type === "agent_message") {
                        artifacts = extractArtifacts(entry.content);
                      } else if (entry.type === "tool_call") {
                        const meta = entry.metadata as any;
                        if (meta?.status === "success") {
                          const toolArtifact = extractToolCallArtifact(meta.toolName || "", meta.toolInput);
                          if (toolArtifact) artifacts = [toolArtifact];
                        }
                      }
                      return (
                        <div className="px-4 py-1">
                          <ChatEntryRenderer
                            entry={entry}
                            onApprove={(rid) => handleApproval(rid, true)}
                            onReject={(rid, reason) => handleApproval(rid, false, reason)}
                            onEdit={entry.type === "user_message" ? handleEditMessage : undefined}
                            onRetry={entry.type === "user_message" ? handleRetryMessage : undefined}
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
                                  setSelectedArtifact(artifact);
                                  setRightMainPanelMode("preview");
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
                  <Button size="icon" variant="secondary"
                    className="absolute bottom-2 right-4 h-8 w-8 rounded-full shadow-lg"
                    onClick={scrollToBottom}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Agent working indicator */}
              {isAgentWorking && (
                <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground border-t border-border/30">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Agent is working...</span>
                </div>
              )}

              {/* Queued message indicator */}
              {queuedMessage && (
                <div className="px-4 py-1.5 flex items-center gap-2 text-xs border-t border-amber-500/20 bg-amber-500/5">
                  <Clock className="h-3 w-3 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400 flex-1 truncate">Queued: {queuedMessage}</span>
                  <button onClick={cancelQueue} className="text-amber-500 hover:text-amber-600 text-xs font-medium">Cancel</button>
                </div>
              )}

              {/* Input Area */}
              <div className="border-t border-border/50 bg-background shrink-0">
                {/* Chat input header: file stats, context gauge, session selector */}
                <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                    {changesStats.filesChanged > 0 && (
                      <button
                        onClick={() => setRightMainPanelMode("changes")}
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
                    <SessionSelector
                      sessions={sessions}
                      currentSessionId={isNewSessionMode ? null : dbSessionId}
                      onSelectSession={selectSession}
                      onNewSession={startNewSession}
                      onDeleteSession={handleDeleteSession}
                      disabled={isSending}
                    />
                  </div>
                </div>
                <div className="px-3 pb-3">
                {pendingAttachments.length > 0 && (
                  <PendingAttachmentsBar
                    attachments={pendingAttachments}
                    onRemove={removeAttachment}
                  />
                )}

                {elementRefs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {elementRefs.map((el, i) => (
                      <ElementRefBadge
                        key={`${el.selector}-${i}`}
                        element={el}
                        onRemove={() => setElementRefs((prev) => prev.filter((_, j) => j !== i))}
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
                  {renderActionButton()}
                </form>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.go,.rs,.java,.c,.cpp,.h,.css,.html,.xml,.yaml,.yml,.toml,.csv,.log,.sql,.sh,.rb,.php,.swift,.kt,.r,.m,.svg"
                  onChange={handleFileSelect}
                  className="hidden"
                />

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
                      if (wsRef.current?.readyState === 1 && acpSessionId) {
                        wsRef.current.send(JSON.stringify({ type: "set_permission_policy", acpSessionId, policy }));
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
                    {isAgentWorking ? "Enter to queue" : "Enter to send"}, Shift+Enter for new line
                  </p>
                </div>
              </div>
              </div>
            </div>
          </Panel>

          {/* ── Resize handle: Chat ↔ Right-Main ── */}
          {rightMainPanelMode && (
            <>
              <PanelResizeHandle className="w-1 bg-border/30 hover:bg-primary/30 active:bg-primary/40 transition-colors cursor-col-resize" />

              {/* ── Right-Main Panel (terminal / changes / preview) ── */}
              <Panel defaultSize="35%" minSize="20%">
                <div className="h-full flex flex-col overflow-hidden border-l border-border/30">
                  {/* Right-Main panel header */}
                  <div className="flex items-center gap-0 border-b border-border/50 bg-muted/30 px-1 shrink-0">
                    {([
                      { id: "terminal" as const, label: "Terminal", icon: TerminalIcon },
                      { id: "logs" as const, label: "Logs", icon: ScrollText, badge: devServerProcesses.filter(p => p.status === "running").length || undefined },
                      { id: "changes" as const, label: "Changes", icon: Files, badge: changedFiles.length || undefined },
                      { id: "preview" as const, label: "Preview", icon: Globe },
                    ]).map((tab) => {
                      const Icon = tab.icon;
                      const isActive = rightMainPanelMode === tab.id;
                      return (
                        <button key={tab.id} onClick={() => setRightMainPanelMode(tab.id)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative",
                            isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
                          )}>
                          <Icon className="h-3.5 w-3.5" />
                          <span>{tab.label}</span>
                          {tab.badge && <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{tab.badge}</Badge>}
                          {isActive && <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-primary rounded-full" />}
                        </button>
                      );
                    })}
                    <div className="flex-1" />
                    <button
                      onClick={() => setRightMainPanelMode(null)}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      title="Close panel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Right-Main panel content */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {rightMainPanelMode === "terminal" && (
                      <WorkspaceTerminal workspaceId={id!} className="h-full" />
                    )}
                    {rightMainPanelMode === "logs" && (
                      <DevServerLogsPanel
                        devServerProcesses={devServerProcesses}
                        selectedProcessId={selectedDevProcessId}
                        selectedProcessLogs={devServerLogs}
                        onSelectProcess={selectDevServerProcess}
                        terminalContent={terminalContent}
                        isServerRunning={isDevServerRunning}
                      />
                    )}
                    {rightMainPanelMode === "changes" && (
                      <div className="h-full flex flex-col overflow-hidden">
                        {changedFiles.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-center">
                            <Files className="h-8 w-8 text-muted-foreground/40 mb-3" />
                            <p className="text-sm text-muted-foreground">No file changes yet</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">File changes will appear here as the agent modifies code.</p>
                          </div>
                        ) : (
                          <DiffFileList files={changedFiles} diff={diff} />
                        )}
                      </div>
                    )}
                    {rightMainPanelMode === "preview" && (
                      selectedArtifact ? (
                        <ArtifactPreview
                          artifact={selectedArtifact}
                          onClose={() => setSelectedArtifact(null)}
                          onDownload={handleDownloadArtifact}
                          className="h-full"
                        />
                      ) : (
                        <WorkspaceBrowser
                          workspaceId={id!}
                          repositoryId={workspace.repositoryId || null}
                          devServerScript={repository?.devServerScript || workspace.devServerScript || null}
                          onElementSelected={(element) => {
                            setElementRefs((prev) => [...prev, element]);
                          }}
                          onDevServerChanged={refetchDevServer}
                        />
                      )
                    )}
                  </div>
                </div>
              </Panel>
            </>
          )}

          {/* ── Resize handle: Right-Main ↔ Right Sidebar ── */}
          {showRightSidebar && (
            <>
              <PanelResizeHandle className="w-1 bg-border/30 hover:bg-primary/30 active:bg-primary/40 transition-colors cursor-col-resize" />

              {/* ── Right Sidebar (collapsible accordion sections) ── */}
              <Panel defaultSize="25%" minSize="15%" maxSize="40%">
                <div className="h-full flex flex-col overflow-y-auto border-l border-border/30 bg-background">
                  {/* Logs / Process List */}
                  <CollapsibleSection
                    title="Logs"
                    icon={<ScrollText className="h-4 w-4" />}
                    persistKey="sidebar-logs"
                    defaultExpanded={true}
                    badge={processes.filter(p => p.status === "running").length || undefined}
                    actions={
                      <span
                        role="button"
                        onClick={() => setRightMainPanelMode("logs")}
                        className="text-[10px] text-primary hover:underline cursor-pointer"
                      >
                        View full logs
                      </span>
                    }
                  >
                    <ProcessList
                      processes={processes}
                      activeProcessId={selectedDevProcessId || undefined}
                      onSelectProcess={(procId) => {
                        // Check if it's a dev server process
                        const isDevServer = devServerProcesses.some(dp => dp.id === procId);
                        if (isDevServer) {
                          selectDevServerProcess(procId);
                          setRightMainPanelMode("logs");
                        } else {
                          // Find the entry and show it in terminal
                          const entry = entries.find(e => e.id === procId);
                          if (entry) handleShowInTerminal(entry);
                        }
                      }}
                      onSelectTerminal={() => setRightMainPanelMode("terminal")}
                    />
                  </CollapsibleSection>

                  {/* Git */}
                  <CollapsibleSection
                    title="Git"
                    icon={<GitBranch className="h-4 w-4" />}
                    persistKey="sidebar-git"
                    defaultExpanded={true}
                  >
                    <div className="p-2">
                      <GitPanel
                        repoName={repoName}
                        baseBranch={workspace.prReview?.baseBranch || workspace.task?.targetBranch || "main"}
                        workingBranch={branchDisplay}
                      />
                    </div>
                  </CollapsibleSection>

                  {/* Changes */}
                  <CollapsibleSection
                    title="Changes"
                    icon={<Files className="h-4 w-4" />}
                    persistKey="sidebar-changes"
                    defaultExpanded={changedFiles.length > 0}
                    badge={changedFiles.length || undefined}
                    actions={
                      changedFiles.length > 0 ? (
                        <span
                          role="button"
                          onClick={() => setRightMainPanelMode("changes")}
                          className="text-[10px] text-primary hover:underline cursor-pointer"
                        >
                          View diff
                        </span>
                      ) : undefined
                    }
                  >
                    {changedFiles.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-muted-foreground text-center">No changes yet</p>
                    ) : (
                      <div className="divide-y divide-border/30">
                        {changedFiles.map((f) => (
                          <button
                            key={f.path}
                            onClick={() => {
                              setRightMainPanelMode("changes");
                            }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
                          >
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              f.status === "added" ? "bg-green-500" :
                              f.status === "deleted" ? "bg-red-500" : "bg-yellow-500"
                            )} />
                            <span className="text-xs truncate flex-1 font-mono">{f.path.split("/").pop()}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {f.additions > 0 && <span className="text-green-500">+{f.additions}</span>}
                              {f.additions > 0 && f.deletions > 0 && " "}
                              {f.deletions > 0 && <span className="text-red-500">-{f.deletions}</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </CollapsibleSection>

                  {/* Notes */}
                  <CollapsibleSection
                    title="Notes"
                    icon={<StickyNote className="h-4 w-4" />}
                    persistKey="sidebar-notes"
                    defaultExpanded={false}
                    maxHeight="max-h-[300px]"
                  >
                    <div className="p-2 h-[200px]">
                      <WorkspaceNotes workspaceId={id!} />
                    </div>
                  </CollapsibleSection>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Floating context bar */}
      <FloatingContextBar
        workspacePath={workspace.path || workspace.worktreePath || workspace.localPath}
        isDevServerRunning={isDevServerRunning}
        isDevServerStarting={isDevServerStarting}
        isDevServerStopping={isDevServerStopping}
        onStartDevServer={() => {
          startDevServer();
          setRightMainPanelMode("logs");
        }}
        onStopDevServer={stopDevServer}
      />
    </div>
  );
}
