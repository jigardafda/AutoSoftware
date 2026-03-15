import {
  MessageSquareText,
  Terminal,
  Monitor,
  PanelRight,
  Command,
  Settings,
  GitCompareArrows,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";

interface ToolbarButtonProps {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon: Icon, label, shortcut, active, onClick }: ToolbarButtonProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 rounded-md",
              active && "bg-primary/10 text-primary"
            )}
            onClick={onClick}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-2">
          <span>{label}</span>
          {shortcut && (
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border/50 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ToolbarDivider() {
  return <div className="h-4 w-px bg-border/50 mx-0.5" />;
}

interface WorkspaceToolbarProps {
  onOpenSettings?: () => void;
  onOpenCommandPalette?: () => void;
}

export function WorkspaceToolbar({ onOpenSettings, onOpenCommandPalette }: WorkspaceToolbarProps) {
  const {
    showChatPanel,
    showRightSidebar,
    rightMainPanelMode,
    toggleChatPanel,
    toggleRightSidebar,
    setRightMainPanelMode,
  } = useWorkspaceStore();

  return (
    <div className="flex items-center gap-0.5">
      {/* Panel toggles */}
      <ToolbarButton
        icon={MessageSquareText}
        label="Chat"
        active={showChatPanel}
        onClick={toggleChatPanel}
      />
      <ToolbarButton
        icon={Terminal}
        label="Terminal"
        active={rightMainPanelMode === "terminal"}
        onClick={() => setRightMainPanelMode(rightMainPanelMode === "terminal" ? null : "terminal")}
      />
      <ToolbarButton
        icon={GitCompareArrows}
        label="Changes"
        active={rightMainPanelMode === "changes"}
        onClick={() => setRightMainPanelMode(rightMainPanelMode === "changes" ? null : "changes")}
      />
      <ToolbarButton
        icon={Monitor}
        label="Preview"
        active={rightMainPanelMode === "preview"}
        onClick={() => setRightMainPanelMode(rightMainPanelMode === "preview" ? null : "preview")}
      />
      <ToolbarButton
        icon={PanelRight}
        label="Sidebar"
        active={showRightSidebar}
        onClick={toggleRightSidebar}
      />

      <ToolbarDivider />

      {/* Global actions */}
      <ToolbarButton
        icon={Command}
        label="Command palette"
        shortcut="⌘K"
        onClick={() => onOpenCommandPalette?.()}
      />
      <ToolbarButton
        icon={Settings}
        label="Settings"
        onClick={() => onOpenSettings?.()}
      />
    </div>
  );
}
