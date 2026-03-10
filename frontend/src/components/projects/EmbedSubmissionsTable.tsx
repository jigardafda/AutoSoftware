import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Inbox,
  Clock,
  FileText,
  Mic,
  Type,
  Paperclip,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

const INPUT_METHOD_ICON: Record<string, React.ReactNode> = {
  text: <Type className="h-3 w-3" />,
  voice: <Mic className="h-3 w-3" />,
  file: <Paperclip className="h-3 w-3" />,
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
  const [detailSubmission, setDetailSubmission] = useState<any>(null);

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
      setDetailSubmission(null);
      toast.success("Submission approved and converted to task");
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
      setDetailSubmission(null);
      toast.success("Submission rejected");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleApproveClick = (submission: any) => {
    if (repositories.length === 1) {
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
                    <TableHead className="w-24">Input</TableHead>
                    <TableHead className="w-24">Date</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissionList.map((sub: any) => {
                    const statusCfg = STATUS_CONFIG[sub.screeningStatus] ?? {
                      label: sub.screeningStatus,
                      className: "bg-muted text-muted-foreground",
                    };
                    return (
                      <TableRow
                        key={sub.id}
                        className="cursor-pointer hover:bg-zinc-800/50"
                        onClick={() => setDetailSubmission(sub)}
                      >
                        <TableCell>
                          <p className="text-sm font-medium truncate max-w-[250px]">
                            {sub.title || "Untitled"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">
                            {sub.screeningScore != null
                              ? Number(sub.screeningScore).toFixed(1)
                              : "–"}
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
                          <span className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                            {INPUT_METHOD_ICON[sub.inputMethod] ?? null}
                            {sub.inputMethod ?? "–"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {relativeTime(sub.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {(sub.screeningStatus === "scored" || sub.screeningStatus === "needs_input") && (
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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

      {/* Submission Detail Sheet */}
      <Sheet open={!!detailSubmission} onOpenChange={(open) => !open && setDetailSubmission(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detailSubmission && (
            <SubmissionDetail
              submission={detailSubmission}
              repositories={repositories}
              onApprove={handleApproveClick}
              onReject={(id) => rejectMutation.mutate(id)}
              approvePending={approveMutation.isPending}
              rejectPending={rejectMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

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

// --- Submission Detail Component ---

function SubmissionDetail({
  submission,
  repositories,
  onApprove,
  onReject,
  approvePending,
  rejectPending,
}: {
  submission: any;
  repositories: { id: string; fullName: string }[];
  onApprove: (sub: any) => void;
  onReject: (id: string) => void;
  approvePending: boolean;
  rejectPending: boolean;
}) {
  const sub = submission;
  const statusCfg = STATUS_CONFIG[sub.screeningStatus] ?? {
    label: sub.screeningStatus,
    className: "bg-muted text-muted-foreground",
  };

  const attachments = Array.isArray(sub.attachments) ? sub.attachments : [];
  const questions = Array.isArray(sub.questions) ? sub.questions : [];
  const canApprove = sub.screeningStatus === "scored" || sub.screeningStatus === "needs_input";

  // Group questions by round
  const questionsByRound = new Map<number, any[]>();
  for (const q of questions) {
    if (!questionsByRound.has(q.round)) questionsByRound.set(q.round, []);
    questionsByRound.get(q.round)!.push(q);
  }

  return (
    <div className="space-y-6 pt-2">
      <SheetHeader>
        <SheetTitle className="text-left text-lg">{sub.title || "Untitled"}</SheetTitle>
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Badge variant="outline" className={cn("text-xs", statusCfg.className)}>
            {statusCfg.label}
          </Badge>
          {sub.screeningScore != null && (
            <Badge variant="outline" className="text-xs font-mono">
              Score: {Number(sub.screeningScore).toFixed(1)}/10
            </Badge>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {INPUT_METHOD_ICON[sub.inputMethod]}
            {sub.inputMethod}
          </span>
        </div>
      </SheetHeader>

      {/* Timestamps */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDate(sub.createdAt)}
        </span>
        {sub.taskId && (
          <span className="flex items-center gap-1 text-green-500">
            <ExternalLink className="h-3 w-3" />
            Linked to task
          </span>
        )}
      </div>

      <Separator />

      {/* Description */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          Description
        </h4>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed bg-zinc-900 rounded-md p-3 border border-zinc-800">
          {sub.description}
        </p>
      </div>

      {/* Screening Reason */}
      {sub.screeningReason && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">AI Screening Notes</h4>
          <p className="text-sm text-muted-foreground bg-zinc-900 rounded-md p-3 border border-zinc-800">
            {sub.screeningReason}
          </p>
        </div>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            Attachments ({attachments.length})
          </h4>
          <div className="space-y-1">
            {attachments.map((att: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm bg-zinc-900 rounded-md px-3 py-2 border border-zinc-800"
              >
                <span className="text-muted-foreground truncate mr-2">{att.filename}</span>
                <span className="text-xs text-muted-foreground/60 shrink-0">
                  {att.mimeType} &middot; {formatFileSize(att.size || 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clarification Questions & Answers */}
      {questionsByRound.size > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            Clarification Q&A
          </h4>
          {Array.from(questionsByRound.entries())
            .sort(([a], [b]) => a - b)
            .map(([round, roundQuestions]) => (
              <div key={round} className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Round {round}</p>
                {roundQuestions
                  .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                  .map((q: any) => (
                    <div
                      key={q.id}
                      className="bg-zinc-900 rounded-md p-3 border border-zinc-800 space-y-1"
                    >
                      <p className="text-sm font-medium">
                        {q.label}
                        {q.required && <span className="text-red-400 ml-1">*</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {q.answer != null ? (
                          typeof q.answer === "boolean"
                            ? q.answer ? "Yes" : "No"
                            : Array.isArray(q.answer)
                              ? q.answer.join(", ")
                              : String(q.answer)
                        ) : (
                          <span className="italic text-muted-foreground/50">No answer yet</span>
                        )}
                      </p>
                    </div>
                  ))}
              </div>
            ))}
        </div>
      )}

      {/* Metadata */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Details</h4>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Submission ID</dt>
          <dd className="font-mono text-xs break-all">{sub.id}</dd>
          <dt className="text-muted-foreground">Clarification Rounds</dt>
          <dd>{sub.clarificationRound || 0}</dd>
          <dt className="text-muted-foreground">Input Method</dt>
          <dd className="capitalize">{sub.inputMethod}</dd>
          {sub.taskId && (
            <>
              <dt className="text-muted-foreground">Task ID</dt>
              <dd className="font-mono text-xs break-all">{sub.taskId}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Actions */}
      {canApprove && (
        <>
          <Separator />
          <div className="flex items-center gap-2">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => onApprove(sub)}
              disabled={approvePending || repositories.length === 0}
            >
              {approvePending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Approve & Create Task
            </Button>
            <Button
              variant="outline"
              className="text-red-500 border-red-500/30 hover:bg-red-500/10"
              onClick={() => onReject(sub.id)}
              disabled={rejectPending}
            >
              {rejectPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <XCircle className="h-4 w-4 mr-1.5" />
              )}
              Reject
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
