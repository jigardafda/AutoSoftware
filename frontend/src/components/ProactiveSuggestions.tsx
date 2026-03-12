import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Lightbulb,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  GitBranch,
  Zap,
  Calendar,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Clock,
  Eye,
  FileCode,
  TrendingUp,
  BookOpen,
  TestTube,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import type { LucideIcon } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

type SuggestionType =
  | "refactor_first"
  | "optimization"
  | "pattern_match"
  | "scheduled_improvement"
  | "pre_task_warning"
  | "dependency_update"
  | "test_coverage"
  | "documentation";

type SuggestionPriority = "low" | "medium" | "high" | "critical";

type SuggestionStatus = "pending" | "accepted" | "dismissed" | "applied" | "expired";

interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  actionType: "create_task" | "apply_fix" | "review" | "ignore" | "defer";
  payload?: Record<string, any>;
}

interface ImpactEstimate {
  codeQuality: number;
  performance: number;
  maintainability: number;
  timeToFix: number;
  riskLevel: "low" | "medium" | "high";
}

interface ProactiveSuggestion {
  id: string;
  type: SuggestionType;
  priority: SuggestionPriority;
  status: SuggestionStatus;
  title: string;
  description: string;
  rationale: string;
  affectedFiles: string[];
  suggestedActions: SuggestedAction[];
  relatedTaskId?: string;
  relatedPatternId?: string;
  confidence: number;
  estimatedImpact: ImpactEstimate;
  metadata: Record<string, any>;
  createdAt: string;
  expiresAt?: string;
}

interface ProactiveSuggestionsProps {
  repositoryId?: string;
  taskId?: string;
  compact?: boolean;
  limit?: number;
  onSuggestionApplied?: (suggestion: ProactiveSuggestion, actionId: string) => void;
}

// ============================================================================
// Icon and Style Mappings
// ============================================================================

const TYPE_ICON_MAP: Record<SuggestionType, LucideIcon> = {
  refactor_first: RefreshCw,
  optimization: Zap,
  pattern_match: GitBranch,
  scheduled_improvement: Calendar,
  pre_task_warning: AlertTriangle,
  dependency_update: FileCode,
  test_coverage: TestTube,
  documentation: BookOpen,
};

const TYPE_LABEL_MAP: Record<SuggestionType, string> = {
  refactor_first: "Refactor First",
  optimization: "Optimization",
  pattern_match: "Pattern Match",
  scheduled_improvement: "Scheduled",
  pre_task_warning: "Pre-Task Warning",
  dependency_update: "Dependency",
  test_coverage: "Test Coverage",
  documentation: "Documentation",
};

const PRIORITY_COLORS: Record<SuggestionPriority, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const TYPE_COLORS: Record<SuggestionType, string> = {
  refactor_first: "text-purple-500",
  optimization: "text-yellow-500",
  pattern_match: "text-blue-500",
  scheduled_improvement: "text-green-500",
  pre_task_warning: "text-orange-500",
  dependency_update: "text-cyan-500",
  test_coverage: "text-indigo-500",
  documentation: "text-pink-500",
};

