import { useState } from "react";
import { Terminal, Code, Globe, Settings, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Process {
  id: string;
  type: "coding_agent" | "dev_server" | "terminal" | "script";
  status: "running" | "completed" | "failed" | "stopped";
  label: string;
  startedAt: string | Date;
}

interface ProcessListProps {
  processes: Process[];
  activeProcessId?: string;
  onSelectProcess: (id: string) => void;
  onSelectTerminal: () => void;
  className?: string;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 30) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 1) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

const typeIcons: Record<Process["type"], typeof Terminal> = {
  terminal: Terminal,
  coding_agent: Code,
  dev_server: Globe,
  script: Settings,
};

const statusStyles: Record<Process["status"], { dot: string; ring?: string }> = {
  running: { dot: "bg-green-500", ring: "animate-pulse ring-2 ring-green-500/30" },
  completed: { dot: "bg-muted-foreground/40" },
  failed: { dot: "bg-red-500" },
  stopped: { dot: "bg-muted-foreground/40" },
};

function ProcessListItem({
  process,
  isActive,
  onClick,
}: {
  process: Process;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = typeIcons[process.type];
  const status = statusStyles[process.status];
  const timestamp = process.startedAt instanceof Date
    ? process.startedAt
    : new Date(process.startedAt);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2 rounded-md text-left transition-colors",
        "hover:bg-accent/60",
        isActive && "bg-accent text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

      <div className="flex-1 min-w-0">
        <span className="text-sm truncate block">{process.label}</span>
      </div>

      <span className="text-[11px] text-muted-foreground shrink-0">
        {formatRelativeTime(timestamp)}
      </span>

      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          status.dot,
          status.ring
        )}
      />
    </button>
  );
}

export function ProcessList({
  processes,
  activeProcessId,
  onSelectProcess,
  onSelectTerminal,
  className,
}: ProcessListProps) {
  const [filter, setFilter] = useState("");

  const sorted = [...processes]
    .sort((a, b) => {
      const dateA = a.startedAt instanceof Date ? a.startedAt.getTime() : new Date(a.startedAt).getTime();
      const dateB = b.startedAt instanceof Date ? b.startedAt.getTime() : new Date(b.startedAt).getTime();
      return dateB - dateA;
    });

  const filtered = filter.trim()
    ? sorted.filter((p) =>
        p.label.toLowerCase().includes(filter.toLowerCase()) ||
        p.type.toLowerCase().includes(filter.toLowerCase())
      )
    : sorted;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Terminal button — always visible */}
      <div className="px-2 pt-2 pb-1">
        <button
          type="button"
          onClick={onSelectTerminal}
          className={cn(
            "flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-left transition-colors",
            "hover:bg-accent/60 border border-border/60",
            !activeProcessId && "bg-accent text-accent-foreground border-primary/30"
          )}
        >
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Terminal</span>
        </button>
      </div>

      {/* Process entries */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {filtered.map((proc) => (
          <ProcessListItem
            key={proc.id}
            process={proc}
            isActive={activeProcessId === proc.id}
            onClick={() => onSelectProcess(proc.id)}
          />
        ))}

        {filtered.length === 0 && filter.trim() && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No processes match "{filter}"
          </p>
        )}
      </div>

      {/* Search / filter input */}
      <div className="px-2 pb-2 pt-1 border-t border-border/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className={cn(
              "w-full h-8 pl-8 pr-3 rounded-md text-xs",
              "bg-muted/50 border border-border/60",
              "placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-1 focus:ring-ring"
            )}
          />
        </div>
      </div>
    </div>
  );
}
