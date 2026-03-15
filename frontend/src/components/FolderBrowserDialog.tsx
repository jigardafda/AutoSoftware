import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Folder, FolderGit2, ChevronRight, ArrowUp, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface FolderBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
  /** If true, only allow selecting git repos */
  requireGitRepo?: boolean;
}

export function FolderBrowserDialog({
  open,
  onOpenChange,
  onSelect,
  requireGitRepo = false,
}: FolderBrowserDialogProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [manualPath, setManualPath] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["filesystem-browse", currentPath],
    queryFn: () => api.filesystem.browse(currentPath || undefined),
    enabled: open,
  });

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setManualPath(path);
  };

  const handleGoUp = () => {
    if (data?.parent) {
      handleNavigate(data.parent);
    }
  };

  const handleManualNavigate = () => {
    if (manualPath.trim()) {
      setCurrentPath(manualPath.trim());
    }
  };

  const handleSelect = () => {
    if (data?.path) {
      onSelect(data.path);
      onOpenChange(false);
    }
  };

  const canSelect = data && (!requireGitRepo || data.isGitRepo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Folder</DialogTitle>
        </DialogHeader>

        {/* Path input */}
        <div className="flex items-center gap-2">
          <Input
            value={manualPath || data?.path || ""}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualNavigate()}
            placeholder="/path/to/folder"
            className="flex-1 font-mono text-xs"
          />
          <Button variant="outline" size="sm" onClick={handleManualNavigate}>
            Go
          </Button>
        </div>

        {/* Current path info */}
        {data && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleGoUp}
                disabled={!data.parent}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">
                {data.path}
              </span>
            </div>
            {data.isGitRepo && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                Git Repo
              </Badge>
            )}
          </div>
        )}

        {/* Directory listing */}
        <div className="border rounded-lg max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive text-center py-4">
              {(error as Error).message || "Failed to browse directory"}
            </p>
          ) : data?.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No subdirectories
            </p>
          ) : (
            data?.entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => handleNavigate(entry.path)}
                className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
              >
                {entry.isGitRepo ? (
                  <FolderGit2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm truncate flex-1">{entry.name}</span>
                {entry.isGitRepo && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600 border-green-500/30">
                    git
                  </Badge>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            ))
          )}
        </div>

        {requireGitRepo && data && !data.isGitRepo && (
          <p className="text-xs text-amber-500">
            Navigate to a folder that contains a .git directory.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={!canSelect}>
            Select{data?.isGitRepo ? "" : " Folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
