import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, FilePlus, FileX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { DiffFileList } from "@/components/diff/DiffFileList";

interface FileChange {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
  diff?: string;
}

interface WorkspaceFilesProps {
  workspaceId: string;
  className?: string;
}

export function WorkspaceFiles({ workspaceId, className }: WorkspaceFilesProps) {
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  const [diffMode, setDiffMode] = useState<"unified" | "split">("unified");

  const { data, isLoading } = useQuery<{ files: FileChange[] }>({
    queryKey: ["workspace-files", workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/files`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to load files");
      return data.data;
    },
    refetchInterval: 10_000,
  });

  const files = data?.files ?? [];
  const selectedFileData = files.find((f) => f.path === selectedFile);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full text-center px-6", className)}>
        <FileText className="h-8 w-8 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No file changes yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          File changes will appear here as the agent modifies code.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full", className)}>
      {/* File list sidebar */}
      <div className="w-64 shrink-0 border-r border-border/50">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Changed Files
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {files.length}
          </Badge>
        </div>
        <ScrollArea className="h-[calc(100%-37px)]">
          <DiffFileList
            files={files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />
        </ScrollArea>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 min-w-0">
        {selectedFileData?.diff ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
              <span className="text-xs font-mono text-muted-foreground truncate">
                {selectedFileData.path}
              </span>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={() => setDiffMode("unified")}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors",
                    diffMode === "unified"
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Unified
                </button>
                <button
                  onClick={() => setDiffMode("split")}
                  className={cn(
                    "px-2 py-1 rounded text-xs transition-colors",
                    diffMode === "split"
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Split
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <DiffViewer
                diff={selectedFileData.diff}
                fileName={selectedFileData.path}
                mode={diffMode}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileText className="h-6 w-6 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {selectedFile ? "No diff available for this file" : "Select a file to view changes"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
