import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const API = import.meta.env.VITE_API_URL || "";
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

export interface DevServerProcessInfo {
  id: string;
  workspaceId: string;
  repositoryId: string;
  repoName: string;
  script: string;
  status: "running" | "completed" | "failed" | "killed";
  exitCode: number | null;
  startedAt: number;
  completedAt: number | null;
}

// Strip ANSI escape codes before URL detection
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// Regex patterns to detect dev server URLs in logs
const URL_PATTERN =
  /(https?:\/\/(?:\[[0-9a-f:]+\]|localhost|127\.0\.0\.1|0\.0\.0\.0|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})?(?:\/\S*)?)/gi;

function detectUrlFromLogs(logs: string): string | null {
  const clean = stripAnsi(logs);
  const matches = clean.match(URL_PATTERN);
  if (!matches) return null;

  // Prefer localhost URLs
  const localhostUrl = matches.find(
    (u) => u.includes("localhost") || u.includes("127.0.0.1")
  );
  return localhostUrl || matches[matches.length - 1] || null;
}

export function useDevServer(workspaceId: string | undefined) {
  const [processes, setProcesses] = useState<DevServerProcessInfo[]>([]);
  const [logs, setLogs] = useState<string>("");
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [selectedProcessLogs, setSelectedProcessLogs] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const logsRef = useRef<string>("");

  // Fetch current dev server processes
  const fetchProcesses = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(`${API}/api/workspaces/${workspaceId}/dev-server`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setProcesses(data.processes || []);
      }
    } catch {
      // ignore
    }
  }, [workspaceId]);

  // Initial fetch
  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  // Subscribe to log streaming for active process
  useEffect(() => {
    const runningProc = processes.find((p) => p.status === "running");
    if (!runningProc || !workspaceId) return;

    // Connect WebSocket for log streaming
    const ws = new WebSocket(`${WS_URL}/ws/workspace/${workspaceId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "devserver:subscribe",
          processId: runningProc.id,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "devserver:logs") {
          logsRef.current = msg.data || "";
          setLogs(logsRef.current);
          // Also update selected process logs if this is the selected one
          if (selectedProcessId === msg.processId || selectedProcessId === null) {
            setSelectedProcessLogs(logsRef.current);
          }
          const url = detectUrlFromLogs(logsRef.current);
          if (url) setDetectedUrl(url);
        }

        if (msg.type === "devserver:log") {
          logsRef.current += msg.data || "";
          setLogs(logsRef.current);
          if (selectedProcessId === msg.processId || selectedProcessId === null) {
            setSelectedProcessLogs(logsRef.current);
          }
          const url = detectUrlFromLogs(logsRef.current);
          if (url) setDetectedUrl(url);
        }

        if (msg.type === "devserver:exit") {
          setProcesses((prev) =>
            prev.map((p) =>
              p.id === msg.processId
                ? { ...p, status: msg.status, exitCode: msg.exitCode }
                : p
            )
          );
        }

        if (msg.type === "devserver:status") {
          setProcesses((prev) =>
            prev.map((p) =>
              p.id === msg.processId
                ? { ...p, status: msg.status, exitCode: msg.exitCode }
                : p
            )
          );
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [processes, workspaceId, selectedProcessId]);

  // Fetch logs for a specific process (for viewing historical logs)
  const fetchProcessLogs = useCallback(async (processId: string) => {
    if (!workspaceId) return;
    setSelectedProcessId(processId);

    // If it's the running process, logs are already streaming
    const runningProc = processes.find((p) => p.status === "running");
    if (runningProc && runningProc.id === processId) {
      setSelectedProcessLogs(logsRef.current);
      return;
    }

    // Fetch historical logs via REST
    try {
      const res = await fetch(
        `${API}/api/workspaces/${workspaceId}/dev-server/${processId}/logs`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedProcessLogs(data.logs || "");
      }
    } catch {
      setSelectedProcessLogs("[Failed to fetch logs]");
    }
  }, [workspaceId, processes]);

  const start = useCallback(async () => {
    if (!workspaceId || isStarting) return;
    setIsStarting(true);
    setLogs("");
    logsRef.current = "";
    setDetectedUrl(null);
    setSelectedProcessLogs("");

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
      if (res.ok) {
        const data = await res.json();
        if (data.process) {
          setProcesses((prev) => [data.process, ...prev]);
          setSelectedProcessId(data.process.id);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start dev server");
      }
    } finally {
      setIsStarting(false);
    }
  }, [workspaceId, isStarting]);

  const stop = useCallback(async () => {
    if (!workspaceId || isStopping) return;
    setIsStopping(true);

    try {
      await fetch(`${API}/api/workspaces/${workspaceId}/dev-server/stop`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setProcesses((prev) =>
        prev.map((p) =>
          p.status === "running" ? { ...p, status: "killed" as const } : p
        )
      );
      setDetectedUrl(null);
    } finally {
      setIsStopping(false);
    }
  }, [workspaceId, isStopping]);

  const runningDevServers = useMemo(
    () => processes.filter((p) => p.status === "running"),
    [processes]
  );

  const isServerRunning = runningDevServers.length > 0;

  const failedProcess = useMemo(
    () => processes.find((p) => p.status === "failed"),
    [processes]
  );

  return {
    processes,
    logs,
    detectedUrl,
    isStarting,
    isStopping,
    isServerRunning,
    runningDevServers,
    failedProcess,
    selectedProcessId,
    selectedProcessLogs,
    start,
    stop,
    refetch: fetchProcesses,
    selectProcess: fetchProcessLogs,
  };
}
