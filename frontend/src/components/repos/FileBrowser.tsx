import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BranchSelect } from "@/components/BranchSelect";
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
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  // Fetch available branches
  const { data: branches, isLoading: branchesLoading, refetch: refetchBranches } = useQuery({
    queryKey: ["repo-branches", repoId],
    queryFn: () => api.repos.branches(repoId),
    staleTime: 30_000,
  });

  const handleBranchChange = useCallback((b: string | null) => {
    setCurrentBranch(b);
    // Initialize selected branch on first load
    if (!selectedBranch && b) {
      setSelectedBranch(b);
    }
  }, [selectedBranch]);

  const handleSelectBranch = useCallback((branchName: string | null) => {
    // If null (default selected), use the actual default branch name
    const defaultBranch = branches?.find((b) => b.isDefault)?.name;
    setSelectedBranch(branchName || defaultBranch || null);
    setSelectedFilePath(null); // Reset file selection when changing branches
  }, [branches]);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFilePath(path);
    setHighlightLine(undefined); // clear line highlight when selecting a new file from tree
  }, []);

  return (
    <div className="space-y-2">
      {/* Branch selector */}
      <div className="flex items-center gap-2">
        <BranchSelect
          branches={branches}
          value={selectedBranch}
          onChange={handleSelectBranch}
          disabled={branchesLoading}
          size="sm"
          className="h-7 font-mono"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => refetchBranches()}
          title="Refresh branches"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Split panel */}
      <div className="flex rounded-lg border h-[calc(100vh-20rem)] overflow-hidden">
        {/* Left panel - File Tree */}
        <div className="w-64 shrink-0 border-r overflow-hidden">
          <FileTree
            repoId={repoId}
            branch={selectedBranch}
            onSelectFile={handleSelectFile}
            selectedPath={selectedFilePath}
            onBranchChange={handleBranchChange}
          />
        </div>

        {/* Right panel - File Viewer */}
        <div className="flex-1 overflow-hidden">
          <FileViewer repoId={repoId} filePath={selectedFilePath} highlightLine={highlightLine} branch={selectedBranch} />
        </div>
      </div>
    </div>
  );
}
