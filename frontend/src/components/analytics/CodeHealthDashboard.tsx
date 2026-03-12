/**
 * Code Health Dashboard Component
 *
 * Displays comprehensive code health metrics including:
 * - Overall health score gauge
 * - Individual metric scores
 * - Trend graphs (improving/degrading)
 * - Hotspot identification
 * - Coverage tracking
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Code2,
  Copy,
  FileCode,
  Flame,
  GitCommit,
  Layers,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// Types
interface HealthScores {
  overall: number;
  complexity: number;
  duplication: number;
  coverage: number;
  maintainability: number;
  security: number;
  dependencies: number;
}

interface TrendData {
  date: string;
  value: number;
  change: number;
}

interface HotspotData {
  id?: string;
  filePath: string;
  changeCount: number;
  additionCount: number;
  deletionCount: number;
  authorCount: number;
  complexity: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface HealthSummary {
  totalFiles: number;
  totalLines: number;
  avgComplexity: number;
  duplicationPct: number;
  testCoveragePct: number | null;
  technicalDebtHours: number;
  codeSmellCount: number;
}

interface HealthDashboardData {
  scores: HealthScores;
  trends: {
    overall: TrendData[];
    complexity: TrendData[];
    coverage: TrendData[];
    duplication: TrendData[];
  };
  hotspots: HotspotData[];
  summary: HealthSummary;
  comparison: {
    lastWeek: HealthScores | null;
    lastMonth: HealthScores | null;
  };
}

interface CodeHealthDashboardProps {
  repositoryId?: string;
  projectId?: string;
  onRefresh?: () => void;
}

// API functions
const fetchHealthDashboard = async (
  repositoryId?: string,
  projectId?: string
): Promise<HealthDashboardData | null> => {
  const params = new URLSearchParams();
  if (repositoryId) params.set('repositoryId', repositoryId);
  if (projectId) params.set('projectId', projectId);

  const response = await fetch(`/api/code-health/dashboard?${params.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch health dashboard');
  }

  const result = await response.json();
  return result.data;
};

// Helper functions
function getScoreColor(score: number): string {
  if (score >= 80) return 'oklch(0.65 0.18 145)'; // Green
  if (score >= 60) return 'oklch(0.70 0.15 85)'; // Yellow
  if (score >= 40) return 'oklch(0.65 0.18 45)'; // Orange
  return 'oklch(0.60 0.22 25)'; // Red
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Needs Work';
  return 'Critical';
}

function getRiskLevelColor(level: string): string {
  switch (level) {
    case 'critical':
      return 'bg-red-500/20 text-red-500 border-red-500/30';
    case 'high':
      return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
    default:
      return 'bg-green-500/20 text-green-500 border-green-500/30';
  }
}

function getTrendIndicator(current: number, previous: number | null): {
  direction: 'up' | 'down' | 'stable';
  change: number;
} {
  if (!previous) return { direction: 'stable', change: 0 };
  const change = current - previous;
  if (change > 2) return { direction: 'up', change };
  if (change < -2) return { direction: 'down', change };
  return { direction: 'stable', change };
}

// Score gauge component
function ScoreGauge({
  score,
  label,
  size = 'large',
}: {
  score: number;
  label: string;
  size?: 'small' | 'large';
}) {
  const color = getScoreColor(score);
  const isLarge = size === 'large';

  const gaugeData = [
    { name: 'score', value: score, fill: color },
    { name: 'remaining', value: 100 - score, fill: 'oklch(0.2 0.01 250)' },
  ];

  return (
    <div className={cn('flex flex-col items-center', isLarge ? 'gap-2' : 'gap-1')}>
      <div className={cn('relative', isLarge ? 'w-32 h-32' : 'w-20 h-20')}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius={isLarge ? '70%' : '65%'}
            outerRadius="100%"
            data={gaugeData}
            startAngle={180}
            endAngle={0}
          >
            <RadialBar dataKey="value" cornerRadius={10} background />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'font-bold',
              isLarge ? 'text-3xl' : 'text-xl'
            )}
            style={{ color }}
          >
            {score}
          </span>
        </div>
      </div>
      <span
        className={cn(
          'font-medium text-muted-foreground',
          isLarge ? 'text-sm' : 'text-xs'
        )}
      >
        {label}
      </span>
    </div>
  );
}

// Metric card component
function MetricCard({
  icon: Icon,
  label,
  score,
  trend,
  description,
}: {
  icon: React.ElementType;
  label: string;
  score: number;
  trend?: { direction: 'up' | 'down' | 'stable'; change: number };
  description?: string;
}) {
  const color = getScoreColor(score);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div
        className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold" style={{ color }}>
              {score}
            </span>
            {trend && trend.direction !== 'stable' && (
              <span
                className={cn(
                  'text-xs flex items-center',
                  trend.direction === 'up' ? 'text-green-500' : 'text-red-500'
                )}
              >
                {trend.direction === 'up' ? (
                  <ArrowUp size={12} />
                ) : (
                  <ArrowDown size={12} />
                )}
                {Math.abs(trend.change).toFixed(0)}
              </span>
            )}
          </div>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
        {/* Mini progress bar */}
        <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${score}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

