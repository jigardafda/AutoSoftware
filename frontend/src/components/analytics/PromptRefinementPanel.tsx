/**
 * Prompt Refinement Panel Component
 *
 * Displays AI prompt improvement suggestions:
 * - List of suggested prompt improvements
 * - Failure patterns that led to suggestions
 * - One-click apply suggestion
 * - History of applied refinements
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Lightbulb,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Wand2,
  History,
  FileText,
  Zap,
  Target,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PromptSuggestion {
  id: string;
  category: 'scan' | 'plan' | 'execute' | 'analyze' | 'review';
  currentIssue: string;
  suggestedFix: string;
  expectedImprovement: number;
  failurePatterns: string[];
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
}

interface PromptRefinement {
  id: string;
  category: string;
  originalPattern: string;
  suggestedChange: string;
  reason: string;
  failureCount: number;
  appliedAt?: string;
  createdAt: string;
}

const categoryColors: Record<string, string> = {
  scan: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  plan: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  execute: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  analyze: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  review: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
};

const categoryIcons: Record<string, typeof FileText> = {
  scan: FileText,
  plan: Target,
  execute: Zap,
  analyze: Lightbulb,
  review: CheckCircle2,
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function SuggestionCard({
  suggestion,
  onApply,
  isApplying,
}: {
  suggestion: PromptSuggestion;
  onApply: (id: string) => void;
  isApplying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = categoryIcons[suggestion.category] || Lightbulb;

  return (
    <Card
      className={cn(
        'transition-colors',
        suggestion.priority === 'high' && 'border-orange-200 dark:border-orange-900/50'
      )}
    >
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-lg', categoryColors[suggestion.category])}>
            <Icon className="h-4 w-4" />
          </div>

          <div className="flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={categoryColors[suggestion.category]}>
                    {suggestion.category}
                  </Badge>
                  <Badge variant="outline" className={priorityColors[suggestion.priority]}>
                    {suggestion.priority} priority
                  </Badge>
                </div>
                <p className="font-medium">{suggestion.currentIssue}</p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      onClick={() => onApply(suggestion.id)}
                      disabled={isApplying}
                      className="shrink-0"
                    >
                      {isApplying ? (
                        <Clock className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Wand2 className="h-4 w-4 mr-1" />
                      )}
                      Apply
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Apply this prompt refinement</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="mt-3 space-y-2">
              <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-100 dark:border-green-900/30">
                <div className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400 mb-1">
                  <Lightbulb className="h-3 w-3" />
                  Suggested Fix
                </div>
                <p className="text-sm">{suggestion.suggestedFix}</p>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Target className="h-3.5 w-3.5" />
                  Expected improvement: +{suggestion.expectedImprovement}%
                </span>
                <span className="text-xs">
                  {new Date(suggestion.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {suggestion.failurePatterns && suggestion.failurePatterns.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {suggestion.failurePatterns.length} failure patterns
                </button>

                {expanded && (
                  <div className="mt-2 space-y-1 pl-5">
                    {suggestion.failurePatterns.map((pattern, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-orange-500 shrink-0" />
                        <span>{pattern}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryItem({ refinement }: { refinement: PromptRefinement }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="p-4 border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <div>
            <Badge variant="outline" className={categoryColors[refinement.category]}>
              {refinement.category}
            </Badge>
            <p className="text-sm font-medium mt-1">{refinement.originalPattern}</p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Applied {refinement.appliedAt ? new Date(refinement.appliedAt).toLocaleDateString() : 'N/A'}</p>
          <p className="mt-0.5">{refinement.failureCount} failures fixed</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Change Applied:</p>
            <p className="text-sm bg-muted/50 p-2 rounded">{refinement.suggestedChange}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Reason:</p>
            <p className="text-sm text-muted-foreground">{refinement.reason}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function PromptRefinementPanel() {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'history'>('suggestions');
  const queryClient = useQueryClient();

  // Fetch suggestions
  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<PromptSuggestion[]>({
    queryKey: ['ai-metrics', 'prompt-suggestions'],
    queryFn: async () => {
      const res = await fetch('/api/ai-metrics/prompt-suggestions', {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  // Fetch history
  const { data: history, isLoading: historyLoading } = useQuery<PromptRefinement[]>({
    queryKey: ['ai-metrics', 'refinement-history'],
    queryFn: async () => {
      const res = await fetch('/api/ai-metrics/refinement-history', {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  // Apply mutation
  const applyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ai-metrics/prompt-suggestions/${id}/apply`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to apply');
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-metrics', 'prompt-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['ai-metrics', 'refinement-history'] });
    },
  });

  // Group suggestions by priority
  const highPriority = suggestions?.filter((s) => s.priority === 'high') || [];
  const mediumPriority = suggestions?.filter((s) => s.priority === 'medium') || [];
  const lowPriority = suggestions?.filter((s) => s.priority === 'low') || [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Suggestions</p>
                <p className="text-2xl font-bold">{suggestions?.length || 0}</p>
              </div>
              <Lightbulb className="h-8 w-8 text-yellow-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Priority</p>
                <p className="text-2xl font-bold text-red-500">{highPriority.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Applied Refinements</p>
                <p className="text-2xl font-bold text-green-500">{history?.length || 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 p-1 bg-muted/50 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('suggestions')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
            activeTab === 'suggestions'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Lightbulb className="h-4 w-4" />
          Suggestions
          {suggestions && suggestions.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {suggestions.length}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
            activeTab === 'history'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <History className="h-4 w-4" />
          History
        </button>
      </div>

      {activeTab === 'suggestions' && (
        <div className="space-y-6">
          {suggestionsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : suggestions && suggestions.length > 0 ? (
            <>
              {highPriority.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    High Priority ({highPriority.length})
                  </h3>
                  <div className="space-y-4">
                    {highPriority.map((suggestion) => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        onApply={(id) => applyMutation.mutate(id)}
                        isApplying={applyMutation.isPending}
                      />
                    ))}
                  </div>
                </div>
              )}

              {mediumPriority.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-3">
                    Medium Priority ({mediumPriority.length})
                  </h3>
                  <div className="space-y-4">
                    {mediumPriority.map((suggestion) => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        onApply={(id) => applyMutation.mutate(id)}
                        isApplying={applyMutation.isPending}
                      />
                    ))}
                  </div>
                </div>
              )}

              {lowPriority.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-3">
                    Low Priority ({lowPriority.length})
                  </h3>
                  <div className="space-y-4">
                    {lowPriority.map((suggestion) => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        onApply={(id) => applyMutation.mutate(id)}
                        isApplying={applyMutation.isPending}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Suggestions Available</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    The AI system is performing well. Suggestions will appear here when failure
                    patterns are detected that could be improved with prompt refinements.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Applied Refinements
            </CardTitle>
            <CardDescription>
              History of prompt improvements that have been applied
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : history && history.length > 0 ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {history.map((refinement) => (
                  <HistoryItem key={refinement.id} refinement={refinement} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No History Yet</h3>
                <p className="text-sm text-muted-foreground">
                  Applied refinements will appear here once you start using suggestions.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PromptRefinementPanel;
