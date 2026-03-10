import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Github, Play, Pause, Trash2, MoreHorizontal, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHeader } from "@/components/SortableHeader";
import type { SortState } from "@/hooks/useSort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    return <Github className="h-3.5 w-3.5 shrink-0" />;
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

interface RepoTableProps {
  repos: any[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onScan: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  onRowClick: (repo: any) => void;
  sort: SortState;
  onSort: (key: string) => void;
}

export function RepoTable({
  repos,
  selectedIds,
  onSelect,
  onSelectAll,
  onScan,
  onToggle,
  onDelete,
  onRowClick,
  sort,
  onSort,
}: RepoTableProps) {
  const navigate = useNavigate();
  const allSelected = repos.length > 0 && selectedIds.size === repos.length;
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <>
    <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete repository</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this repository and all its data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { if (deleteId) onDelete(deleteId); setDeleteId(null); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="overflow-x-auto rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[32px]">
            <Checkbox
              checked={allSelected}
              onCheckedChange={onSelectAll}
              aria-label="Select all"
            />
          </TableHead>
          <SortableHeader label="Name" sortKey="fullName" sort={sort} onSort={onSort} />
          <SortableHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
          <SortableHeader label="Last Scan" sortKey="lastScannedAt" sort={sort} onSort={onSort} />
          <SortableHeader label="Tasks" sortKey="taskCount" sort={sort} onSort={onSort} />
          <SortableHeader label="Interval" sortKey="scanInterval" sort={sort} onSort={onSort} />
          <TableHead className="w-[48px]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {repos.map((repo) => (
          <TableRow
            key={repo.id}
            data-state={selectedIds.has(repo.id) ? "selected" : undefined}
            className="cursor-pointer"
            onClick={() => onRowClick(repo)}
          >
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedIds.has(repo.id)}
                onCheckedChange={() => onSelect(repo.id)}
                aria-label={`Select ${repo.fullName}`}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <ProviderIcon provider={repo.provider} />
                <span className="font-medium truncate max-w-[280px]">
                  {repo.fullName}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={repo.status} />
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground text-xs">
                {relativeTime(repo.lastScannedAt)}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-xs">{repo.taskCount ?? 0}</span>
            </TableCell>
            <TableCell>
              <span className="text-xs text-muted-foreground">
                {repo.scanInterval}min
              </span>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className={cn("h-7 w-7")}>
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/repos/${repo.id}?tab=scans`)}>
                    <Search className="h-4 w-4" />
                    View Scans
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onScan(repo.id)}>
                    <Play className="h-4 w-4" />
                    Scan Now
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onToggle(repo.id, !repo.isActive)}
                  >
                    {repo.isActive ? (
                      <>
                        <Pause className="h-4 w-4" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Resume
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteId(repo.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
    </>
  );
}
