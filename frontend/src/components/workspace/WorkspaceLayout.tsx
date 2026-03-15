import { useCallback, useRef, useState } from "react";
import { Terminal, Files, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { WorkspaceChat } from "./WorkspaceChat";
import { WorkspaceTerminal } from "./WorkspaceTerminal";
import { WorkspaceFiles } from "./WorkspaceFiles";

interface WorkspaceLayoutProps {
  workspaceId: string;
}

export function WorkspaceLayout({ workspaceId }: WorkspaceLayoutProps) {
  const {
    leftPanelWidth,
    activeRightTab,
    setLeftPanelWidth,
    setActiveRightTab,
  } = useWorkspaceStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const startX = e.clientX;
      const startWidth = leftPanelWidth;

      const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const deltaX = e.clientX - startX;
        const deltaPercent = (deltaX / containerRect.width) * 100;
        const newWidth = startWidth + deltaPercent;
        setLeftPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [leftPanelWidth, setLeftPanelWidth]
  );

  const rightTabs = [
    { id: "terminal" as const, label: "Terminal", icon: Terminal },
    { id: "files" as const, label: "Files", icon: Files },
    { id: "browser" as const, label: "Preview", icon: Globe },
  ];

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full w-full overflow-hidden",
        isDragging && "select-none cursor-col-resize"
      )}
    >
      {/* Left Panel - Chat */}
      <div
        className="h-full shrink-0 overflow-hidden border-r border-border/50"
        style={{ width: `${leftPanelWidth}%` }}
      >
        <WorkspaceChat workspaceId={workspaceId} />
      </div>

      {/* Resizable divider */}
      <div
        className={cn(
          "relative w-1 shrink-0 cursor-col-resize group hover:bg-primary/20 transition-colors",
          isDragging && "bg-primary/30"
        )}
        onMouseDown={handleMouseDown}
      >
        <div
          className={cn(
            "absolute inset-y-0 -left-1 -right-1 z-10",
            isDragging && "-left-2 -right-2"
          )}
        />
      </div>

      {/* Right Panel - Terminal / Files / Browser */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-border/50 bg-muted/30 px-1">
          {rightTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeRightTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveRightTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/80"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          {activeRightTab === "terminal" && (
            <WorkspaceTerminal workspaceId={workspaceId} />
          )}
          {activeRightTab === "files" && (
            <WorkspaceFiles workspaceId={workspaceId} />
          )}
          {activeRightTab === "browser" && (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Browser Preview</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Start a dev server to preview your application
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
