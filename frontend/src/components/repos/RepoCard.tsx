import { Github, Play, Pause } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "github") {
    return <Github className="h-4 w-4 shrink-0" />;
  }
  return (
    <Badge variant="outline" className="h-5 px-1 py-0 text-[10px] font-normal">
      {provider}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "scanning":
      return (
        <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/20 hover:bg-blue-500/15">
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          scanning
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="hover:bg-destructive">
          error
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="hover:bg-secondary">
          idle
        </Badge>
      );
  }
}

interface RepoCardProps {
  repo: any;
  onScan: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onClick: (repo: any) => void;
}

export function RepoCard({ repo, onScan, onToggle, onClick }: RepoCardProps) {
  return (
    <Card
      className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onClick(repo)}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <ProviderIcon provider={repo.provider} />
          <span className="font-medium text-sm truncate">{repo.fullName}</span>
        </div>
        <StatusBadge status={repo.status} />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        <span>Last scan: {relativeTime(repo.lastScannedAt)}</span>
        <span>{repo.taskCount ?? 0} tasks</span>
      </div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onScan(repo.id)}
        >
          <Play className="h-3 w-3" />
          Scan Now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onToggle(repo.id, !repo.isActive)}
        >
          {repo.isActive ? (
            <>
              <Pause className="h-3 w-3" />
              Pause
            </>
          ) : (
            <>
              <Play className="h-3 w-3" />
              Resume
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
