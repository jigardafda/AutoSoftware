import { ChevronDown, Plus, Check, Bot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface SessionInfo {
  id: string;
  createdAt: string;
  isLatest?: boolean;
}

interface SessionSelectorProps {
  sessions: SessionInfo[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  onNewSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
  disabled?: boolean;
}

function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function SessionSelector({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  disabled,
}: SessionSelectorProps) {
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const label = !currentSessionId
    ? "New Session"
    : currentSession?.isLatest
      ? "Latest"
      : currentSession
        ? formatSessionDate(currentSession.createdAt)
        : "Session";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
          disabled={disabled}
        >
          <Bot className="h-3 w-3" />
          <span>{label}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={onNewSession}
          className="gap-2"
        >
          {!currentSessionId ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          <span>New Session</span>
        </DropdownMenuItem>

        {sessions.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Sessions
            </DropdownMenuLabel>
            {sessions.map((session, index) => (
              <DropdownMenuItem
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={cn("gap-2", currentSessionId === session.id && "bg-accent")}
              >
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">
                  {index === 0 ? "Latest" : formatSessionDate(session.createdAt)}
                </span>
                {currentSessionId === session.id && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
                {onDeleteSession && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onDeleteSession(session.id);
                    }}
                    className="ml-1 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