// Hotspot item component
function HotspotItem({ hotspot }: { hotspot: HotspotData }) {
  const fileName = hotspot.filePath.split('/').pop() || hotspot.filePath;
  const dirPath = hotspot.filePath.slice(0, -fileName.length - 1);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-transparent hover:border-muted">
      <div
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
          hotspot.riskLevel === 'critical'
            ? 'bg-red-500/20'
            : hotspot.riskLevel === 'high'
            ? 'bg-orange-500/20'
            : hotspot.riskLevel === 'medium'
            ? 'bg-yellow-500/20'
            : 'bg-green-500/20'
        )}
      >
        <Flame
          size={16}
          className={cn(
            hotspot.riskLevel === 'critical'
              ? 'text-red-500'
              : hotspot.riskLevel === 'high'
              ? 'text-orange-500'
              : hotspot.riskLevel === 'medium'
              ? 'text-yellow-500'
              : 'text-green-500'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate" title={hotspot.filePath}>
            {fileName}
          </span>
          <Badge variant="outline" className={cn('text-xs', getRiskLevelColor(hotspot.riskLevel))}>
            {hotspot.riskLevel}
          </Badge>
        </div>
        {dirPath && (
          <p className="text-xs text-muted-foreground truncate" title={dirPath}>
            {dirPath}
          </p>
        )}
        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <GitCommit size={12} />
            {hotspot.changeCount} changes
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} />
            {hotspot.authorCount} authors
          </span>
          <span className="flex items-center gap-1">
            <Activity size={12} />
            Risk: {hotspot.riskScore}
          </span>
        </div>
      </div>
    </div>
  );
}

