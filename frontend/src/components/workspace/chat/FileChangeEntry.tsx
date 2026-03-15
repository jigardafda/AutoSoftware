import { useState } from "react";
import { FileText, FilePlus, FileX, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileChangeEntryProps {
  filename: string;
  additions?: number;
  deletions?: number;
  status?: "modified" | "added" | "deleted";
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}

function getFileIcon(status?: string) {
  switch (status) {
    case "added":
      return FilePlus;
    case "deleted":
      return FileX;
    default:
      return FileText;
  }
}

export function FileChangeEntry({
  filename,
  additions,
  deletions,
  status = "modified",
  expanded = false,
  onToggle,
  className,
}: FileChangeEntryProps) {
  const Icon = getFileIcon(status);
  const hasStats = additions !== undefined || deletions !== undefined;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded border border-border/50 bg-muted/30 px-2.5 py-1.5",
        status === "deleted" && "bg-red-500/5 border-red-500/20",
        status === "added" && "bg-green-500/5 border-green-500/20",
        onToggle && "cursor-pointer hover:bg-muted/50 transition-colors",
        className
      )}
      onClick={onToggle}
    >
      <span className="relative shrink-0">
        <Icon
          className={cn(
            "h-4 w-4",
            status === "added" && "text-green-500",
            status === "deleted" && "text-red-500",
            status === "modified" && "text-blue-500"
          )}
        />
      </span>
      <span className="text-sm text-foreground truncate flex-1">{filename}</span>
      {hasStats && (
        <span className="text-xs shrink-0 flex items-center gap-1">
          {additions !== undefined && additions > 0 && (
            <span className="text-green-500">+{additions}</span>
          )}
          {deletions !== undefined && deletions > 0 && (
            <span className="text-red-500">-{deletions}</span>
          )}
        </span>
      )}
      {onToggle && (
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform",
            expanded && "rotate-180"
          )}
        />
      )}
    </div>
  );
}
