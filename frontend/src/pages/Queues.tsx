import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Layers,
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCw,
  XCircle,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { RefreshButton } from "@/components/RefreshButton";

type JobState = "created" | "retry" | "active" | "completed" | "cancelled" | "failed";

const stateConfig: Record<JobState, { label: string; color: string; icon: typeof Clock }> = {
  created: { label: "Queued", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", icon: Clock },
  retry: { label: "Retry", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: RotateCw },
  active: { label: "Active", color: "bg-green-500/10 text-green-600 dark:text-green-400", icon: Loader2 },
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400", icon: XCircle },
  failed: { label: "Failed", color: "bg-red-500/10 text-red-600 dark:text-red-400", icon: AlertCircle },
};

function StateBadge({ state }: { state: JobState }) {
  const cfg = stateConfig[state] || stateConfig.created;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cfg.color)}>
      <Icon className={cn("h-3 w-3", state === "active" && "animate-spin")} />
      {cfg.label}
    </span>
  );
}

function CountBadge({ label, count, variant }: { label: string; count: number; variant: string }) {
  if (count === 0) return null;
  return (
    <div className={cn("flex flex-col items-center rounded-md px-3 py-1.5 min-w-[60px]", variant)}>
      <span className="text-lg font-bold">{count}</span>
      <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
    </div>
  );
}

function timeAgo(date: string | null): string {
  if (!date) return "-";
  const diff = Date.now() - new Date(date).getTime();
  const absDiff = Math.abs(diff);
  const seconds = Math.floor(absDiff / 1000);

  // Format the relative time
  let relative: string;
  if (seconds < 60) relative = `${seconds}s`;
  else if (seconds < 3600) relative = `${Math.floor(seconds / 60)}m`;
  else if (seconds < 86400) relative = `${Math.floor(seconds / 3600)}h`;
  else relative = `${Math.floor(seconds / 86400)}d`;

  // Show "ago" for past, "ahead" for future (indicates timezone issue)
  return diff < 0 ? `in ${relative}` : `${relative} ago`;
}

export function Queues() {
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("");
  const [page, setPage] = useState(0);

  const { data: queues = [], isLoading: queuesLoading } = useQuery({
    queryKey: ["queues"],
    queryFn: api.queues.list,
    refetchInterval: 5000,
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["queue-jobs", selectedQueue, stateFilter, page],
    queryFn: () =>
      api.queues.jobs(selectedQueue!, {
        state: stateFilter || undefined,
        limit: "30",
        offset: String(page * 30),
      }),
    enabled: !!selectedQueue,
    refetchInterval: 5000,
  });

  const jobs = jobsData?.jobs || [];
  const totalJobs = jobsData?.total || 0;
  const totalPages = Math.ceil(totalJobs / 30);

  if (queuesLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Queues</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (queues.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Queues</h2>
        <EmptyState
          icon={Layers}
          title="No queues found"
          description="Worker queues will appear here once the system starts processing jobs"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Queues</h2>
          <RefreshButton queryKeys={["queues", ["queue-jobs", selectedQueue, stateFilter, page]]} />
        </div>
        <span className="text-sm text-muted-foreground">Auto-refreshes every 5s</span>
      </div>

      {/* Queue cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {queues.map((q: any) => {
          const total = Object.values(q.counts as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
          const isSelected = selectedQueue === q.name;
          return (
            <button
              key={q.name}
              onClick={() => {
                setSelectedQueue(isSelected ? null : q.name);
                setStateFilter("");
                setPage(0);
              }}
              className={cn(
                "flex flex-col gap-3 rounded-lg border p-4 text-left transition-all hover:shadow-md",
                isSelected
                  ? "border-primary ring-1 ring-primary bg-accent/30"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{q.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs">
                    {total} total
                  </Badge>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isSelected && "rotate-90"
                    )}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <CountBadge label="Queued" count={q.counts.created} variant="bg-blue-500/10 text-blue-700 dark:text-blue-300" />
                <CountBadge label="Active" count={q.counts.active} variant="bg-green-500/10 text-green-700 dark:text-green-300" />
                <CountBadge label="Retry" count={q.counts.retry} variant="bg-amber-500/10 text-amber-700 dark:text-amber-300" />
                <CountBadge label="Done" count={q.counts.completed} variant="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" />
                <CountBadge label="Failed" count={q.counts.failed} variant="bg-red-500/10 text-red-700 dark:text-red-300" />
                <CountBadge label="Cancel" count={q.counts.cancelled} variant="bg-gray-500/10 text-gray-700 dark:text-gray-300" />
              </div>

              <div className="text-xs text-muted-foreground">
                Policy: {q.policy} | Retry limit: {q.retryLimit} | Expire: {q.expireSeconds}s
              </div>
            </button>
          );
        })}
      </div>

      {/* Jobs detail panel */}
      {selectedQueue && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-semibold">
              Jobs in <code className="text-sm bg-muted px-1.5 py-0.5 rounded">{selectedQueue}</code>
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {["", "created", "active", "retry", "completed", "failed", "cancelled"].map((s) => (
                <Button
                  key={s}
                  variant={stateFilter === s ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setStateFilter(s);
                    setPage(0);
                  }}
                >
                  {s === "" ? "All" : stateConfig[s as JobState]?.label || s}
                </Button>
              ))}
            </div>
          </div>

          {jobsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-md" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No jobs found{stateFilter ? ` with state "${stateConfig[stateFilter as JobState]?.label || stateFilter}"` : ""}
            </div>
          ) : (
            <>
              <div className="rounded-lg border divide-y">
                {jobs.map((job: any) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Showing {page * 30 + 1}-{Math.min((page + 1) * 30, totalJobs)} of {totalJobs}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function JobRow({ job }: { job: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90"
          )}
        />
        <StateBadge state={job.state} />
        <code className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
          {job.id.slice(0, 8)}
        </code>
        {job.singletonKey && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            key: {job.singletonKey}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
          {timeAgo(job.createdOn)}
        </span>
        {job.retryCount > 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            retry {job.retryCount}/{job.retryLimit}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Created:</span>
              <br />
              {job.createdOn ? new Date(job.createdOn).toLocaleString() : "-"}
            </div>
            <div>
              <span className="text-muted-foreground">Started:</span>
              <br />
              {job.startedOn ? new Date(job.startedOn).toLocaleString() : "-"}
            </div>
            <div>
              <span className="text-muted-foreground">Completed:</span>
              <br />
              {job.completedOn ? new Date(job.completedOn).toLocaleString() : "-"}
            </div>
            <div>
              <span className="text-muted-foreground">Expire:</span>
              <br />
              {job.expireSeconds}s
            </div>
          </div>

          {job.data && Object.keys(job.data).length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Input Data:</span>
              <pre className="mt-1 rounded-md bg-muted p-2 text-xs overflow-x-auto max-h-32">
                {JSON.stringify(job.data, null, 2)}
              </pre>
            </div>
          )}

          {job.output && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                {job.state === "failed" ? "Error:" : "Output:"}
              </span>
              <pre
                className={cn(
                  "mt-1 rounded-md p-2 text-xs overflow-x-auto max-h-48",
                  job.state === "failed"
                    ? "bg-red-500/5 text-red-700 dark:text-red-300"
                    : "bg-muted"
                )}
              >
                {typeof job.output === "string"
                  ? job.output
                  : JSON.stringify(job.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
