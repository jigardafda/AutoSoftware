import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  pending: {
    label: "Processing",
    className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  },
  screening: {
    label: "Processing",
    className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  },
  needs_input: {
    label: "Awaiting Input",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  scored: {
    label: "Pending Review",
    className: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
  approved: {
    label: "Approved",
    className: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-500/10 text-red-500 border-red-500/20",
  },
};

type FilterTab = "all" | "scored" | "approved" | "rejected";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scored", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

interface EmbedSubmissionsTableProps {
  projectId: string;
  repositories: { id: string; fullName: string }[];
}

export function EmbedSubmissionsTable({
  projectId,
  repositories,
}: EmbedSubmissionsTableProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");

  const statusParam = filter === "all" ? undefined : filter;

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["submissions", projectId, statusParam],
    queryFn: () => api.projects.listSubmissions(projectId, statusParam),
    enabled: !!projectId,
  });

  const approveMutation = useMutation({
    mutationFn: ({
      subId,
      repositoryId,
    }: {
      subId: string;
      repositoryId: string;
    }) => api.projects.approveSubmission(projectId, subId, repositoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["submissions", projectId],
      });
      setApproveDialogOpen(false);
      setSelectedSubmission(null);
      setSelectedRepoId("");
      toast.success("Submission approved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (subId: string) =>
      api.projects.rejectSubmission(projectId, subId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["submissions", projectId],
      });
      toast.success("Submission rejected");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleApproveClick = (submission: any) => {
    if (repositories.length === 1) {
      // Auto-select the only repo
      approveMutation.mutate({
        subId: submission.id,
        repositoryId: repositories[0].id,
      });
    } else {
      setSelectedSubmission(submission);
      setSelectedRepoId(repositories[0]?.id ?? "");
      setApproveDialogOpen(true);
    }
  };

  const handleApproveConfirm = () => {
    if (!selectedSubmission || !selectedRepoId) return;
    approveMutation.mutate({
      subId: selectedSubmission.id,
      repositoryId: selectedRepoId,
    });
  };

  const submissionList = Array.isArray(submissions) ? submissions : [];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Submissions</CardTitle>
            <div className="flex items-center gap-1">
              {FILTER_TABS.map((tab) => (
                <Button
                  key={tab.value}
                  variant={filter === tab.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setFilter(tab.value)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : submissionList.length === 0 ? (
            <div className="py-8 text-center">
              <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {filter === "all"
                  ? "No submissions yet"
                  : `No ${FILTER_TABS.find((t) => t.value === filter)?.label?.toLowerCase()} submissions`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-20">Score</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-24">Input Method</TableHead>
                    <TableHead className="w-24">Date</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissionList.map((sub: any) => {
                    const statusCfg = STATUS_CONFIG[sub.status] ?? {
                      label: sub.status,
                      className: "bg-muted text-muted-foreground",
                    };
                    return (
                      <TableRow key={sub.id}>
                        <TableCell>
                          <p className="text-sm font-medium truncate max-w-[250px]">
                            {sub.title || sub.name || "Untitled"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">
                            {sub.score != null
                              ? Number(sub.score).toFixed(1)
                              : "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0",
                              statusCfg.className
                            )}
                          >
                            {statusCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground capitalize">
                            {sub.inputMethod ?? "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {relativeTime(sub.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {sub.status === "scored" && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-green-500 hover:text-green-400 hover:bg-green-500/10"
                                onClick={() => handleApproveClick(sub)}
                                disabled={
                                  approveMutation.isPending ||
                                  repositories.length === 0
                                }
                              >
                                {approveMutation.isPending &&
                                selectedSubmission?.id === sub.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => rejectMutation.mutate(sub.id)}
                                disabled={rejectMutation.isPending}
                              >
                                {rejectMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <XCircle className="h-3 w-3" />
                                )}
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog — select target repository */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Submission</DialogTitle>
            <DialogDescription>
              Select the target repository for this submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Target Repository
              </label>
              <Select value={selectedRepoId} onValueChange={setSelectedRepoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a repository" />
                </SelectTrigger>
                <SelectContent>
                  {repositories.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id}>
                      {repo.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setApproveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveConfirm}
              disabled={!selectedRepoId || approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
