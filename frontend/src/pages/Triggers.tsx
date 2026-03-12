/**
 * Triggers Page
 *
 * Main page for managing workflow automation triggers:
 * - List all triggers with status
 * - Create new triggers with visual builder
 * - Edit existing triggers
 * - View execution history
 * - Use templates for common workflows
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Zap,
  LayoutGrid,
  List,
  Filter,
  BarChart3,
  History,
  ChevronLeft,
  Copy,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshButton } from "@/components/RefreshButton";
import { TriggerList, TriggerCards, ExecutionHistory } from "@/components/triggers/TriggerList";
import { TriggerBuilder } from "@/components/triggers/TriggerBuilder";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

interface TriggerTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  conditions: any;
  actions: any[];
}

type ViewMode = "list" | "grid";

// ============================================================================
// Main Component
// ============================================================================

export function Triggers() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Sheet/Dialog state
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [historyTrigger, setHistoryTrigger] = useState<Trigger | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Queries
  const { data: triggersData, isLoading: isLoadingTriggers } = useQuery({
    queryKey: ["triggers"],
    queryFn: api.triggers.list,
  });

  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ["triggers", "stats"],
    queryFn: api.triggers.stats,
  });

  const { data: templatesData } = useQuery({
    queryKey: ["triggers", "templates"],
    queryFn: api.triggers.templates,
  });

  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["triggers", historyTrigger?.id, "history"],
    queryFn: () =>
      historyTrigger ? api.triggers.history(historyTrigger.id) : null,
    enabled: !!historyTrigger,
  });

  const triggers = triggersData?.data || [];
  const stats = statsData?.data;
  const executions = historyData?.data || [];

  // Fallback templates in case API fails
  const defaultTemplates: TriggerTemplate[] = [
    {
      id: "task-completed-notify",
      name: "Notify on Task Completion",
      description: "Send a notification when any task is marked as completed",
      triggerType: "task_status_change",
      conditions: { type: "condition", field: "newStatus", operator: "equals", value: "completed" },
      actions: [{ type: "notify", config: { channel: "in_app", title: "Task Completed", message: "Task '{{taskTitle}}' has been completed" } }],
    },
    {
      id: "scan-issues-webhook",
      name: "Webhook on Scan with Issues",
      description: "Call a webhook when a scan completes with new tasks found",
      triggerType: "scan_complete",
      conditions: { type: "group", operator: "AND", conditions: [
        { type: "condition", field: "status", operator: "equals", value: "completed" },
        { type: "condition", field: "tasksCreated", operator: "greater_than", value: 0 },
      ]},
      actions: [{ type: "webhook", config: { url: "https://your-webhook-url.com", method: "POST" } }],
    },
    {
      id: "critical-task-auto-assign",
      name: "Auto-assign Critical Tasks",
      description: "Automatically assign critical priority tasks to a team lead",
      triggerType: "task_status_change",
      conditions: { type: "group", operator: "AND", conditions: [
        { type: "condition", field: "newStatus", operator: "equals", value: "pending" },
        { type: "condition", field: "priority", operator: "equals", value: "critical" },
      ]},
      actions: [{ type: "auto_assign", config: { assignTo: "team-lead" } }],
    },
    {
      id: "daily-scan-notification",
      name: "Daily Scan Summary",
      description: "Send a daily email with scan results summary",
      triggerType: "time_based",
      conditions: { type: "condition", field: "hour", operator: "equals", value: "9" },
      actions: [{ type: "email", config: { subject: "Daily Scan Summary", body: "Here's your daily scan summary..." } }],
    },
  ];

  const templates = (templatesData?.data && templatesData.data.length > 0)
    ? templatesData.data
    : defaultTemplates;

  // Filter triggers
  const filteredTriggers = triggers.filter((t: Trigger) => {
    if (typeFilter !== "all" && t.triggerType !== typeFilter) return false;
    if (statusFilter === "enabled" && !t.enabled) return false;
    if (statusFilter === "disabled" && t.enabled) return false;
    return true;
  });

  const handleEdit = (trigger: Trigger) => {
    setEditingTrigger(trigger);
    setIsBuilderOpen(true);
  };

  const handleViewHistory = (trigger: Trigger) => {
    setHistoryTrigger(trigger);
  };

  const handleCreateNew = () => {
    setEditingTrigger(null);
    setIsBuilderOpen(true);
  };

  const handleUseTemplate = (template: TriggerTemplate) => {
    setEditingTrigger({
      id: "",
      name: template.name,
      description: template.description,
      enabled: true,
      triggerType: template.triggerType,
      conditions: template.conditions,
      actions: template.actions,
      lastTriggeredAt: null,
      triggerCount: 0,
      executionCount: 0,
      createdAt: "",
      updatedAt: "",
    });
    setShowTemplates(false);
    setIsBuilderOpen(true);
  };

  const handleBuilderSave = () => {
    queryClient.invalidateQueries({ queryKey: ["triggers"] });
    setIsBuilderOpen(false);
    setEditingTrigger(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Triggers</h1>
          <Badge variant="secondary">{triggers.length}</Badge>
          <RefreshButton queryKeys={["triggers"]} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowTemplates(true)}>
            <Copy className="h-4 w-4 mr-2" />
            Templates
          </Button>
          <Button onClick={handleCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            Create Trigger
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Triggers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTriggers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalExecutions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.successRate.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Failed / Skipped
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.executionStats.failed} / {stats.executionStats.skipped}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters & View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px] h-8">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="task_status_change">Task Status</SelectItem>
              <SelectItem value="scan_complete">Scan Complete</SelectItem>
              <SelectItem value="time_based">Time Based</SelectItem>
              <SelectItem value="file_change">File Change</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          {(typeFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setTypeFilter("all");
                setStatusFilter("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1 border rounded-md p-1">
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Trigger List/Grid */}
      {viewMode === "list" ? (
        <TriggerList
          triggers={filteredTriggers}
          isLoading={isLoadingTriggers}
          onEdit={handleEdit}
          onViewHistory={handleViewHistory}
        />
      ) : (
        <TriggerCards
          triggers={filteredTriggers}
          isLoading={isLoadingTriggers}
          onEdit={handleEdit}
          onViewHistory={handleViewHistory}
        />
      )}

      {/* Recent Executions */}
      {stats?.recentExecutions && stats.recentExecutions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              <CardTitle className="text-base">Recent Executions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentExecutions.map((exec: any) => (
                <div
                  key={exec.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                >
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      exec.status === "success" && "bg-green-500",
                      exec.status === "failed" && "bg-destructive",
                      exec.status === "skipped" && "bg-amber-500"
                    )}
                  />
                  <span className="font-medium text-sm">{exec.triggerName}</span>
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
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(exec.executedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trigger Builder Sheet */}
      <Sheet open={isBuilderOpen} onOpenChange={setIsBuilderOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingTrigger?.id ? "Edit Trigger" : "Create Trigger"}
            </SheetTitle>
            <SheetDescription>
              Configure automated workflows based on events
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <TriggerBuilder
              trigger={
                editingTrigger
                  ? {
                      ...editingTrigger,
                      description: editingTrigger.description || "",
                      triggerType: editingTrigger.triggerType as "task_status_change" | "scan_complete" | "time_based" | "file_change",
                    }
                  : undefined
              }
              onSave={handleBuilderSave}
              onCancel={() => setIsBuilderOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Execution History Sheet */}
      <Sheet open={!!historyTrigger} onOpenChange={(open) => !open && setHistoryTrigger(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Execution History
            </SheetTitle>
            <SheetDescription>
              {historyTrigger?.name}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ExecutionHistory
              executions={executions}
              isLoading={isLoadingHistory}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trigger Templates</DialogTitle>
            <DialogDescription>
              Start with a pre-built template for common workflows
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 mt-4">
            {templates.map((template: TriggerTemplate) => (
              <Card
                key={template.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleUseTemplate(template)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{template.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    {template.description}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {template.triggerType.replace(/_/g, " ")}
                    </Badge>
                    {template.actions.map((action: any, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {action.type}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Triggers;
