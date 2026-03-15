import { FileCode, Eye, EyeOff, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChangesStats } from "./types";

interface ChangesBarProps {
  stats: ChangesStats;
  showChangesPanel: boolean;
  onToggleChangesPanel: () => void;
  className?: string;
}

export function ChangesBar({
  stats,
  showChangesPanel,
  onToggleChangesPanel,
  className,
}: ChangesBarProps) {
  if (stats.filesChanged === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 border-t border-border/50 bg-muted/30 text-xs",
        className
      )}
    >
      <button
        onClick={onToggleChangesPanel}
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors",
          "hover:bg-muted text-muted-foreground hover:text-foreground",
          showChangesPanel && "bg-primary/10 text-primary border border-primary/20"
        )}
      >
        <FileCode className="h-3.5 w-3.5" />
        <span className="font-medium">
          {stats.filesChanged} file{stats.filesChanged !== 1 ? "s" : ""} changed
        </span>
        {(stats.additions > 0 || stats.deletions > 0) && (
          <span className="ml-0.5">
            {stats.additions > 0 && (
              <span className="text-green-500 font-mono">+{stats.additions}</span>
            )}
            {stats.additions > 0 && stats.deletions > 0 && " "}
            {stats.deletions > 0 && (
              <span className="text-red-500 font-mono">-{stats.deletions}</span>
            )}
          </span>
        )}
      </button>

      <div className="flex-1" />

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onToggleChangesPanel}
            >
              {showChangesPanel ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {showChangesPanel ? "Hide changes" : "View changes"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
