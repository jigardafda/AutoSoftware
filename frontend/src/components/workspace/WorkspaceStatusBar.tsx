import { useState, useEffect } from "react";
import { Bot, GitBranch, Clock, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WorkspaceStatusBarProps {
  workspaceName: string;
  agentName: string;
  branchName?: string;
  sessionStatus: "active" | "stopped" | "idle";
  startedAt?: string;
}

export function WorkspaceStatusBar({
  workspaceName,
  agentName,
  branchName,
  sessionStatus,
  startedAt,
}: WorkspaceStatusBarProps) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!startedAt || sessionStatus !== "active") {
      setElapsed("");
      return;
    }

    const updateElapsed = () => {
      const start = new Date(startedAt).getTime();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;

      if (hours > 0) {
        setElapsed(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setElapsed(`${minutes}m ${seconds}s`);
      } else {
        setElapsed(`${seconds}s`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startedAt, sessionStatus]);

  const statusConfig = {
    active: { color: "bg-green-500", label: "Active", textColor: "text-green-500" },
    stopped: { color: "bg-red-500", label: "Stopped", textColor: "text-red-500" },
    idle: { color: "bg-yellow-500", label: "Idle", textColor: "text-yellow-500" },
  };

  const status = statusConfig[sessionStatus];

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-border/50 bg-card/50 backdrop-blur-sm">
      {/* Left: Workspace info */}
      <div className="flex items-center gap-4 min-w-0">
        <h1 className="text-sm font-semibold truncate">{workspaceName}</h1>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          <span>{agentName}</span>
        </div>

        {branchName && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            <span className="font-mono">{branchName}</span>
          </div>
        )}
      </div>

      {/* Right: Status indicators */}
      <div className="flex items-center gap-3 shrink-0">
        {elapsed && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{elapsed}</span>
          </div>
        )}

        <Badge
          variant="secondary"
          className={cn(
            "gap-1.5 text-xs font-medium",
            status.textColor
          )}
        >
          <Circle className={cn("h-2 w-2 fill-current", status.textColor)} />
          {status.label}
        </Badge>
      </div>
    </div>
  );
}
