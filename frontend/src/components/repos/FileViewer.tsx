import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CodeBlock } from "@/components/repos/CodeBlock";
import { getLanguageFromFilename, formatFileSize, isImageFile, isPdfFile } from "@/lib/file-utils";
import { FileCode, Copy, AlertTriangle, Image } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface FileViewerProps {
  repoId: string;
  filePath: string | null;
  highlightLine?: number;
}

export function FileViewer({ repoId, filePath, highlightLine }: FileViewerProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["repo-file", repoId, filePath],
    queryFn: () => api.repos.file(repoId, filePath!),
    enabled: !!filePath,
  });

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <FileCode className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Select a file to view its contents
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <AlertTriangle className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Failed to load file contents
        </p>
      </div>
    );
  }

  const handleCopyPath = () => {
    navigator.clipboard.writeText(filePath);
    toast.success("File path copied to clipboard");
  };

  const language = data.language || getLanguageFromFilename(filePath);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-mono text-muted-foreground truncate">
              {filePath}
            </p>
            {data.size != null && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {formatFileSize(data.size)}
              </Badge>
            )}
          </div>
          <button
            onClick={handleCopyPath}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Copy file path"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        {data.truncated ? (
          <div className="flex items-center gap-2 p-4 rounded-md border bg-muted/50">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">File too large to display</p>
              {data.size != null && (
                <p className="text-xs text-muted-foreground">
                  Size: {formatFileSize(data.size)}
                </p>
              )}
            </div>
          </div>
        ) : data.binary && isImageFile(filePath) ? (
          <div className="flex items-center justify-center rounded-md border bg-muted/20 p-4">
            <img
              src={api.repos.rawUrl(repoId, filePath)}
              alt={filePath.split("/").pop() || "image"}
              className="max-w-full max-h-[60vh] object-contain rounded"
            />
          </div>
        ) : data.binary && isPdfFile(filePath) ? (
          <div className="rounded-md border overflow-hidden" style={{ height: "calc(100% - 3rem)" }}>
            <iframe
              src={api.repos.rawUrl(repoId, filePath)}
              title={filePath.split("/").pop() || "pdf"}
              className="w-full h-full min-h-[60vh]"
            />
          </div>
        ) : data.binary ? (
          <div className="flex items-center gap-2 p-4 rounded-md border bg-muted/50">
            <FileCode className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">Binary file</p>
              {data.size != null && (
                <p className="text-xs text-muted-foreground">
                  Size: {formatFileSize(data.size)}
                </p>
              )}
            </div>
          </div>
        ) : language ? (
          <CodeBlock code={data.content} language={language} highlightLine={highlightLine} />
        ) : (
          <CodeBlock code={data.content} highlightLine={highlightLine} />
        )}
      </div>
    </ScrollArea>
  );
}
