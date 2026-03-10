import { useState, useCallback } from "react";
import { GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FileTree } from "@/components/repos/FileTree";
import { FileViewer } from "@/components/repos/FileViewer";

interface FileBrowserProps {
  repoId: string;
  initialPath?: string;
  initialLine?: number;
}

export function FileBrowser({ repoId, initialPath, initialLine }: FileBrowserProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    initialPath ?? null
  );
  const [highlightLine, setHighlightLine] = useState<number | undefined>(initialLine);
  const [branch, setBranch] = useState<string | null>(null);

  const handleBranchChange = useCallback((b: string | null) => {
    setBranch(b);
  }, []);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFilePath(path);
    setHighlightLine(undefined); // clear line highlight when selecting a new file from tree
  }, []);

  return (
    <div className="space-y-2">
      {/* Branch indicator */}
      {branch && (
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <Badge variant="secondary" className="font-mono text-xs">
            {branch}
          </Badge>
        </div>
      )}

      {/* Split panel */}
      <div className="flex rounded-lg border h-[calc(100vh-20rem)] overflow-hidden">
        {/* Left panel - File Tree */}
        <div className="w-64 shrink-0 border-r overflow-hidden">
          <FileTree
            repoId={repoId}
            onSelectFile={handleSelectFile}
            selectedPath={selectedFilePath}
            onBranchChange={handleBranchChange}
          />
        </div>

        {/* Right panel - File Viewer */}
        <div className="flex-1 overflow-hidden">
          <FileViewer repoId={repoId} filePath={selectedFilePath} highlightLine={highlightLine} />
        </div>
      </div>
    </div>
  );
}
