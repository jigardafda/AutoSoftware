import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  File,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getFileIcon } from "@/lib/file-utils";

interface FileTreeProps {
  repoId: string;
  branch?: string | null;
  onSelectFile: (path: string) => void;
  selectedPath?: string | null;
  onBranchChange?: (branch: string | null) => void;
}

const ICON_MAP = {
  folder: Folder,
  "folder-open": FolderOpen,
  "file-code": FileCode,
  "file-text": FileText,
  file: File,
} as const;

function DirectoryNode({
  entry,
  repoId,
  branch,
  level,
  expandedDirs,
  toggleDir,
  onSelectFile,
  selectedPath,
}: {
  entry: any;
  repoId: string;
  branch?: string | null;
  level: number;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  selectedPath?: string | null;
}) {
  const isExpanded = expandedDirs.has(entry.path);

  const { data: result, isLoading } = useQuery({
    queryKey: ["repo-tree", repoId, entry.path, branch],
    queryFn: () => api.repos.tree(repoId, entry.path, branch || undefined),
    enabled: isExpanded,
  });

  const children = result?.data;
  const FolderIcon = isExpanded ? FolderOpen : Folder;

  return (
    <div>
      <button
        className={cn(
          "flex items-center gap-1.5 w-full text-left py-1 px-2 text-sm hover:bg-accent/50 rounded-sm transition-colors",
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => toggleDir(entry.path)}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <FolderIcon className="h-4 w-4 shrink-0 text-blue-500" />
        <span className="truncate">{entry.name}</span>
      </button>
      {isExpanded && (
        <div>
          {isLoading ? (
            <div className="space-y-1 py-1" style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
            </div>
          ) : (
            children?.map((child: any) => (
              <TreeNode
                key={child.path}
                entry={child}
                repoId={repoId}
                branch={branch}
                level={level + 1}
                expandedDirs={expandedDirs}
                toggleDir={toggleDir}
                onSelectFile={onSelectFile}
                selectedPath={selectedPath}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FileNode({
  entry,
  level,
  onSelectFile,
  selectedPath,
}: {
  entry: any;
  level: number;
  onSelectFile: (path: string) => void;
  selectedPath?: string | null;
}) {
  const iconType = getFileIcon(entry.name, "file");
  const IconComponent = ICON_MAP[iconType];
  const isSelected = selectedPath === entry.path;

  return (
    <button
      className={cn(
        "flex items-center gap-1.5 w-full text-left py-1 px-2 text-sm hover:bg-accent/50 rounded-sm transition-colors",
        isSelected && "bg-accent",
      )}
      style={{ paddingLeft: `${level * 16 + 8 + 18}px` }}
      onClick={() => onSelectFile(entry.path)}
    >
      <IconComponent className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

function TreeNode({
  entry,
  repoId,
  branch,
  level,
  expandedDirs,
  toggleDir,
  onSelectFile,
  selectedPath,
}: {
  entry: any;
  repoId: string;
  branch?: string | null;
  level: number;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  selectedPath?: string | null;
}) {
  if (entry.type === "directory") {
    return (
      <DirectoryNode
        entry={entry}
        repoId={repoId}
        branch={branch}
        level={level}
        expandedDirs={expandedDirs}
        toggleDir={toggleDir}
        onSelectFile={onSelectFile}
        selectedPath={selectedPath}
      />
    );
  }

  return (
    <FileNode
      entry={entry}
      level={level}
      onSelectFile={onSelectFile}
      selectedPath={selectedPath}
    />
  );
}

export function FileTree({ repoId, branch, onSelectFile, selectedPath, onBranchChange }: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const { data: rootResult, isLoading, isError } = useQuery({
    queryKey: ["repo-tree", repoId, "", branch],
    queryFn: () => api.repos.tree(repoId, undefined, branch || undefined),
  });

  const rootEntries = rootResult?.data;
  const detectedBranch = rootResult?.branch ?? null;

  useEffect(() => {
    onBranchChange?.(detectedBranch);
  }, [detectedBranch, onBranchChange]);

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <ScrollArea className="h-full">
        <div className="p-3 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-30" />
          <Skeleton className="h-4 w-20" />
        </div>
      </ScrollArea>
    );
  }

  if (isError || !rootEntries) {
    return (
      <ScrollArea className="h-full">
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Repository files not available. Trigger a scan to clone it.
          </p>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {rootEntries.map((entry: any) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            repoId={repoId}
            branch={branch}
            level={0}
            expandedDirs={expandedDirs}
            toggleDir={toggleDir}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
