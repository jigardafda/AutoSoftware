import { useState } from "react";
import {
  Terminal,
  FileText,
  Search,
  Globe,
  Code,
  ChevronDown,
  Check,
  X,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCallStatus } from "./types";

interface ToolCallEntryProps {
  toolName: string;
  summary: string;
  status: ToolCallStatus;
  result?: string;
  command?: string;
  onShowInTerminal?: () => void;
  className?: string;
}

function getToolIcon(toolName: string) {
  const name = toolName.toLowerCase();
  if (name === "bash" || name.includes("terminal") || name.includes("command"))
    return Terminal;
  if (name.includes("read") || name.includes("file") || name.includes("edit") || name.includes("write"))
    return FileText;
  if (name.includes("search") || name.includes("grep") || name.includes("glob") || name.includes("find"))
    return Search;
  if (name.includes("web") || name.includes("fetch") || name.includes("browser"))
    return Globe;
  return Code;
}

function StatusDot({ status }: { status: ToolCallStatus }) {
  return (
    <span
      className={cn(
        "absolute -bottom-0.5 -left-0.5 h-2 w-2 rounded-full border border-background",
        status === "running" && "bg-blue-500 animate-pulse",
        status === "success" && "bg-green-500",
        status === "error" && "bg-red-500",
        status === "denied" && "bg-orange-500"
      )}
    />
  );
}

export function ToolCallEntry({
  toolName,
  summary,
  status,
  result,
  command,
  onShowInTerminal,
  className,
}: ToolCallEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(toolName);
  const hasDetails = Boolean(result || command);
  const isBash = toolName.toLowerCase() === "bash" || toolName.toLowerCase().includes("terminal") || toolName.toLowerCase().includes("command");

  // For Bash tools: clicking opens terminal; for others: expand/collapse inline
  const handleClick = () => {
    if (!hasDetails) return;
    if (isBash && onShowInTerminal) {
      onShowInTerminal();
    } else {
      setExpanded(!expanded);
    }
  };

  return (
    <div className={cn("group/tool", className)}>
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground py-0.5",
          hasDetails && "cursor-pointer hover:text-foreground"
        )}
        onClick={handleClick}
      >
        <span className="relative shrink-0 pt-0.5">
          <Icon className="h-4 w-4" />
          <StatusDot status={status} />
        </span>
        <span className={cn("flex-1 min-w-0", !expanded && "truncate")}>
          {summary}
        </span>
        {isBash && hasDetails && onShowInTerminal ? (
          <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        ) : hasDetails ? (
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 transition-transform text-muted-foreground/50",
              expanded && "rotate-180"
            )}
          />
        ) : null}
      </div>

      {expanded && hasDetails && (
        <div className="ml-6 mt-1 rounded-md border border-border/50 bg-muted/30 overflow-hidden">
          {command && (
            <div className="px-3 py-2 border-b border-border/30 bg-muted/50">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
                <Terminal className="h-3 w-3" />
                Command
              </div>
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                {command}
              </pre>
            </div>
          )}
          {result && (
            <div className="px-3 py-2">
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Shows a group of aggregated tool calls (e.g. "Read 3 files")
 */
interface AggregatedToolCallsProps {
  toolName: string;
  count: number;
  entries: Array<{ summary: string; status: ToolCallStatus }>;
  className?: string;
}

export function AggregatedToolCalls({
  toolName,
  count,
  entries,
  className,
}: AggregatedToolCallsProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(toolName);

  const allSuccess = entries.every((e) => e.status === "success");
  const anyError = entries.some((e) => e.status === "error");
  const anyRunning = entries.some((e) => e.status === "running");
  const overallStatus: ToolCallStatus = anyRunning
    ? "running"
    : anyError
      ? "error"
      : allSuccess
        ? "success"
        : "running";

  return (
    <div className={cn("group", className)}>
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground py-0.5 cursor-pointer hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="relative shrink-0 pt-0.5">
          <Icon className="h-4 w-4" />
          <StatusDot status={overallStatus} />
        </span>
        <span className="flex-1 truncate">
          {toolName} ({count} calls)
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform text-muted-foreground/50",
            expanded && "rotate-180"
          )}
        />
      </div>
      {expanded && (
        <div className="ml-6 mt-1 space-y-0.5">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs text-muted-foreground/80"
            >
              {entry.status === "success" ? (
                <Check className="h-3 w-3 text-green-500 shrink-0" />
              ) : entry.status === "error" ? (
                <X className="h-3 w-3 text-red-500 shrink-0" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />
              )}
              <span className="truncate">{entry.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
