import { Github, Play, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

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

function ProviderBadge({ provider }: { provider: string }) {
  if (provider === "github") {
    return (
      <Badge variant="outline" className="gap-1">
        <Github className="h-3 w-3" />
        GitHub
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="capitalize">
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

interface RepoDetailDrawerProps {
  repo: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (id: string) => void;
  onDelete: (id: string) => void;
}

export function RepoDetailDrawer({
  repo,
  open,
  onOpenChange,
  onScan,
  onDelete,
}: RepoDetailDrawerProps) {
  if (!repo) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left">
            <span className="truncate">{repo.fullName}</span>
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center gap-2">
              <ProviderBadge provider={repo.provider} />
              <StatusBadge status={repo.status} />
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 mt-4">
          {/* Scan Now button */}
          <Button
            className="w-full"
            onClick={() => onScan(repo.id)}
          >
            <Play className="h-4 w-4" />
            Scan Now
          </Button>

          <Separator />

          {/* Info section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Repository Info</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Last Scanned</p>
                <p>{relativeTime(repo.lastScannedAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Scan Interval</p>
                <p>{repo.scanInterval} minutes</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Status</p>
                <p>{repo.isActive ? "Active" : "Paused"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Default Branch</p>
                <p>{repo.defaultBranch || "main"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Recent Tasks section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Recent Tasks</h4>
            <p className="text-xs text-muted-foreground">
              {repo.taskCount != null
                ? `${repo.taskCount} task${repo.taskCount === 1 ? "" : "s"} total`
                : "No tasks found for this repository."}
            </p>
          </div>
        </div>

        {/* Delete button at bottom */}
        <div className="pt-4 mt-auto border-t">
          <ConfirmDeleteDialog
            title="Delete repository"
            description="This will permanently delete this repository and all its data. This action cannot be undone."
            onConfirm={() => { onDelete(repo.id); onOpenChange(false); }}
            trigger={
              <Button variant="destructive" className="w-full">
                <Trash2 className="h-4 w-4" />
                Delete Repository
              </Button>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
