import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import {
  ArrowLeft,
  Bot,
  GitBranch,
  Square,
  Terminal as TerminalIcon,
  Files,
  Globe,
  Loader2,
  Circle,
  X,
  ScrollText,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiffFileList } from "@/components/diff/DiffFileList";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import {
  ArtifactPreview,
} from "@/components/workspace/chat";
import type { Artifact } from "@/components/workspace/chat/ArtifactDetector";
import type { ChatEntry } from "@/components/workspace/chat/types";
import { WorkspaceChatPanel, type ElementRef } from "@/components/workspace/WorkspaceChatPanel";
import { WorkspaceToolbar } from "@/components/workspace/WorkspaceToolbar";
import { FloatingContextBar } from "@/components/workspace/FloatingContextBar";
import { CollapsibleSection } from "@/components/workspace/CollapsibleSection";
import { GitPanel } from "@/components/workspace/GitPanel";
import { ProcessList } from "@/components/workspace/ProcessList";
import WorkspaceNotes from "@/components/workspace/WorkspaceNotes";
import { WorkspaceTerminal } from "@/components/workspace/WorkspaceTerminal";
import { WorkspaceBrowser } from "@/components/workspace/WorkspaceBrowser";
import { useDevServer } from "@/hooks/useDevServer";

const API = "/api";

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

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
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

  const {
    showRightSidebar,
    rightMainPanelMode,
    setRightMainPanelMode,
  } = useWorkspaceStore();

  // Layout-level state (managed here, fed to/from chat panel via callbacks)
  const [terminalContent, setTerminalContent] = useState<{ toolName: string; command?: string; output: string; isError?: boolean } | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [elementRefs, setElementRefs] = useState<ElementRef[]>([]);
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);

  const { data: workspace, isLoading } = useQuery({
    queryKey: ["workspace", id],
    queryFn: () => fetchWorkspace(id!),
    enabled: !!id,
    refetchInterval: 15_000,
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

  const { data: diff = "" } = useQuery({
    queryKey: ["workspace-diff", id],
    queryFn: () => fetchDiff(id!),
    enabled: !!id,
    refetchInterval: isAgentWorking ? 5000 : false,
  });

  const { data: rawChangedFiles = [] } = useQuery<ChangedFile[]>({
    queryKey: ["workspace-files", id],
    queryFn: () => fetchChangedFiles(id!),
    enabled: !!id,
    refetchInterval: isAgentWorking ? 5000 : false,
  });

  // Filter out .auto-software/ internal files from the changes list
  const changedFiles = useMemo(() =>
    rawChangedFiles.filter((f) => !f.path.includes('.auto-software/')),
    [rawChangedFiles]
  );

  const changesStats = useMemo(() => ({
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

  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new Event("open-command-palette"));
  }, []);

  // Build process list from entries for the Logs panel
  const sessionActive = entries.some(e => e.type === "tool_call" || e.type === "agent_message");
  const processes = useMemo(() => {
    const procs: Array<{
      id: string;
      type: "coding_agent" | "dev_server" | "terminal" | "script";
      status: "running" | "completed" | "failed" | "stopped";
      label: string;
      startedAt: Date;
    }> = [];

    if (sessionActive || isAgentWorking) {
      procs.push({
        id: "agent-session",
        type: "coding_agent",
        status: isAgentWorking ? "running" : "completed",
        label: `${AGENT_LABELS[workspace?.agentId] || "Agent"} session`,
        startedAt: entries.length > 0 ? new Date(entries[0].timestamp) : new Date(),
      });
    }

    for (const dp of devServerProcesses) {
      procs.push({
        id: dp.id,
        type: "dev_server",
        status: dp.status === "running" ? "running" : dp.status === "killed" ? "stopped" : dp.status === "completed" ? "completed" : "failed",
        label: "Dev Server",
        startedAt: new Date(dp.startedAt),
      });
    }

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
  }, [entries, sessionActive, isAgentWorking, workspace?.agentId, devServerProcesses]);

  // Chat panel callbacks
  const chatCallbacks = useMemo(() => ({
    onTerminalContent: (content: { toolName: string; command?: string; output: string; isError?: boolean }) => {
      setTerminalContent(content);
      setRightMainPanelMode("logs");
    },
    onAgentWorkingChange: (working: boolean) => {
      setIsAgentWorking(working);
    },
    onEntriesChange: (newEntries: ChatEntry[]) => {
      setEntries(newEntries);
    },
    onArtifactSelect: (artifact: Artifact) => {
      setSelectedArtifact(artifact);
      setRightMainPanelMode("preview");
    },
    onChangesClick: () => {
      setRightMainPanelMode("changes");
    },
  }), [setRightMainPanelMode]);

  if (isLoading || !workspace) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const agentLabel = AGENT_LABELS[workspace.agentId] || workspace.agentId;
  const branchDisplay = workspace.worktreeBranch || workspace.branch;

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
            <WorkspaceChatPanel
              workspaceId={id!}
              workspace={workspace}
              showContextBanner={true}
              showSessionSelector={true}
              showFullInputBar={true}
              changesStats={changesStats}
              elementRefs={elementRefs}
              onElementRefsChange={setElementRefs}
              useStorePermissionPolicy={true}
              callbacks={chatCallbacks}
              className="h-full"
            />
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
                        const isDevServer = devServerProcesses.some(dp => dp.id === procId);
                        if (isDevServer) {
                          selectDevServerProcess(procId);
                          setRightMainPanelMode("logs");
                        } else {
                          const entry = entries.find(e => e.id === procId);
                          if (entry) {
                            const meta = entry.metadata as any;
                            if (meta) {
                              let cmd: string | undefined;
                              try { cmd = JSON.parse(meta.toolInput || "{}")?.command; } catch {}
                              setTerminalContent({ toolName: meta.toolName || "Tool", command: cmd, output: meta.result || "", isError: meta.status === "error" });
                              setRightMainPanelMode("logs");
                            }
                          }
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
