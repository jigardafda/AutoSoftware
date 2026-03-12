import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Maximize2,
  Minimize2,
  Layout,
  X,
  Radio,
  Circle,
  Terminal,
  FileCode2,
  History,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TerminalOutput } from "./TerminalOutput";
import { LiveFilePreview } from "./LiveFilePreview";
import { useWebSocket } from "@/lib/websocket";
import { api } from "@/lib/api";

interface TerminalLine {
  timestamp: number;
  stream: "stdout" | "stderr";
  data: string;
  sequence: number;
}

interface FileChange {
  timestamp: number;
  operation: "create" | "modify" | "delete";
  filePath: string;
  oldContent?: string;
  newContent?: string;
  diff?: string;
  language?: string;
}

type LayoutMode = "split" | "terminal" | "files";

interface LiveExecutionViewProps {
  taskId: string;
  isActive?: boolean;
  className?: string;
  onClose?: () => void;
}

export function LiveExecutionView({
  taskId,
  isActive = true,
  className,
  onClose,
}: LiveExecutionViewProps) {
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();
  const [isLive, setIsLive] = useState(false);
  const [isHistorical, setIsHistorical] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("split");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load persisted execution logs on mount
  useEffect(() => {
    if (!taskId) return;

    setIsLoading(true);
    api.tasks
      .executionLogs(taskId)
      .then((data) => {
        if (data.terminalLines?.length > 0 || data.fileChanges?.length > 0) {
          setTerminalLines(data.terminalLines || []);
          setFileChanges(data.fileChanges || []);
          setIsHistorical(true);
        }
      })
      .catch((err) => {
        // Silently fail - might not have any persisted logs
        console.debug("No persisted execution logs:", err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [taskId]);

  // Subscribe to live execution events
  useEffect(() => {
    if (!taskId || !isActive) return;

    // Send live:subscribe message
    const socket = (window as any).__ws_socket;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "live:subscribe", payload: { taskId } }));
      setIsLive(true);
    }

    // Handle buffered output for late joiners
    const cleanupBuffered = addMessageHandler("live:buffered", (payload: any) => {
      if (payload.taskId !== taskId) return;

      if (payload.terminalLines?.length > 0) {
        setTerminalLines((prev) => {
          // Merge with existing, avoiding duplicates by sequence
          const existingSeqs = new Set(prev.map((l) => l.sequence));
          const newLines = payload.terminalLines.filter(
            (l: TerminalLine) => !existingSeqs.has(l.sequence)
          );
          return [...prev, ...newLines];
        });
      }
      if (payload.fileChanges?.length > 0) {
        setFileChanges((prev) => {
          // Merge with existing, avoiding duplicates by timestamp+filePath
          const existingKeys = new Set(prev.map((c) => `${c.timestamp}:${c.filePath}`));
          const newChanges = payload.fileChanges.filter(
            (c: FileChange) => !existingKeys.has(`${c.timestamp}:${c.filePath}`)
          );
          return [...prev, ...newChanges];
        });
      }
    });

    // Handle terminal output
    const cleanupTerminal = addMessageHandler("terminal:output", (payload: any) => {
      if (payload.taskId !== taskId) return;

      setTerminalLines((prev) => {
        // Check if we already have this sequence
        if (prev.some((l) => l.sequence === payload.sequence)) {
          return prev;
        }
        return [
          ...prev,
          {
            timestamp: payload.timestamp,
            stream: payload.stream,
            data: payload.data,
            sequence: payload.sequence,
          },
        ];
      });
    });

    // Handle file changes
    const cleanupFile = addMessageHandler("file:change", (payload: any) => {
      if (payload.taskId !== taskId) return;

      setFileChanges((prev) => [
        ...prev,
        {
          timestamp: payload.timestamp,
          operation: payload.operation,
          filePath: payload.filePath,
          oldContent: payload.oldContent,
          newContent: payload.newContent,
          diff: payload.diff,
          language: payload.language,
        },
      ]);
    });

    // Subscribe to task resource
    subscribe(`task:${taskId}:live`);

    return () => {
      cleanupBuffered();
      cleanupTerminal();
      cleanupFile();
      unsubscribe(`task:${taskId}:live`);

      // Send live:unsubscribe message
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "live:unsubscribe", payload: { taskId } }));
      }
      setIsLive(false);
    };
  }, [taskId, isActive, subscribe, unsubscribe, addMessageHandler]);

  // Handle fullscreen toggle
  const toggleFullScreen = useCallback(() => {
    if (!containerRef.current) return;

    if (isFullScreen) {
      document.exitFullscreen?.();
    } else {
      containerRef.current.requestFullscreen?.();
    }
    setIsFullScreen(!isFullScreen);
  }, [isFullScreen]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col h-full bg-background border rounded-lg overflow-hidden",
        isFullScreen && "fixed inset-0 z-50 rounded-none",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isLive ? (
              <>
                <Radio className="h-4 w-4 text-green-500 animate-pulse" />
                <span className="text-sm font-medium">Live Execution</span>
              </>
            ) : isHistorical ? (
              <>
                <History className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Execution History</span>
              </>
            ) : (
              <>
                <Circle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Execution</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Terminal className="h-3 w-3" />
              {terminalLines.length}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <FileCode2 className="h-3 w-3" />
              {fileChanges.length}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Layout toggle */}
          <div className="flex items-center border rounded-md overflow-hidden mr-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={layoutMode === "split" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7 rounded-none"
                    onClick={() => setLayoutMode("split")}
                  >
                    <Layout className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Split view</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={layoutMode === "terminal" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7 rounded-none"
                    onClick={() => setLayoutMode("terminal")}
                  >
                    <Terminal className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Terminal only</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={layoutMode === "files" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7 rounded-none"
                    onClick={() => setLayoutMode("files")}
                  >
                    <FileCode2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Files only</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleFullScreen}
                >
                  {isFullScreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isFullScreen ? "Exit full screen" : "Full screen"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {layoutMode !== "files" && (
          <div
            className={cn(
              "flex flex-col min-h-0 border-r overflow-hidden",
              layoutMode === "split" ? "w-1/2 max-w-[50%]" : "flex-1"
            )}
          >
            <TerminalOutput lines={terminalLines} className="h-full" />
          </div>
        )}

        {layoutMode !== "terminal" && (
          <div
            className={cn(
              "flex flex-col min-h-0 overflow-hidden relative",
              layoutMode === "split" ? "w-1/2 max-w-[50%]" : "flex-1"
            )}
          >
            <LiveFilePreview changes={fileChanges} className="h-full" />
          </div>
        )}
      </div>
    </div>
  );
}
