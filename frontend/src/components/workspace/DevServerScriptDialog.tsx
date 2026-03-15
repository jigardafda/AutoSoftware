import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Save, Loader2, CheckCircle2, XCircle, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API = import.meta.env.VITE_API_URL || "";

interface DevServerScriptDialogProps {
  open: boolean;
  onClose: () => void;
  repositoryId?: string | null;
  workspaceId: string;
  initialScript: string;
  /** Called after save succeeds to refresh data */
  onSaved?: () => void;
  /** Called after save-and-test starts the server */
  onStarted?: () => void;
}

export function DevServerScriptDialog({
  open,
  onClose,
  repositoryId,
  workspaceId,
  initialScript,
  onSaved,
  onStarted,
}: DevServerScriptDialogProps) {
  const [script, setScript] = useState(initialScript || "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [logs, setLogs] = useState("");
  const [processStatus, setProcessStatus] = useState<
    "idle" | "running" | "completed" | "failed" | "killed" | null
  >(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setScript(initialScript || "");
      setLogs("");
      setProcessStatus(null);
      setExitCode(null);
    }
  }, [open, initialScript]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const hasChanges = script !== (initialScript || "");

  const saveScript = useCallback(async () => {
    setSaving(true);
    try {
      if (repositoryId) {
        // Save to repository (shared across workspaces)
        await fetch(`${API}/api/repos/${repositoryId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ devServerScript: script || null }),
        });
      } else {
        // Save to workspace directly (local workspaces)
        await fetch(`${API}/api/workspaces/${workspaceId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ devServerScript: script || null }),
        });
      }
      onSaved?.();
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, [repositoryId, workspaceId, script, onSaved]);

  const handleSave = async () => {
    await saveScript();
  };

  const handleSaveAndTest = async () => {
    setTesting(true);
    setLogs("");
    setProcessStatus("running");
    setExitCode(null);

    // 1. Save the script
    const saved = await saveScript();
    if (!saved) {
      setTesting(false);
      setProcessStatus("failed");
      return;
    }

    // 2. Start the dev server
    try {
      const res = await fetch(
        `${API}/api/workspaces/${workspaceId}/dev-server/start`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLogs(err.error || "Failed to start dev server\n");
        setProcessStatus("failed");
        setTesting(false);
        return;
      }

      const data = await res.json();
      const processId = data.process?.id;

      if (!processId) {
        setProcessStatus("failed");
        setTesting(false);
        return;
      }

      onStarted?.();

      // 3. Stream logs via WebSocket
      const WS_URL =
        import.meta.env.VITE_WS_URL ||
        `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

      const ws = new WebSocket(`${WS_URL}/ws/workspace/${workspaceId}`);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({ type: "devserver:subscribe", processId })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "devserver:logs") {
            setLogs(msg.data || "");
          }
          if (msg.type === "devserver:log") {
            setLogs((prev) => prev + (msg.data || ""));
          }
          if (msg.type === "devserver:exit") {
            setProcessStatus(msg.status);
            setExitCode(msg.exitCode);
            setTesting(false);
            ws.close();
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        setTesting(false);
      };

      ws.onclose = () => {
        // If still in "running" state after 30s, consider it successful (dev servers don't exit)
        setTesting(false);
      };

      // For dev servers that keep running, stop polling after 10s
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          setTesting(false);
          // Don't close WS - keep streaming logs
        }
      }, 10000);
    } catch {
      setProcessStatus("failed");
      setTesting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold">Dev Server Script</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Script Editor */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Script (edit)
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="e.g. cd frontend && npm run dev"
              className="w-full h-32 px-3 py-2 rounded-md border bg-muted/30 font-mono text-sm resize-none outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This script runs in the workspace worktree directory. Use
              relative paths to subdirectories.
            </p>
          </div>

          {/* Execution Logs */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-foreground">
                Last Execution Logs
              </label>
              {processStatus && (
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  {processStatus === "running" && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                      <span className="text-blue-500">Running</span>
                    </>
                  )}
                  {processStatus === "completed" && (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span className="text-green-500">Success</span>
                    </>
                  )}
                  {processStatus === "failed" && (
                    <>
                      <XCircle className="h-3 w-3 text-red-500" />
                      <span className="text-red-500">
                        Failed with exit code {exitCode ?? "?"}
                      </span>
                    </>
                  )}
                  {processStatus === "killed" && (
                    <>
                      <Circle className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Killed</span>
                    </>
                  )}
                </span>
              )}
            </div>
            <div
              ref={logsContainerRef}
              className="h-48 rounded-md border bg-muted/30 overflow-auto font-mono text-xs p-3 whitespace-pre-wrap"
            >
              {logs ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: ansiToHtml(logs),
                  }}
                />
              ) : (
                <span className="text-muted-foreground italic">
                  No logs yet. Click "Save and Test" to run the script.
                </span>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save
          </Button>
          <Button onClick={handleSaveAndTest} disabled={testing || !script.trim()}>
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Play className="h-4 w-4 mr-1.5" />
            )}
            Save and Test
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Simple ANSI escape code → HTML converter for colored output */
function ansiToHtml(text: string): string {
  const ANSI_COLORS: Record<string, string> = {
    "30": "#484f58",
    "31": "#ff7b72",
    "32": "#7ee787",
    "33": "#e3b341",
    "34": "#79c0ff",
    "35": "#d2a8ff",
    "36": "#a5d6ff",
    "37": "#b1bac4",
    "90": "#6e7681",
    "91": "#ffa198",
    "92": "#56d364",
    "93": "#e3b341",
    "94": "#79c0ff",
    "95": "#d2a8ff",
    "96": "#a5d6ff",
    "97": "#f0f6fc",
  };

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /\x1b\[(\d+)m/g,
      (_, code) => {
        if (code === "0" || code === "39") return "</span>";
        const color = ANSI_COLORS[code];
        if (color) return `<span style="color:${color}">`;
        if (code === "1") return `<span style="font-weight:bold">`;
        return "";
      }
    );
}
