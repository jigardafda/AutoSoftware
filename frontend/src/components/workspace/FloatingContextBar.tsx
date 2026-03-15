import { useState, useRef, useCallback } from "react";
import {
  ExternalLink,
  Copy,
  Monitor,
  GitCompareArrows,
  GripHorizontal,
  Loader2,
  Check,
  Play,
  Square,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";

interface ContextBarItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
}

function ContextBarItem({ icon: Icon, label, onClick, active, loading, disabled }: ContextBarItemProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            disabled={disabled || loading}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              "hover:bg-muted/80 hover:text-foreground",
              active && "text-primary bg-primary/10",
              !active && "text-muted-foreground",
              (disabled || loading) && "opacity-40 cursor-not-allowed"
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface FloatingContextBarProps {
  workspacePath?: string;
  className?: string;
  isDevServerRunning?: boolean;
  isDevServerStarting?: boolean;
  isDevServerStopping?: boolean;
  onStartDevServer?: () => void;
  onStopDevServer?: () => void;
}

export function FloatingContextBar({
  workspacePath,
  className,
  isDevServerRunning,
  isDevServerStarting,
  isDevServerStopping,
  onStartDevServer,
  onStopDevServer,
}: FloatingContextBarProps) {
  const { showChangesPanel, showPreviewPanel, toggleChangesPanel, togglePreviewPanel } = useWorkspaceStore();
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const handleCopyPath = useCallback(() => {
    if (!workspacePath) return;
    navigator.clipboard.writeText(workspacePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [workspacePath]);

  const handleOpenInIDE = useCallback(() => {
    if (!workspacePath) return;
    window.open(`vscode://file/${workspacePath}`, "_blank");
  }, [workspacePath]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPosition({
        x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [position]);

  return (
    <div
      ref={barRef}
      className={cn(
        "absolute top-1/2 right-4 z-30",
        "flex flex-col items-center gap-0.5 rounded-xl border border-border/50",
        "bg-card/80 backdrop-blur-md shadow-lg px-1 py-1",
        isDragging ? "cursor-grabbing" : "transition-transform duration-200",
        className
      )}
      style={{
        transform: `translate(${position.x}px, calc(-50% + ${position.y}px))`,
      }}
    >
      {/* Drag handle */}
      <div
        className="flex h-5 w-8 items-center justify-center cursor-grab text-muted-foreground/40 hover:text-muted-foreground/60"
        onMouseDown={handleMouseDown}
      >
        <GripHorizontal className="h-3.5 w-3.5" />
      </div>

      {/* Primary actions */}
      <ContextBarItem
        icon={ExternalLink}
        label="Open in IDE"
        onClick={handleOpenInIDE}
        disabled={!workspacePath}
      />
      <ContextBarItem
        icon={copied ? Check : Copy}
        label={copied ? "Copied!" : "Copy workspace path"}
        onClick={handleCopyPath}
        disabled={!workspacePath}
      />

      {/* Divider */}
      <div className="w-4 h-px bg-border/50 my-0.5" />

      {/* Secondary actions */}
      <ContextBarItem
        icon={GitCompareArrows}
        label="Toggle changes"
        onClick={toggleChangesPanel}
        active={showChangesPanel}
      />
      <ContextBarItem
        icon={Monitor}
        label="Toggle preview"
        onClick={togglePreviewPanel}
        active={showPreviewPanel}
      />

      {/* Dev Server */}
      {(onStartDevServer || onStopDevServer) && (
        <>
          <div className="w-4 h-px bg-border/50 my-0.5" />
          {isDevServerRunning ? (
            <ContextBarItem
              icon={Square}
              label="Stop dev server"
              onClick={() => onStopDevServer?.()}
              loading={isDevServerStopping}
              active
            />
          ) : (
            <ContextBarItem
              icon={Play}
              label="Start dev server"
              onClick={() => onStartDevServer?.()}
              loading={isDevServerStarting}
            />
          )}
        </>
      )}
    </div>
  );
}
