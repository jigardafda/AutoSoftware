import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Pagination, paginate } from "@/components/Pagination";
import {
  CheckCircle2,
  XCircle,
  Search,
  Github,
  GitlabIcon,
  ChevronDown,
  ChevronUp,
  Loader2,
  Filter,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";

function timeAgo(date: string) {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "github":
      return <Github className="h-4 w-4 text-muted-foreground" />;
    case "gitlab":
      return <GitlabIcon className="h-4 w-4 text-orange-400" />;
    case "bitbucket":
      return (
        <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.65 3C2.3 3 2 3.3 2 3.65v.12l2.73 16.5c.07.42.43.73.85.73h13.05c.31 0 .58-.24.63-.55L22 3.77v-.12c0-.35-.3-.65-.65-.65H2.65zM14.1 14.95H9.94L8.81 9.07h6.3l-1.01 5.88z" />
        </svg>
      );
    default:
      return null;
  }
}

function ActiveScans() {
  const { data: repos = [] } = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos.list,
    refetchInterval: 3000,
  });

  const scanning = repos.filter((r: any) => r.status === "scanning");
  if (scanning.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Active Scans
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {scanning.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {scanning.map((repo: any) => (
            <div
              key={repo.id}
              className="flex items-center gap-3 rounded-md border bg-background/50 px-3 py-2"
            >
              <ProviderIcon provider={repo.provider} />
              <span className="text-sm font-medium truncate">{repo.fullName}</span>
              <div className="ml-auto flex items-center gap-2">
                <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                  <div className="h-full w-full rounded-full bg-primary animate-pulse" />
                </div>
                <span className="text-xs text-muted-foreground">Scanning...</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function Scans() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tasksFilter, setTasksFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { data: scans = [], isLoading } = useQuery({
    queryKey: ["scans"],
    queryFn: api.scans.list,
  });

  // Derive unique repos for filter dropdown
  const repoOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const scan of scans) {
      const name = (scan as any).repository?.fullName;
      const id = (scan as any).repositoryId;
      if (name && id && !seen.has(id)) seen.set(id, name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [scans]);

  const filtered = useMemo(() => {
    return scans.filter((scan: any) => {
      if (repoFilter !== "all" && scan.repositoryId !== repoFilter) return false;
      if (statusFilter !== "all" && scan.status !== statusFilter) return false;
      if (tasksFilter === "with" && (scan.tasksCreated ?? 0) === 0) return false;
      if (tasksFilter === "without" && (scan.tasksCreated ?? 0) > 0) return false;
      return true;
    });
  }, [scans, repoFilter, statusFilter, tasksFilter]);

  const hasActiveFilters = repoFilter !== "all" || statusFilter !== "all" || tasksFilter !== "all";
  const paged = useMemo(() => paginate(filtered, page), [filtered, page]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [repoFilter, statusFilter, tasksFilter]);

  const clearFilters = () => {
    setRepoFilter("all");
    setStatusFilter("all");
    setTasksFilter("all");
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Scan History</h2>
        <ActiveScans />
        <div className="rounded-md border">
          <div className="border-b px-4 py-3">
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-32 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Scan History</h2>
        <ActiveScans />
        <EmptyState
          icon={Search}
          title="No scans yet"
          description="Connect a repository and trigger your first scan"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Scan History</h2>
        <Badge variant="secondary" className="text-xs">
          {scans.length}
        </Badge>
      </div>

      <ActiveScans />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />

        <Select value={repoFilter} onValueChange={setRepoFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All repos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All repositories</SelectItem>
            {repoOptions.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tasksFilter} onValueChange={setTasksFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Tasks created" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any tasks</SelectItem>
            <SelectItem value="with">With tasks</SelectItem>
            <SelectItem value="without">No tasks created</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}

        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} of {scans.length} scans
          </span>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-md border p-8 text-center">
          <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No scans match the current filters</p>
          <Button variant="link" size="sm" className="mt-1" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead>Scanned At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tasks Created</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((scan: any) => (
                <>
                  <TableRow
                    key={scan.id}
                    className="cursor-pointer"
                    onClick={() => toggleExpand(scan.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <ProviderIcon provider={scan.repository?.provider} />
                        <span className="font-medium text-sm truncate">
                          {scan.repository?.fullName || "Unknown"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(scan.scannedAt)}
                    </TableCell>
                    <TableCell>
                      {scan.status === "completed" ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-500/10 text-green-500 border-green-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-red-500/10 text-red-500 border-red-500/20"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {scan.tasksCreated ?? 0}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {scan.summary
                        ? scan.summary.length > 100
                          ? `${scan.summary.slice(0, 100)}...`
                          : scan.summary
                        : "--"}
                    </TableCell>
                    <TableCell>
                      {expandedId === scan.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedId === scan.id && (
                    <TableRow key={`${scan.id}-detail`}>
                      <TableCell colSpan={6} className="p-0">
                        <Card className="m-2 border-dashed">
                          <CardContent className="p-4">
                            <p className="text-sm font-medium mb-1">Full Summary</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {scan.summary || "No summary available."}
                            </p>
                            {scan.errorMessage && (
                              <>
                                <p className="text-sm font-medium mt-3 mb-1 text-red-400">
                                  Error
                                </p>
                                <p className="text-sm text-red-400/80">
                                  {scan.errorMessage}
                                </p>
                              </>
                            )}
                          </CardContent>
                        </Card>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={page} total={filtered.length} onPageChange={setPage} />
    </div>
  );
}
