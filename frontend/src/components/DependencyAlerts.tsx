/**
 * Dependency Alerts Component
 *
 * Displays dependency intelligence alerts including:
 * - Security vulnerabilities
 * - Breaking changes
 * - Unmaintained packages
 * - Deprecated packages
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ShieldAlert,
  Package,
  TrendingUp,
  RefreshCw,
  X,
  ExternalLink,
  ChevronRight,
  AlertOctagon,
  Clock,
  Archive,
  Sparkles,
  Filter,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { LucideIcon } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface DependencyAlert {
  id: string;
  repositoryId: string;
  ecosystem: string;
  packageName: string;
  currentVersion: string;
  alertType: "security" | "breaking_change" | "unmaintained" | "deprecated" | "license_change" | "upgrade_available";
  severity: "critical" | "high" | "moderate" | "low";
  status: "active" | "dismissed" | "resolved" | "auto_resolved";
  title: string;
  description: string;
  affectedVersions?: string;
  patchedVersion?: string;
  cveId?: string;
  cvssScore?: number;
  recommendedVersion?: string;
  upgradePath?: {
    from: string;
    to: string;
    steps: string[];
    breakingChanges: string[];
    migrationGuide?: string;
  };
  sourceUrl?: string;
  publishedAt?: string;
  createdAt: string;
  repository?: {
    id: string;
    fullName: string;
  };
}

interface AlertSummary {
  totalAlerts: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  byRepository: { repositoryId: string; name: string; count: number }[];
}

// ============================================================================
// Constants
// ============================================================================

const ALERT_TYPE_CONFIG: Record<
  string,
  { icon: LucideIcon; label: string; color: string }
> = {
  security: {
    icon: ShieldAlert,
    label: "Security",
    color: "text-red-500",
  },
  breaking_change: {
    icon: AlertTriangle,
    label: "Breaking Change",
    color: "text-orange-500",
  },
  unmaintained: {
    icon: Clock,
    label: "Unmaintained",
    color: "text-yellow-500",
  },
  deprecated: {
    icon: Archive,
    label: "Deprecated",
    color: "text-purple-500",
  },
  license_change: {
    icon: AlertOctagon,
    label: "License Change",
    color: "text-blue-500",
  },
  upgrade_available: {
    icon: TrendingUp,
    label: "Update Available",
    color: "text-green-500",
  },
};

const SEVERITY_CONFIG: Record<
  string,
  { variant: "destructive" | "warning" | "info" | "secondary"; label: string }
> = {
  critical: { variant: "destructive", label: "Critical" },
  high: { variant: "destructive", label: "High" },
  moderate: { variant: "warning", label: "Moderate" },
  low: { variant: "info", label: "Low" },
};

const ECOSYSTEM_ICONS: Record<string, string> = {
  npm: "N",
  pypi: "Py",
  maven: "Mv",
  go: "Go",
  cargo: "Rs",
  nuget: ".N",
  gem: "Rb",
  composer: "Ph",
};

// ============================================================================
// Sub-components
// ============================================================================

function AlertCard({
  alert,
  onDismiss,
  onCreateTask,
  onViewDetails,
}: {
  alert: DependencyAlert;
  onDismiss: () => void;
  onCreateTask: () => void;
  onViewDetails: () => void;
}) {
  const typeConfig = ALERT_TYPE_CONFIG[alert.alertType] || ALERT_TYPE_CONFIG.security;
  const severityConfig = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.moderate;
  const Icon = typeConfig.icon;

  return (
    <div className="group rounded-lg border border-border/50 bg-card p-4 transition-colors hover:bg-accent/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`mt-0.5 shrink-0 ${typeConfig.color}`}>
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant={severityConfig.variant} className="shrink-0">
                {severityConfig.label}
              </Badge>
              <Badge variant="outline" className="shrink-0">
                {ECOSYSTEM_ICONS[alert.ecosystem] || alert.ecosystem}
              </Badge>
              {alert.cveId && (
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                  {alert.cveId}
                </Badge>
              )}
            </div>
            <h4 className="font-medium text-sm leading-tight mb-1 truncate">
              {alert.title}
            </h4>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {alert.description}
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Package size={12} />
                <code className="bg-muted px-1 rounded">{alert.packageName}</code>
                <span>@{alert.currentVersion}</span>
              </span>
              {alert.recommendedVersion && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <TrendingUp size={12} />
                  <span>Upgrade to {alert.recommendedVersion}</span>
                </span>
              )}
              {alert.repository && (
                <span className="truncate max-w-[150px]">
                  {alert.repository.fullName}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onViewDetails}
          >
            <ChevronRight size={14} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <span className="sr-only">Actions</span>
                ...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onCreateTask}>
                <Plus size={14} className="mr-2" />
                Create Task
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDismiss}>
                <X size={14} className="mr-2" />
                Dismiss
              </DropdownMenuItem>
              {alert.sourceUrl && (
                <DropdownMenuItem
                  onClick={() => window.open(alert.sourceUrl, "_blank")}
                >
                  <ExternalLink size={14} className="mr-2" />
                  View Source
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function AlertDetailModal({
  alert,
  open,
  onClose,
  onCreateTask,
  onDismiss,
  onResolve,
}: {
  alert: DependencyAlert | null;
  open: boolean;
  onClose: () => void;
  onCreateTask: () => void;
  onDismiss: () => void;
  onResolve: () => void;
}) {
  if (!alert) return null;

  const typeConfig = ALERT_TYPE_CONFIG[alert.alertType] || ALERT_TYPE_CONFIG.security;
  const severityConfig = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.moderate;
  const Icon = typeConfig.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className={typeConfig.color}>
              <Icon size={20} />
            </div>
            <Badge variant={severityConfig.variant}>{severityConfig.label}</Badge>
            {alert.cveId && (
              <Badge variant="outline" className="font-mono">
                {alert.cveId}
              </Badge>
            )}
          </div>
          <DialogTitle>{alert.title}</DialogTitle>
          <DialogDescription className="text-left">
            {alert.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Package info */}
          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="text-sm font-medium mb-2">Package Information</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Package:</span>{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded">
                  {alert.packageName}
                </code>
              </div>
              <div>
                <span className="text-muted-foreground">Ecosystem:</span>{" "}
                <span className="capitalize">{alert.ecosystem}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Current Version:</span>{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded">
                  {alert.currentVersion}
                </code>
              </div>
              {alert.recommendedVersion && (
                <div>
                  <span className="text-muted-foreground">Recommended:</span>{" "}
                  <code className="bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">
                    {alert.recommendedVersion}
                  </code>
                </div>
              )}
              {alert.cvssScore !== undefined && (
                <div>
                  <span className="text-muted-foreground">CVSS Score:</span>{" "}
                  <span
                    className={
                      alert.cvssScore >= 9
                        ? "text-red-500 font-bold"
                        : alert.cvssScore >= 7
                          ? "text-orange-500 font-medium"
                          : alert.cvssScore >= 4
                            ? "text-yellow-500"
                            : ""
                    }
                  >
                    {alert.cvssScore}/10
                  </span>
                </div>
              )}
              {alert.affectedVersions && (
                <div>
                  <span className="text-muted-foreground">Affected:</span>{" "}
                  <code className="text-red-500">{alert.affectedVersions}</code>
                </div>
              )}
            </div>
          </div>

          {/* Upgrade path */}
          {alert.upgradePath && alert.upgradePath.steps.length > 0 && (
            <div className="rounded-lg border p-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <TrendingUp size={14} />
                Recommended Upgrade Path
              </h4>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <code className="bg-muted px-2 py-1 rounded">
                  {alert.upgradePath.from}
                </code>
                {alert.upgradePath.steps.map((step, i) => (
                  <span key={step} className="flex items-center gap-2">
                    <ChevronRight size={14} className="text-muted-foreground" />
                    <code
                      className={`px-2 py-1 rounded ${
                        i === alert.upgradePath!.steps.length - 1
                          ? "bg-green-500/10 text-green-600"
                          : "bg-muted"
                      }`}
                    >
                      {step}
                    </code>
                  </span>
                ))}
              </div>
              {alert.upgradePath.migrationGuide && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {alert.upgradePath.migrationGuide}
                </p>
              )}
            </div>
          )}

          {/* Source link */}
          {alert.sourceUrl && (
            <a
              href={alert.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink size={14} />
              View full advisory
            </a>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onDismiss}>
            <X size={14} className="mr-2" />
            Dismiss
          </Button>
          <Button variant="outline" onClick={onResolve}>
            <CheckCircle2 size={14} className="mr-2" />
            Mark Resolved
          </Button>
          <Button onClick={onCreateTask}>
            <Plus size={14} className="mr-2" />
            Create Upgrade Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ summary }: { summary: AlertSummary }) {
  const criticalAndHigh =
    (summary.bySeverity.critical || 0) + (summary.bySeverity.high || 0);

  return (
    <Card className={criticalAndHigh > 0 ? "border-red-500/30" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldAlert size={14} className={criticalAndHigh > 0 ? "text-red-500" : "text-muted-foreground"} />
          Dependency Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{summary.totalAlerts}</div>
            <div className="text-xs text-muted-foreground">Total Alerts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">
              {summary.bySeverity.critical || 0}
            </div>
            <div className="text-xs text-muted-foreground">Critical</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-500">
              {summary.bySeverity.high || 0}
            </div>
            <div className="text-xs text-muted-foreground">High</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-500">
              {(summary.bySeverity.moderate || 0) + (summary.bySeverity.low || 0)}
            </div>
            <div className="text-xs text-muted-foreground">Other</div>
          </div>
        </div>

        {summary.byRepository.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">
              By Repository
            </h4>
            <div className="space-y-1">
              {summary.byRepository.slice(0, 3).map((repo) => (
                <div
                  key={repo.repositoryId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate">{repo.name}</span>
                  <Badge variant="secondary">{repo.count}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface DependencyAlertsProps {
  repositoryId?: string;
  compact?: boolean;
  limit?: number;
}

export function DependencyAlerts({
  repositoryId,
  compact = false,
  limit = 10,
}: DependencyAlertsProps) {
  const queryClient = useQueryClient();
  const [selectedAlert, setSelectedAlert] = useState<DependencyAlert | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  // Fetch alerts
  const { data: alerts = [], isLoading: alertsLoading, refetch } = useQuery({
    queryKey: ["dependency-alerts", repositoryId, filterSeverity, filterType],
    queryFn: async () => {
      const params: Record<string, string> = {
        status: "active",
        limit: String(limit),
      };
      if (repositoryId) params.repositoryId = repositoryId;
      if (filterSeverity) params.severity = filterSeverity;
      if (filterType) params.type = filterType;

      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`/api/dependencies/alerts?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();
      return data.data as DependencyAlert[];
    },
    refetchInterval: 60000,
  });

  // Fetch summary
  const { data: summary } = useQuery({
    queryKey: ["dependency-summary"],
    queryFn: async () => {
      const res = await fetch("/api/dependencies/summary", {
        credentials: "include",
      });
      const data = await res.json();
      return data.data as AlertSummary;
    },
    enabled: !compact,
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/dependencies/alerts/${alertId}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to dismiss alert");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dependency-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["dependency-summary"] });
      setSelectedAlert(null);
    },
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/dependencies/alerts/${alertId}/resolve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to resolve alert");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dependency-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["dependency-summary"] });
      setSelectedAlert(null);
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/dependencies/alerts/${alertId}/create-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to create task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dependency-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelectedAlert(null);
    },
  });

  // Analyze repository mutation
  const analyzeMutation = useMutation({
    mutationFn: async (repoId: string) => {
      const res = await fetch(`/api/dependencies/${repoId}/analyze`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to analyze dependencies");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dependency-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["dependency-summary"] });
    },
  });

  if (compact) {
    return (
      <Card className="border-orange-500/20 bg-orange-500/5">
        <CardHeader className="p-4 pb-0">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-orange-500" />
              Dependency Alerts
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => refetch()}
              disabled={alertsLoading}
            >
              <RefreshCw size={12} className={alertsLoading ? "animate-spin" : ""} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {alertsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Sparkles size={14} className="text-green-500" />
              <span>All dependencies are healthy!</span>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 3).map((alert) => {
                const typeConfig =
                  ALERT_TYPE_CONFIG[alert.alertType] || ALERT_TYPE_CONFIG.security;
                const Icon = typeConfig.icon;
                return (
                  <div
                    key={alert.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/50 rounded p-1.5 -mx-1.5"
                    onClick={() => setSelectedAlert(alert)}
                  >
                    <Icon size={14} className={typeConfig.color} />
                    <span className="truncate flex-1">{alert.title}</span>
                    <Badge
                      variant={SEVERITY_CONFIG[alert.severity]?.variant || "secondary"}
                      className="shrink-0 text-[10px] px-1.5"
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                );
              })}
              {alerts.length > 3 && (
                <div className="text-xs text-muted-foreground pt-1">
                  +{alerts.length - 3} more alerts
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {summary && <SummaryCard summary={summary} />}

      {/* Filters and actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter size={14} className="mr-2" />
                Severity
                {filterSeverity && (
                  <Badge variant="secondary" className="ml-2">
                    {filterSeverity}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterSeverity(null)}>
                All severities
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {["critical", "high", "moderate", "low"].map((s) => (
                <DropdownMenuItem key={s} onClick={() => setFilterSeverity(s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter size={14} className="mr-2" />
                Type
                {filterType && (
                  <Badge variant="secondary" className="ml-2">
                    {filterType.replace("_", " ")}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterType(null)}>
                All types
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {Object.entries(ALERT_TYPE_CONFIG).map(([key, config]) => (
                <DropdownMenuItem key={key} onClick={() => setFilterType(key)}>
                  <config.icon size={14} className={`mr-2 ${config.color}`} />
                  {config.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          {repositoryId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => analyzeMutation.mutate(repositoryId)}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <RefreshCw size={14} className="mr-2 animate-spin" />
              ) : (
                <RefreshCw size={14} className="mr-2" />
              )}
              Analyze Dependencies
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={alertsLoading}
          >
            <RefreshCw size={14} className={alertsLoading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Alert list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle size={16} />
            Active Alerts
            <Badge variant="secondary" className="ml-2">
              {alerts.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles size={32} className="mx-auto text-green-500 mb-2" />
              <h3 className="font-medium">All Clear!</h3>
              <p className="text-sm text-muted-foreground">
                No dependency issues detected.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onDismiss={() => dismissMutation.mutate(alert.id)}
                    onCreateTask={() => createTaskMutation.mutate(alert.id)}
                    onViewDetails={() => setSelectedAlert(alert)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Alert detail modal */}
      <AlertDetailModal
        alert={selectedAlert}
        open={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onCreateTask={() => {
          if (selectedAlert) {
            createTaskMutation.mutate(selectedAlert.id);
          }
        }}
        onDismiss={() => {
          if (selectedAlert) {
            dismissMutation.mutate(selectedAlert.id);
          }
        }}
        onResolve={() => {
          if (selectedAlert) {
            resolveMutation.mutate(selectedAlert.id);
          }
        }}
      />
    </div>
  );
}

// Export for dashboard widget
export function DependencyAlertsWidget() {
  return <DependencyAlerts compact limit={5} />;
}
