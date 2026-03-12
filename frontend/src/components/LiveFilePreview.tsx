import { useState, useEffect, useCallback, useMemo } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileCode2,
  FilePlus2,
  FileX2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FileChange {
  timestamp: number;
  operation: "create" | "modify" | "delete";
  filePath: string;
  oldContent?: string;
  newContent?: string;
  diff?: string;
  language?: string;
}

interface LiveFilePreviewProps {
  changes?: FileChange[];
  className?: string;
  onClose?: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

export function LiveFilePreview({
  changes = [],
  className,
  onClose,
  isFullScreen = false,
  onToggleFullScreen,
}: LiveFilePreviewProps) {
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showDiff, setShowDiff] = useState(true);

  // Group changes by file path
  const groupedChanges = useMemo(() => {
    const groups = new Map<string, FileChange[]>();
    changes.forEach((change) => {
      const existing = groups.get(change.filePath) || [];
      existing.push(change);
      groups.set(change.filePath, existing);
    });
    return groups;
  }, [changes]);

  // Auto-select most recent change
  useEffect(() => {
    if (changes.length > 0 && !selectedChange) {
      const latest = changes[changes.length - 1];
      setSelectedChange(latest);
      setExpandedFiles((prev) => new Set([...prev, latest.filePath]));
    }
  }, [changes, selectedChange]);

  // Toggle file expansion
  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  // Get operation icon
  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case "create":
        return <FilePlus2 className="h-4 w-4 text-green-500" />;
      case "delete":
        return <FileX2 className="h-4 w-4 text-red-500" />;
      default:
        return <FileCode2 className="h-4 w-4 text-blue-500" />;
    }
  };

  // Get operation badge
  const getOperationBadge = (operation: string) => {
    switch (operation) {
      case "create":
        return (
          <Badge variant="outline" className="text-green-500 border-green-500/30">
            Created
          </Badge>
        );
      case "delete":
        return (
          <Badge variant="outline" className="text-red-500 border-red-500/30">
            Deleted
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-blue-500 border-blue-500/30">
            Modified
          </Badge>
        );
    }
  };

  // Get relative time
  const getRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  // Detect language from file path
  const detectLanguage = (filePath: string): string => {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      rb: "ruby",
      go: "go",
      rs: "rust",
      java: "java",
      kt: "kotlin",
      swift: "swift",
      cpp: "cpp",
      c: "c",
      h: "c",
      hpp: "cpp",
      cs: "csharp",
      php: "php",
      html: "html",
      css: "css",
      scss: "scss",
      sass: "sass",
      less: "less",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml",
      sql: "sql",
      sh: "shell",
      bash: "shell",
      zsh: "shell",
      md: "markdown",
      mdx: "markdown",
    };
    return languageMap[ext || ""] || "plaintext";
  };

  return (
    <div className={cn("flex flex-col h-full bg-background overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Live File Changes
          </span>
          <Badge variant="secondary">{changes.length} changes</Badge>
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowDiff(!showDiff)}
                >
                  {showDiff ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showDiff ? "Show single view" : "Show diff view"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onToggleFullScreen && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onToggleFullScreen}
                  >
                    {isFullScreen ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isFullScreen ? "Exit full screen" : "Full screen"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* File list sidebar */}
        <ScrollArea className="w-64 min-w-64 max-w-64 border-r flex-shrink-0">
          <div className="p-2">
            {groupedChanges.size === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <FileCode2 className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No file changes yet</p>
                <p className="text-xs">Changes will appear here as the agent works</p>
              </div>
            ) : (
              Array.from(groupedChanges.entries()).map(([filePath, fileChanges]) => {
                const isExpanded = expandedFiles.has(filePath);
                const latestChange = fileChanges[fileChanges.length - 1];
                const fileName = filePath.split("/").pop() || filePath;

                return (
                  <div key={filePath} className="mb-1">
                    <button
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-sm hover:bg-accent transition-colors",
                        selectedChange?.filePath === filePath && "bg-accent"
                      )}
                      onClick={() => {
                        toggleFile(filePath);
                        setSelectedChange(latestChange);
                      }}
                    >
                      {fileChanges.length > 1 ? (
                        isExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )
                      ) : (
                        <span className="w-4" />
                      )}
                      {getOperationIcon(latestChange.operation)}
                      <span className="truncate flex-1">{fileName}</span>
                      {fileChanges.length > 1 && (
                        <Badge variant="secondary" className="text-xs">
                          {fileChanges.length}
                        </Badge>
                      )}
                    </button>

                    {isExpanded && fileChanges.length > 1 && (
                      <div className="ml-6 mt-1 space-y-1">
                        {fileChanges.map((change, index) => (
                          <button
                            key={`${change.timestamp}-${index}`}
                            className={cn(
                              "flex items-center gap-2 w-full px-2 py-1 rounded text-xs hover:bg-accent/50 transition-colors",
                              selectedChange === change && "bg-accent/50"
                            )}
                            onClick={() => setSelectedChange(change)}
                          >
                            {getOperationIcon(change.operation)}
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {getRelativeTime(change.timestamp)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Editor panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedChange ? (
            <>
              {/* File header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                <code className="text-sm font-mono flex-1 truncate">
                  {selectedChange.filePath}
                </code>
                {getOperationBadge(selectedChange.operation)}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {getRelativeTime(selectedChange.timestamp)}
                </span>
              </div>

              {/* Editor */}
              <div className="flex-1 min-h-0 overflow-hidden relative">
                <div className="absolute inset-0">
                {selectedChange.operation === "delete" ? (
                  <Editor
                    language={selectedChange.language || detectLanguage(selectedChange.filePath)}
                    value={selectedChange.oldContent || "// File was deleted"}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      renderValidationDecorations: "off",
                    }}
                  />
                ) : showDiff && selectedChange.oldContent && selectedChange.newContent ? (
                  <DiffEditor
                    original={selectedChange.oldContent}
                    modified={selectedChange.newContent}
                    language={selectedChange.language || detectLanguage(selectedChange.filePath)}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      renderSideBySide: true,
                      renderIndicators: true,
                      originalEditable: false,
                    }}
                  />
                ) : (
                  <Editor
                    language={selectedChange.language || detectLanguage(selectedChange.filePath)}
                    value={selectedChange.newContent || selectedChange.oldContent || "// No content available"}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      renderValidationDecorations: "off",
                    }}
                  />
                )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <FileCode2 className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm">Select a file to view changes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
