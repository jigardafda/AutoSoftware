import { useState } from "react";
import { FileTree } from "@/components/repos/FileTree";
import { FileViewer } from "@/components/repos/FileViewer";

interface FileBrowserProps {
  repoId: string;
  initialPath?: string;
}

export function FileBrowser({ repoId, initialPath }: FileBrowserProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    initialPath ?? null
  );

  return (
    <div className="flex rounded-lg border h-[calc(100vh-20rem)] overflow-hidden">
      {/* Left panel - File Tree */}
      <div className="w-64 shrink-0 border-r overflow-hidden">
        <FileTree
          repoId={repoId}
          onSelectFile={setSelectedFilePath}
          selectedPath={selectedFilePath}
        />
      </div>

      {/* Right panel - File Viewer */}
      <div className="flex-1 overflow-hidden">
        <FileViewer repoId={repoId} filePath={selectedFilePath} />
      </div>
    </div>
  );
}