// ============================================================================
// Helper Components
// ============================================================================

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  const color =
    percentage >= 80
      ? "bg-green-500"
      : percentage >= 60
        ? "bg-yellow-500"
        : "bg-orange-500";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full ${color}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{percentage}%</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Confidence: {percentage}%</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ImpactBadges({ impact }: { impact: ImpactEstimate }) {
  const items = [
    { label: "Quality", value: impact.codeQuality, icon: Sparkles },
    { label: "Performance", value: impact.performance, icon: Zap },
    { label: "Maintainability", value: impact.maintainability, icon: TrendingUp },
  ].filter((item) => item.value > 0);

  if (items.length === 0) return null;

  return (
    <div className="flex gap-1 flex-wrap">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Tooltip key={item.label}>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs py-0 px-1.5">
                <Icon className="w-3 h-3 mr-1" />
                +{item.value}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{item.label} improvement: +{item.value}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
      {impact.timeToFix !== 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-xs py-0 px-1.5">
              <Clock className="w-3 h-3 mr-1" />
              {impact.timeToFix < 0 ? `-${Math.abs(impact.timeToFix)}m saved` : `${impact.timeToFix}m`}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Estimated time: {impact.timeToFix < 0 ? `${Math.abs(impact.timeToFix)} minutes saved` : `${impact.timeToFix} minutes to fix`}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onDismiss,
  onApply,
  isLoading,
}: {
  suggestion: ProactiveSuggestion;
  onDismiss: (id: string) => void;
  onApply: (id: string, actionId: string) => void;
  isLoading: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = TYPE_ICON_MAP[suggestion.type] || Lightbulb;
  const typeColor = TYPE_COLORS[suggestion.type] || "text-gray-500";

  return (
    <Card className="border-l-4 transition-all hover:shadow-sm" style={{
      borderLeftColor: suggestion.priority === "critical" ? "rgb(239 68 68)" :
                       suggestion.priority === "high" ? "rgb(249 115 22)" :
                       suggestion.priority === "medium" ? "rgb(59 130 246)" :
                       "rgb(148 163 184)"
    }}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`mt-0.5 ${typeColor}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm font-medium leading-tight">
                      {suggestion.title}
                    </CardTitle>
                    <Badge className={`text-xs ${PRIORITY_COLORS[suggestion.priority]}`}>
                      {suggestion.priority}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABEL_MAP[suggestion.type]}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs mt-1 line-clamp-2">
                    {suggestion.description}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ConfidenceMeter confidence={suggestion.confidence} />
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-4">
            <div className="space-y-4 ml-8">
              {/* Rationale */}
              {suggestion.rationale && (
                <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                  <span className="font-medium text-foreground">Why: </span>
                  {suggestion.rationale}
                </div>
              )}

              {/* Affected Files */}
              {suggestion.affectedFiles.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Affected Files:</p>
                  <div className="flex flex-wrap gap-1">
                    {suggestion.affectedFiles.slice(0, 5).map((file) => (
                      <Badge key={file} variant="secondary" className="text-xs font-mono">
                        {file.split("/").pop()}
                      </Badge>
                    ))}
                    {suggestion.affectedFiles.length > 5 && (
                      <Badge variant="secondary" className="text-xs">
                        +{suggestion.affectedFiles.length - 5} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Impact */}
              <ImpactBadges impact={suggestion.estimatedImpact} />

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {suggestion.suggestedActions.map((action) => (
                  <Button
                    key={action.id}
                    variant={action.actionType === "ignore" || action.actionType === "defer" ? "ghost" : "default"}
                    size="sm"
                    disabled={isLoading}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (action.actionType === "ignore") {
                        onDismiss(suggestion.id);
                      } else {
                        onApply(suggestion.id, action.id);
                      }
                    }}
                  >
                    {action.actionType === "create_task" && <FileCode className="w-3 h-3 mr-1" />}
                    {action.actionType === "apply_fix" && <Check className="w-3 h-3 mr-1" />}
                    {action.actionType === "review" && <Eye className="w-3 h-3 mr-1" />}
                    {action.actionType === "ignore" && <X className="w-3 h-3 mr-1" />}
                    {action.actionType === "defer" && <Clock className="w-3 h-3 mr-1" />}
                    {action.title}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(suggestion.id);
                  }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Dismiss
                </Button>
              </div>

              {/* Metadata */}
              {suggestion.relatedTaskId && (
                <p className="text-xs text-muted-foreground">
                  Related to task: {suggestion.relatedTaskId}
                </p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ProactiveSuggestions({
  repositoryId,
  taskId,
  compact = false,
  limit = 10,
  onSuggestionApplied,
}: ProactiveSuggestionsProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<SuggestionType | "all">("all");

  // Fetch suggestions
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["suggestions", repositoryId, taskId],
    queryFn: async () => {
      if (taskId) {
        return api.suggestions.forTask(taskId);
      } else if (repositoryId) {
        return api.suggestions.list(repositoryId, { limit: limit.toString() });
      }
      return { suggestions: [] };
    },
    enabled: !!(repositoryId || taskId),
    refetchInterval: 60000, // Refresh every minute
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: (suggestionId: string) => api.suggestions.dismiss(suggestionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });

  // Apply mutation
  const applyMutation = useMutation({
    mutationFn: ({ suggestionId, actionId }: { suggestionId: string; actionId: string }) =>
      api.suggestions.apply(suggestionId, actionId),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
      if (onSuggestionApplied) {
        const suggestion = suggestions.find((s) => s.id === variables.suggestionId);
        if (suggestion) {
          onSuggestionApplied(suggestion, variables.actionId);
        }
      }
    },
  });

  // Get suggestions from response
  const suggestions: ProactiveSuggestion[] = useMemo(() => {
    const allSuggestions = [
      ...(data?.generatedSuggestions || []),
      ...(data?.storedSuggestions || []),
      ...(data?.suggestions || []),
    ];

    // Filter by type if not "all"
    if (filter !== "all") {
      return allSuggestions.filter((s) => s.type === filter);
    }

    return allSuggestions;
  }, [data, filter]);

  // Group by priority
  const groupedSuggestions = useMemo(() => {
    const groups: Record<SuggestionPriority, ProactiveSuggestion[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const suggestion of suggestions) {
      groups[suggestion.priority].push(suggestion);
    }

    return groups;
  }, [suggestions]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lightbulb className="w-4 h-4" />
            Proactive Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lightbulb className="w-4 h-4" />
            Proactive Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load suggestions</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lightbulb className="w-4 h-4" />
            Proactive Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No suggestions at this time. Your code is looking good!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compact view
  if (compact) {
    const topSuggestions = suggestions.slice(0, 3);
    return (
      <Card className="border-ai/20 bg-ai/5">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lightbulb className="w-4 h-4 text-ai" />
              Suggestions
              <Badge variant="secondary" className="text-xs">
                {suggestions.length}
              </Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="py-0 pb-3 px-4">
          <div className="space-y-2">
            {topSuggestions.map((suggestion) => {
              const Icon = TYPE_ICON_MAP[suggestion.type];
              return (
                <div
                  key={suggestion.id}
                  className="flex items-start gap-2 rounded-md bg-background/50 p-2"
                >
                  <Icon className={`w-4 h-4 mt-0.5 ${TYPE_COLORS[suggestion.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{suggestion.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {suggestion.description}
                    </p>
                  </div>
                  <Badge className={`text-xs shrink-0 ${PRIORITY_COLORS[suggestion.priority]}`}>
                    {suggestion.priority}
                  </Badge>
                </div>
              );
            })}
            {suggestions.length > 3 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{suggestions.length - 3} more suggestions
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full view
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-ai" />
          <h3 className="font-semibold">Proactive Suggestions</h3>
          <Badge variant="secondary">{suggestions.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as SuggestionType | "all")}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            <option value="all">All Types</option>
            {Object.entries(TYPE_LABEL_MAP).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Suggestions by priority */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-6 pr-4">
          {(["critical", "high", "medium", "low"] as SuggestionPriority[]).map((priority) => {
            const group = groupedSuggestions[priority];
            if (group.length === 0) return null;

            return (
              <div key={priority}>
                <h4 className="text-sm font-medium text-muted-foreground mb-2 capitalize">
                  {priority} Priority ({group.length})
                </h4>
                <div className="space-y-2">
                  {group.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onDismiss={dismissMutation.mutate}
                      onApply={(id, actionId) => applyMutation.mutate({ suggestionId: id, actionId })}
                      isLoading={dismissMutation.isPending || applyMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// Summary Component
// ============================================================================

interface SuggestionSummary {
  total: number;
  byType: Record<SuggestionType, number>;
  byPriority: Record<SuggestionPriority, number>;
  pendingCount: number;
  recentlyDismissed: number;
  recentlyApplied: number;
}

export function ProactiveSuggestionsSummary({ repositoryId }: { repositoryId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["suggestions-summary", repositoryId],
    queryFn: () => api.suggestions.summary(repositoryId),
    enabled: !!repositoryId,
  });

  if (isLoading || !data?.summary) {
    return null;
  }

  const summary: SuggestionSummary = data.summary;

  if (summary.pendingCount === 0) {
    return null;
  }

  return (
    <Card className="border-ai/20 bg-ai/5">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-ai" />
            <span className="text-sm font-medium">
              {summary.pendingCount} pending suggestion{summary.pendingCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex gap-1">
            {summary.byPriority.critical > 0 && (
              <Badge className={PRIORITY_COLORS.critical}>
                {summary.byPriority.critical} critical
              </Badge>
            )}
            {summary.byPriority.high > 0 && (
              <Badge className={PRIORITY_COLORS.high}>
                {summary.byPriority.high} high
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Export default for easier importing
export default ProactiveSuggestions;