// Main component
export function CodeHealthDashboard({
  repositoryId,
  projectId,
  onRefresh,
}: CodeHealthDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'hotspots'>('overview');
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['code-health', repositoryId, projectId],
    queryFn: () => fetchHealthDashboard(repositoryId, projectId),
    enabled: !!(repositoryId || projectId),
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  // Mutation to trigger health analysis
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!repositoryId) throw new Error('No repository selected');
      const response = await fetch('/api/code-health/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ repositoryId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Analysis failed');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['code-health', repositoryId, projectId] });
    },
  });

  const handleRefresh = () => {
    refetch();
    onRefresh?.();
  };

  const handleAnalyzeNow = () => {
    analyzeMutation.mutate();
  };

  // Calculate week-over-week comparison
  const weekComparison = useMemo(() => {
    if (!data?.comparison.lastWeek) return null;
    return getTrendIndicator(data.scores.overall, data.comparison.lastWeek.overall);
  }, [data]);

  if (isLoading) {
    return <CodeHealthDashboardSkeleton />;
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Code2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="mb-4">Select a repository or project to view code health metrics</p>
        </CardContent>
      </Card>
    );
  }

  // Check if we have actual data or just empty defaults
  const hasRealData = data.scores.overall > 0 || data.summary.totalFiles > 0 || data.hotspots.length > 0;

  if (!hasRealData && repositoryId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Health Data Available</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Code health metrics will be generated automatically after your next scan,
            or you can analyze now to generate metrics immediately.
          </p>
          <button
            onClick={handleAnalyzeNow}
            disabled={analyzeMutation.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {analyzeMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" />
                Analyze Now
              </>
            )}
          </button>
          {analyzeMutation.isError && (
            <p className="text-sm text-red-500 mt-3">
              {analyzeMutation.error instanceof Error ? analyzeMutation.error.message : 'Analysis failed'}
            </p>
          )}
          {analyzeMutation.isSuccess && (
            <p className="text-sm text-green-500 mt-3">Analysis complete! Refreshing...</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Only show metrics that have real data sources
  // - Duplication: Based on actual line-by-line analysis
  // - Dependencies: Based on actual dependency alerts from database
  // Other metrics (complexity, coverage, security, maintainability) are estimates and have been removed
  const metricCards = [
    {
      icon: Copy,
      label: 'Duplication',
      score: data.scores.duplication,
      trend: getTrendIndicator(
        data.scores.duplication,
        data.comparison.lastWeek?.duplication ?? null
      ),
      description: `${data.summary.duplicationPct.toFixed(1)}% duplicated`,
    },
    {
      icon: Layers,
      label: 'Dependencies',
      score: data.scores.dependencies,
      trend: getTrendIndicator(
        data.scores.dependencies,
        data.comparison.lastWeek?.dependencies ?? null
      ),
      description: getScoreLabel(data.scores.dependencies),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Code Health</h2>
          <p className="text-muted-foreground">
            Monitor code quality, identify risks, and track improvements
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 transition-colors text-sm"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Main Score Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
            {/* Overall Score Gauge */}
            <div className="flex flex-col items-center">
              <ScoreGauge score={data.scores.overall} label="Overall Health" />
              <Badge
                className="mt-2"
                variant="outline"
                style={{
                  borderColor: getScoreColor(data.scores.overall),
                  color: getScoreColor(data.scores.overall),
                }}
              >
                {getScoreLabel(data.scores.overall)}
              </Badge>
              {weekComparison && weekComparison.direction !== 'stable' && (
                <div
                  className={cn(
                    'flex items-center gap-1 mt-2 text-sm',
                    weekComparison.direction === 'up'
                      ? 'text-green-500'
                      : 'text-red-500'
                  )}
                >
                  {weekComparison.direction === 'up' ? (
                    <TrendingUp size={16} />
                  ) : (
                    <TrendingDown size={16} />
                  )}
                  <span>
                    {weekComparison.direction === 'up' ? '+' : ''}
                    {weekComparison.change.toFixed(0)} vs last week
                  </span>
                </div>
              )}
            </div>

            {/* Summary Stats - Only showing real metrics */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <FileCode className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.summary.totalFiles.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Files</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <Code2 className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.summary.totalLines.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Lines of Code</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <Flame className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{data.hotspots.length}</p>
                <p className="text-xs text-muted-foreground">Hotspots</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs - Simplified to only show real data */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="overview">Metrics</TabsTrigger>
          <TabsTrigger value="hotspots">
            Hotspots
            {data.hotspots.filter((h) => h.riskLevel === 'critical' || h.riskLevel === 'high')
              .length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1">
                {
                  data.hotspots.filter(
                    (h) => h.riskLevel === 'critical' || h.riskLevel === 'high'
                  ).length
                }
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Metrics Tab */}
        <TabsContent value="overview" className="mt-6">
          {metricCards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No metrics available</p>
              <p className="text-sm mt-1">Run a code analysis to generate metrics</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {metricCards.map((card) => (
                <MetricCard key={card.label} {...card} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Hotspots Tab */}
        <TabsContent value="hotspots" className="mt-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                High-Churn Files
                <span className="text-muted-foreground font-normal text-sm ml-2">
                  Files with high change frequency that may need attention
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.hotspots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Flame className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No hotspots detected</p>
                  <p className="text-sm">Files with high churn will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.hotspots.map((hotspot, index) => (
                    <HotspotItem key={hotspot.id || index} hotspot={hotspot} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Risk Distribution */}
          {data.hotspots.length > 0 && (
            <Card className="mt-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Risk Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          level: 'Critical',
                          count: data.hotspots.filter((h) => h.riskLevel === 'critical').length,
                          fill: 'oklch(0.60 0.22 25)',
                        },
                        {
                          level: 'High',
                          count: data.hotspots.filter((h) => h.riskLevel === 'high').length,
                          fill: 'oklch(0.65 0.18 45)',
                        },
                        {
                          level: 'Medium',
                          count: data.hotspots.filter((h) => h.riskLevel === 'medium').length,
                          fill: 'oklch(0.70 0.15 85)',
                        },
                        {
                          level: 'Low',
                          count: data.hotspots.filter((h) => h.riskLevel === 'low').length,
                          fill: 'oklch(0.65 0.18 145)',
                        },
                      ]}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 250)" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="level" type="category" tick={{ fontSize: 11 }} width={60} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'oklch(0.15 0.01 250)',
                          border: '1px solid oklch(0.25 0.015 250)',
                          borderRadius: '8px',
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {[0, 1, 2, 3].map((index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              [
                                'oklch(0.60 0.22 25)',
                                'oklch(0.65 0.18 45)',
                                'oklch(0.70 0.15 85)',
                                'oklch(0.65 0.18 145)',
                              ][index]
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Skeleton loading state
function CodeHealthDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
            <Skeleton className="w-32 h-32 rounded-full" />
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-muted/30">
                  <Skeleton className="h-5 w-5 mx-auto mb-2" />
                  <Skeleton className="h-8 w-16 mx-auto mb-1" />
                  <Skeleton className="h-3 w-20 mx-auto" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Skeleton className="h-10 w-80" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
