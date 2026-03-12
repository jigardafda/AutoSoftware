/**
 * TriggerList Component
 *
 * List all triggers with:
 * - Status indicators
 * - Enable/disable toggle
 * - Quick edit and delete
 * - Execution count and last run time
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Zap,
  Filter,
  GitBranch,
  Clock,
  FileText,
  MoreVertical,
  Edit2,
  Trash2,
  History,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

interface Trigger {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: string;
  conditions: any;
  actions: any[];
  lastTriggeredAt: string | null;
  triggerCount: number;
  executionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TriggerListProps {
  triggers: Trigger[];
  isLoading?: boolean;
  onEdit?: (trigger: Trigger) => void;
  onViewHistory?: (trigger: Trigger) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function getTriggerTypeIcon(type: string) {
  switch (type) {
    case "task_status_change":
      return <Zap className="h-4 w-4" />;
    case "scan_complete":
      return <Filter className="h-4 w-4" />;
    case "time_based":
      return <Clock className="h-4 w-4" />;
    case "file_change":
      return <FileText className="h-4 w-4" />;
    default:
      return <GitBranch className="h-4 w-4" />;
  }
}

function getTriggerTypeLabel(type: string) {
  switch (type) {
    case "task_status_change":
      return "Task Status";
    case "scan_complete":
      return "Scan Complete";
    case "time_based":
      return "Time Based";
    case "file_change":
      return "File Change";
    default:
      return type;
  }
}

function timeAgo(date: string | null) {
  if (!date) return "Never";

  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
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

function getActionsSummary(actions: any[]) {
  if (!actions || actions.length === 0) return "No actions";

  const types = actions.map((a) => {
    switch (a.type) {
      case "notify":
        return "Notify";
      case "email":
        return "Email";
      case "webhook":
        return "Webhook";
      case "auto_assign":
        return "Assign";
      case "run_task":
        return "Run Task";
      default:
        return a.type;
    }
  });

  if (types.length === 1) return types[0];
  if (types.length === 2) return types.join(" & ");
  return `${types[0]} + ${types.length - 1} more`;
}

// ============================================================================
// Main Component
// ============================================================================

export function TriggerList({
  triggers,
  isLoading,
  onEdit,
  onViewHistory,
}: TriggerListProps) {
  const queryClient = useQueryClient();
  const [deleteTriggerId, setDeleteTriggerId] = useState<string | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (triggerId: string) => api.triggers.toggle(triggerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
      toast.success("Trigger updated");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to toggle trigger");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (triggerId: string) => api.triggers.delete(triggerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
      toast.success("Trigger deleted");
      setDeleteTriggerId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete trigger");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-5 bg-muted rounded w-1/3" />
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (triggers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Zap className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium">No triggers yet</p>
          <p className="text-sm text-muted-foreground">
            Create a trigger to automate your workflows
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[140px]">Type</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
              <TableHead className="w-[120px]">Executions</TableHead>
              <TableHead className="w-[140px]">Last Triggered</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {triggers.map((trigger) => (
              <TableRow
                key={trigger.id}
                className={cn(
                  "cursor-pointer transition-colors",
                  !trigger.enabled && "opacity-60"
                )}
                onClick={() => onEdit?.(trigger)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center">
                    {getTriggerTypeIcon(trigger.triggerType)}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{trigger.name}</p>
                    {trigger.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                        {trigger.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {getTriggerTypeLabel(trigger.triggerType)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {getActionsSummary(trigger.actions)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">
                      {trigger.triggerCount}
                    </span>
                    {trigger.executionCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({trigger.executionCount} logged)
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {timeAgo(trigger.lastTriggeredAt)}
                  </span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={trigger.enabled}
                    onCheckedChange={() => toggleMutation.mutate(trigger.id)}
                    disabled={toggleMutation.isPending}
                  />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit?.(trigger)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onViewHistory?.(trigger)}>
                        <History className="h-4 w-4 mr-2" />
                        View History
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteTriggerId(trigger.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTriggerId}
        onOpenChange={(open) => !open && setDeleteTriggerId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trigger</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trigger? This action cannot be
              undone and all execution history will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTriggerId && deleteMutation.mutate(deleteTriggerId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================================
// Compact Card View (Alternative)
// ============================================================================

export function TriggerCards({
  triggers,
  isLoading,
  onEdit,
  onViewHistory,
}: TriggerListProps) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: (triggerId: string) => api.triggers.toggle(triggerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to toggle trigger");
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-5 bg-muted rounded w-2/3" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (triggers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Zap className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium">No triggers yet</p>
          <p className="text-sm text-muted-foreground">
            Create a trigger to automate your workflows
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {triggers.map((trigger) => (
        <Card
          key={trigger.id}
          className={cn(
            "cursor-pointer hover:shadow-md transition-shadow",
            !trigger.enabled && "opacity-60"
          )}
          onClick={() => onEdit?.(trigger)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "p-2 rounded-lg",
                    trigger.enabled
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {getTriggerTypeIcon(trigger.triggerType)}
                </div>
                <div>
                  <CardTitle className="text-base">{trigger.name}</CardTitle>
                  <Badge variant="outline" className="text-[10px] mt-1">
                    {getTriggerTypeLabel(trigger.triggerType)}
                  </Badge>
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={trigger.enabled}
                  onCheckedChange={() => toggleMutation.mutate(trigger.id)}
                  disabled={toggleMutation.isPending}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {trigger.description && (
              <CardDescription className="line-clamp-2 mb-3">
                {trigger.description}
              </CardDescription>
            )}

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Play className="h-3 w-3" />
                  {trigger.triggerCount} runs
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo(trigger.lastTriggeredAt)}
                </span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="flex items-center gap-1 mt-3 flex-wrap">
              {trigger.actions.map((action: any, i: number) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                >
                  {action.type}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Execution History
// ============================================================================

interface ExecutionHistoryProps {
  executions: {
    id: string;
    status: string;
    inputData: any;
    outputData: any;
    error: string | null;
    executedAt: string;
    durationMs: number | null;
  }[];
  isLoading?: boolean;
}

export function ExecutionHistory({ executions, isLoading }: ExecutionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No execution history</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {executions.map((exec) => (
        <Card
          key={exec.id}
          className={cn(
            "cursor-pointer",
            exec.status === "failed" && "border-destructive/50"
          )}
          onClick={() => setExpandedId(expandedId === exec.id ? null : exec.id)}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              {exec.status === "success" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : exec.status === "failed" ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs",
                      exec.status === "success" && "bg-green-500/10 text-green-500",
                      exec.status === "failed" && "bg-destructive/10 text-destructive",
                      exec.status === "skipped" && "bg-amber-500/10 text-amber-500"
                    )}
                  >
                    {exec.status}
                  </Badge>
                  {exec.durationMs && (
                    <span className="text-xs text-muted-foreground">
                      {exec.durationMs}ms
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(exec.executedAt).toLocaleString()}
                </p>
              </div>

              <ChevronRight
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  expandedId === exec.id && "rotate-90"
                )}
              />
            </div>

            {expandedId === exec.id && (
              <div className="mt-3 pt-3 border-t space-y-3">
                {exec.error && (
                  <div className="bg-destructive/10 text-destructive rounded p-2 text-sm">
                    {exec.error}
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium mb-1">Input Data:</p>
                  <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">
                    {JSON.stringify(exec.inputData, null, 2)}
                  </pre>
                </div>

                {exec.outputData && (
                  <div>
                    <p className="text-xs font-medium mb-1">Output:</p>
                    <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">
                      {JSON.stringify(exec.outputData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default TriggerList;
