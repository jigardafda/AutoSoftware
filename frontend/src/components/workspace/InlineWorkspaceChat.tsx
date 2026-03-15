import { cn } from "@/lib/utils";
import { WorkspaceChatPanel } from "./WorkspaceChatPanel";

interface InlineWorkspaceChatProps {
  workspaceId: string;
  task?: any;
  className?: string;
}

export function InlineWorkspaceChat({
  workspaceId,
  task,
  className,
}: InlineWorkspaceChatProps) {
  return (
    <WorkspaceChatPanel
      workspaceId={workspaceId}
      showContextBanner={false}
      showOpenWorkspaceButton={true}
      showSessionSelector={true}
      showFullInputBar={true}
      compact={true}
      className={cn("h-full", className)}
    />
  );
}
