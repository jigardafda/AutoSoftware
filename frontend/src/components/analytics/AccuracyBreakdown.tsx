/**
 * Accuracy Breakdown Component
 *
 * Displays AI accuracy breakdown by:
 * - Task type (bugfix, feature, refactor, etc.)
 * - Repository
 * - Scan finding type
 * - Color-coded performance indicators
 */

import { useQuery } from '@tanstack/react-query';
import {
  Bug,
  Sparkles,
  Wrench,
  Shield,
  GitBranch,
  FileSearch,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Minus,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AccuracyBreakdownProps {
  dateRange?: { startDate: string; endDate: string };
}

interface AccuracyMetrics {
  overall: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  totalPredictions: number;
  correctPredictions: number;
  incorrectPredictions: number;
}

interface BreakdownData {
  byTaskType: Record<string, AccuracyMetrics>;
  byRepository: Record<string, AccuracyMetrics>;
  byFindingType: Record<string, AccuracyMetrics>;
  byTimeperiod: { date: string; metrics: AccuracyMetrics }[];
}

const taskTypeIcons: Record<string, typeof Bug> = {
  bugfix: Bug,
  feature: Sparkles,
  refactor: Wrench,
  security: Shield,
  improvement: Sparkles,
  unknown: GitBranch,
};

const taskTypeColors: Record<string, string> = {
  bugfix: 'text-red-500 bg-red-500/10',
  feature: 'text-blue-500 bg-blue-500/10',
  refactor: 'text-purple-500 bg-purple-500/10',
  security: 'text-orange-500 bg-orange-500/10',
  improvement: 'text-green-500 bg-green-500/10',
  unknown: 'text-gray-500 bg-gray-500/10',
};

function getPerformanceColor(value: number): string {
  if (value >= 80) return 'text-green-500';
  if (value >= 60) return 'text-yellow-500';
  if (value >= 40) return 'text-orange-500';
  return 'text-red-500';
}

function getPerformanceBgColor(value: number): string {
  if (value >= 80) return 'bg-green-500';
  if (value >= 60) return 'bg-yellow-500';
  if (value >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

function getPerformanceLabel(value: number): string {
  if (value >= 80) return 'Excellent';
  if (value >= 60) return 'Good';
  if (value >= 40) return 'Needs Improvement';
  return 'Poor';
}

function PerformanceIndicator({ value }: { value: number }) {
  const Icon = value >= 80 ? CheckCircle2 : value >= 60 ? Minus : value >= 40 ? AlertTriangle : XCircle;
  const colorClass = getPerformanceColor(value);

  return (
    <div className={cn('flex items-center gap-1.5', colorClass)}>
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{value}%</span>
    </div>
  );
}

function MetricsRow({
  label,
  metrics,
  icon: Icon,
  iconColorClass,
}: {
  label: string;
  metrics: AccuracyMetrics;
  icon?: typeof Bug;
  iconColorClass?: string;
}) {
  return (
    <div className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className={cn('p-1.5 rounded-md', iconColorClass)}>
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div>
            <p className="font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">
              {metrics.totalPredictions} total predictions
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            metrics.overall >= 80
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : metrics.overall >= 60
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          )}
        >
          {getPerformanceLabel(metrics.overall)}
        </Badge>
      </div>

      <div className="space-y-3">
        {/* Overall Accuracy */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Overall Accuracy</span>
            <PerformanceIndicator value={metrics.overall} />
          </div>
          <Progress value={metrics.overall} className="h-1.5" />
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
          <div className="text-center p-2 bg-muted/30 rounded-md">
            <p className={cn('text-lg font-semibold', getPerformanceColor(metrics.precision))}>
              {metrics.precision}%
            </p>
            <p className="text-xs text-muted-foreground">Precision</p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-md">
            <p className={cn('text-lg font-semibold', getPerformanceColor(metrics.recall))}>
              {metrics.recall}%
            </p>
            <p className="text-xs text-muted-foreground">Recall</p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-md">
            <p className={cn('text-lg font-semibold', getPerformanceColor(metrics.f1Score))}>
              {metrics.f1Score}%
            </p>
            <p className="text-xs text-muted-foreground">F1 Score</p>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-md">
            <p className={cn('text-lg font-semibold', metrics.falsePositiveRate <= 20 ? 'text-green-500' : metrics.falsePositiveRate <= 40 ? 'text-yellow-500' : 'text-red-500')}>
              {metrics.falsePositiveRate}%
            </p>
            <p className="text-xs text-muted-foreground">FP Rate</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BreakdownSection({
  title,
  description,
  data,
  type,
  isLoading,
}: {
  title: string;
  description: string;
  data: Record<string, AccuracyMetrics>;
  type: 'taskType' | 'repository' | 'findingType';
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const entries = Object.entries(data).filter(([key]) => key !== 'unknown');

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            No data available for this breakdown
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by total predictions descending
  const sortedEntries = entries.sort((a, b) => b[1].totalPredictions - a[1].totalPredictions);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedEntries.map(([key, metrics]) => {
            const Icon = type === 'taskType' ? taskTypeIcons[key] || GitBranch : type === 'repository' ? GitBranch : FileSearch;
            const colorClass = type === 'taskType' ? taskTypeColors[key] || 'text-gray-500 bg-gray-500/10' : 'text-blue-500 bg-blue-500/10';

            return (
              <MetricsRow
                key={key}
                label={formatLabel(key, type)}
                metrics={metrics}
                icon={Icon}
                iconColorClass={colorClass}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function formatLabel(key: string, type: string): string {
  if (type === 'taskType') {
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
  }
  if (type === 'repository') {
    // Extract repo name from full path
    const parts = key.split('/');
    return parts[parts.length - 1] || key;
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function SummaryCards({ data }: { data?: BreakdownData }) {
  if (!data) return null;

  // Calculate overall averages
  const taskTypes = Object.values(data.byTaskType);
  const repositories = Object.values(data.byRepository);
  const findingTypes = Object.values(data.byFindingType);

  const avgTaskTypeAccuracy =
    taskTypes.length > 0
      ? Math.round(taskTypes.reduce((sum, m) => sum + m.overall, 0) / taskTypes.length)
      : 0;

  const avgRepoAccuracy =
    repositories.length > 0
      ? Math.round(repositories.reduce((sum, m) => sum + m.overall, 0) / repositories.length)
      : 0;

  const avgFindingAccuracy =
    findingTypes.length > 0
      ? Math.round(findingTypes.reduce((sum, m) => sum + m.overall, 0) / findingTypes.length)
      : 0;

  // Find best and worst performers
  const bestTaskType = taskTypes.length > 0
    ? Object.entries(data.byTaskType).sort((a, b) => b[1].overall - a[1].overall)[0]
    : null;

  const worstTaskType = taskTypes.length > 0
    ? Object.entries(data.byTaskType).sort((a, b) => a[1].overall - b[1].overall)[0]
    : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Avg. Task Type Accuracy</p>
          <p className={cn('text-2xl font-bold', getPerformanceColor(avgTaskTypeAccuracy))}>
            {avgTaskTypeAccuracy}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Across {taskTypes.length} task types
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Avg. Repository Accuracy</p>
          <p className={cn('text-2xl font-bold', getPerformanceColor(avgRepoAccuracy))}>
            {avgRepoAccuracy}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Across {repositories.length} repositories
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Best Performer</p>
          {bestTaskType ? (
            <>
              <p className="text-lg font-bold text-green-500">
                {formatLabel(bestTaskType[0], 'taskType')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {bestTaskType[1].overall}% accuracy
              </p>
            </>
          ) : (
            <p className="text-lg font-bold text-muted-foreground">N/A</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Needs Attention</p>
          {worstTaskType && worstTaskType[1].overall < 70 ? (
            <>
              <p className="text-lg font-bold text-orange-500">
                {formatLabel(worstTaskType[0], 'taskType')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {worstTaskType[1].overall}% accuracy
              </p>
            </>
          ) : (
            <p className="text-lg font-bold text-green-500">All Good!</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AccuracyBreakdown({ dateRange }: AccuracyBreakdownProps) {
  const { data, isLoading } = useQuery<BreakdownData>({
    queryKey: ['ai-metrics', 'accuracy', dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange?.endDate) params.set('endDate', dateRange.endDate);
      const res = await fetch(`/api/ai-metrics/accuracy?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <SummaryCards data={data} />

      {/* Breakdown Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BreakdownSection
          title="By Task Type"
          description="Accuracy breakdown for different task categories"
          data={data?.byTaskType || {}}
          type="taskType"
          isLoading={isLoading}
        />
        <BreakdownSection
          title="By Repository"
          description="Accuracy breakdown for different repositories"
          data={data?.byRepository || {}}
          type="repository"
          isLoading={isLoading}
        />
      </div>

      <BreakdownSection
        title="By Finding Type"
        description="Accuracy breakdown for different scan finding types"
        data={data?.byFindingType || {}}
        type="findingType"
        isLoading={isLoading}
      />
    </div>
  );
}

export default AccuracyBreakdown;
