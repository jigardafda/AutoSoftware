/**
 * AI Metrics Dashboard Component
 *
 * Displays AI self-improvement metrics including:
 * - Accuracy metrics cards (overall accuracy, precision, recall, F1)
 * - False positive rate chart over time
 * - Execution success rate by task type
 * - Trend graphs (improving/degrading)
 * - Recent feedback list
 * - Prompt refinement suggestions panel
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Activity,
  BarChart3,
  Minus,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { AccuracyBreakdown } from './AccuracyBreakdown';
import { PromptRefinementPanel } from './PromptRefinementPanel';

interface AIMetricsDashboardProps {
  dateRange?: { startDate: string; endDate: string };
}

interface MetricsOverview {
  overallAccuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  executionSuccessRate: number;
  totalFeedback: number;
  positiveFeedbackRate: number;
  activeSuggestions: number;
  trend: 'improving' | 'stable' | 'degrading';
  trendPercentage: number;
}

interface TrendData {
  date: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  executionSuccess: number;
}

interface FeedbackData {
  id: string;
  entityType: string;
  entityId: string;
  feedbackType: string;
  comment?: string;
  createdAt: string;
}

interface ExecutionSuccessData {
  taskType: string;
  successRate: number;
  total: number;
  successful: number;
}

interface FalsePositiveData {
  date: string;
  rate: number;
  count: number;
  total: number;
}

function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  description,
  colorClass,
}: {
  title: string;
  value: number;
  icon: typeof Target;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  description?: string;
  colorClass?: string;
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-green-500'
      : trend === 'down'
        ? 'text-red-500'
        : 'text-muted-foreground';

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className={cn('text-3xl font-bold', colorClass)}>{value}%</p>
              {trend && trendValue !== undefined && (
                <div className={cn('flex items-center gap-0.5 text-xs', trendColor)}>
                  <TrendIcon className="h-3 w-3" />
                  <span>{Math.abs(trendValue)}%</span>
                </div>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div
            className={cn(
              'p-2 rounded-lg',
              colorClass ? `bg-${colorClass}/10` : 'bg-primary/10'
            )}
          >
            <Icon className={cn('h-5 w-5', colorClass || 'text-primary')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewCards({ data, isLoading }: { data?: MetricsOverview; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const trendDirection =
    data.trend === 'improving' ? 'up' : data.trend === 'degrading' ? 'down' : 'stable';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Overall Accuracy"
        value={data.overallAccuracy}
        icon={Target}
        trend={trendDirection}
        trendValue={data.trendPercentage}
        description="Correct predictions"
        colorClass={data.overallAccuracy >= 80 ? 'text-green-500' : data.overallAccuracy >= 60 ? 'text-yellow-500' : 'text-red-500'}
      />
      <MetricCard
        title="Precision"
        value={data.precision}
        icon={CheckCircle2}
        description="True positives vs all positives"
        colorClass={data.precision >= 80 ? 'text-green-500' : data.precision >= 60 ? 'text-yellow-500' : 'text-red-500'}
      />
      <MetricCard
        title="Recall"
        value={data.recall}
        icon={Brain}
        description="True positives vs actual positives"
        colorClass={data.recall >= 80 ? 'text-green-500' : data.recall >= 60 ? 'text-yellow-500' : 'text-red-500'}
      />
      <MetricCard
        title="F1 Score"
        value={data.f1Score}
        icon={Sparkles}
        description="Balance of precision & recall"
        colorClass={data.f1Score >= 80 ? 'text-green-500' : data.f1Score >= 60 ? 'text-yellow-500' : 'text-red-500'}
      />
    </div>
  );
}

function TrendChart({ data, isLoading }: { data?: TrendData[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Accuracy Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Accuracy Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No trend data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Accuracy Trends
        </CardTitle>
        <CardDescription>AI performance metrics over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <defs>
              <linearGradient id="accuracyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.65 0.18 145)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="oklch(0.65 0.18 145)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => v.slice(5)} // MM-DD format
              className="text-muted-foreground"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.15 0.01 250)',
                border: '1px solid oklch(0.25 0.015 250)',
                borderRadius: '10px',
                fontSize: 12,
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="accuracy"
              name="Accuracy"
              stroke="oklch(0.65 0.18 145)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="precision"
              name="Precision"
              stroke="oklch(0.65 0.18 195)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="recall"
              name="Recall"
              stroke="oklch(0.65 0.18 280)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="f1Score"
              name="F1 Score"
              stroke="oklch(0.65 0.18 45)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function FalsePositiveChart({
  data,
  isLoading,
}: {
  data?: FalsePositiveData[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            False Positive Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            False Positive Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No false positive data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          False Positive Rate
        </CardTitle>
        <CardDescription>Track false positive trends over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fpGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.60 0.22 25)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="oklch(0.60 0.22 25)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => v.slice(5)}
              className="text-muted-foreground"
            />
            <YAxis
              domain={[0, 'auto']}
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.15 0.01 250)',
                border: '1px solid oklch(0.25 0.015 250)',
                borderRadius: '8px',
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value}%`, 'False Positive Rate']}
            />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="oklch(0.60 0.22 25)"
              fill="url(#fpGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ExecutionSuccessChart({
  data,
  isLoading,
}: {
  data?: ExecutionSuccessData[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Execution Success by Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Execution Success by Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No execution data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Execution Success by Type
        </CardTitle>
        <CardDescription>Success rate for different task types</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
            />
            <YAxis
              type="category"
              dataKey="taskType"
              tick={{ fontSize: 10 }}
              width={80}
              className="text-muted-foreground"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.15 0.01 250)',
                border: '1px solid oklch(0.25 0.015 250)',
                borderRadius: '8px',
                fontSize: 12,
              }}
              formatter={(value: number, name: string, props: any) => [
                `${value}% (${props.payload.successful}/${props.payload.total})`,
                'Success Rate',
              ]}
            />
            <Bar
              dataKey="successRate"
              fill="oklch(0.65 0.18 145)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function RecentFeedbackList({
  data,
  isLoading,
}: {
  data?: FeedbackData[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            No feedback recorded yet
          </div>
        </CardContent>
      </Card>
    );
  }

  const feedbackIcons: Record<string, typeof ThumbsUp> = {
    thumbs_up: ThumbsUp,
    thumbs_down: ThumbsDown,
    helpful: CheckCircle2,
    not_helpful: XCircle,
    false_positive: AlertTriangle,
    incorrect: XCircle,
  };

  const feedbackColors: Record<string, string> = {
    thumbs_up: 'text-green-500 bg-green-500/10',
    thumbs_down: 'text-red-500 bg-red-500/10',
    helpful: 'text-green-500 bg-green-500/10',
    not_helpful: 'text-red-500 bg-red-500/10',
    false_positive: 'text-orange-500 bg-orange-500/10',
    incorrect: 'text-red-500 bg-red-500/10',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Feedback</CardTitle>
        <CardDescription>User feedback on AI outputs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {data.map((feedback) => {
            const Icon = feedbackIcons[feedback.feedbackType] || ThumbsUp;
            const colorClass = feedbackColors[feedback.feedbackType] || 'text-muted-foreground bg-muted';

            return (
              <div
                key={feedback.id}
                className="flex items-start gap-3 p-3 border rounded-lg"
              >
                <div className={cn('p-1.5 rounded-md', colorClass)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {feedback.entityType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(feedback.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {feedback.comment && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {feedback.comment}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function AIMetricsDashboard({ dateRange }: AIMetricsDashboardProps) {
  const [activeSection, setActiveSection] = useState<'overview' | 'breakdown' | 'refinement'>('overview');

  // Fetch overview metrics
  const { data: overview, isLoading: overviewLoading } = useQuery<MetricsOverview>({
    queryKey: ['ai-metrics', 'overview', dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange?.endDate) params.set('endDate', dateRange.endDate);
      const res = await fetch(`/api/ai-metrics/overview?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  // Fetch trends
  const { data: trends, isLoading: trendsLoading } = useQuery<TrendData[]>({
    queryKey: ['ai-metrics', 'trends', dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange?.endDate) params.set('endDate', dateRange.endDate);
      params.set('groupBy', 'day');
      const res = await fetch(`/api/ai-metrics/trends?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  // Fetch false positives
  const { data: falsePositives, isLoading: fpLoading } = useQuery<FalsePositiveData[]>({
    queryKey: ['ai-metrics', 'false-positives', dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange?.endDate) params.set('endDate', dateRange.endDate);
      const res = await fetch(`/api/ai-metrics/false-positives?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  // Fetch execution success
  const { data: executionSuccess, isLoading: execLoading } = useQuery<ExecutionSuccessData[]>({
    queryKey: ['ai-metrics', 'execution-success', dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange?.endDate) params.set('endDate', dateRange.endDate);
      const res = await fetch(`/api/ai-metrics/execution-success?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  // Fetch recent feedback
  const { data: feedback, isLoading: feedbackLoading } = useQuery<FeedbackData[]>({
    queryKey: ['ai-metrics', 'feedback'],
    queryFn: async () => {
      const res = await fetch('/api/ai-metrics/feedback?limit=10', {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
  });

  return (
    <div className="space-y-6">
      {/* Section Toggle */}
      <div className="flex gap-2 p-1 bg-muted/50 rounded-lg w-fit">
        <button
          onClick={() => setActiveSection('overview')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeSection === 'overview'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveSection('breakdown')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeSection === 'breakdown'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Breakdown
        </button>
        <button
          onClick={() => setActiveSection('refinement')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeSection === 'refinement'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Prompt Refinement
        </button>
      </div>

      {activeSection === 'overview' && (
        <>
          {/* Metric Cards */}
          <OverviewCards data={overview} isLoading={overviewLoading} />

          {/* Additional Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">False Positive Rate</p>
                    <p className="text-2xl font-bold text-orange-500">
                      {overview?.falsePositiveRate || 0}%
                    </p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-orange-500/20" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Execution Success</p>
                    <p className="text-2xl font-bold text-green-500">
                      {overview?.executionSuccessRate || 0}%
                    </p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500/20" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Positive Feedback</p>
                    <p className="text-2xl font-bold text-blue-500">
                      {overview?.positiveFeedbackRate || 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {overview?.totalFeedback || 0} total
                    </p>
                  </div>
                  <ThumbsUp className="h-8 w-8 text-blue-500/20" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trend Chart */}
          <TrendChart data={trends} isLoading={trendsLoading} />

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FalsePositiveChart data={falsePositives} isLoading={fpLoading} />
            <ExecutionSuccessChart data={executionSuccess} isLoading={execLoading} />
          </div>

          {/* Recent Feedback */}
          <RecentFeedbackList data={feedback} isLoading={feedbackLoading} />
        </>
      )}

      {activeSection === 'breakdown' && (
        <AccuracyBreakdown dateRange={dateRange} />
      )}

      {activeSection === 'refinement' && (
        <PromptRefinementPanel />
      )}
    </div>
  );
}

export default AIMetricsDashboard;
