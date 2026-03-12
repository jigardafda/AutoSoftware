/**
 * Predictive Insights Component
 *
 * Displays predictive analysis for code changes including:
 * - Breaking change warnings ("This will break when...")
 * - Regression risk scoring
 * - Technical debt trajectory
 * - Growing complexity alerts
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Activity,
  Shield,
  FileCode,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Lightbulb,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface PredictiveInsightsProps {
  repositoryId?: string;
  projectId?: string;
  taskId?: string;
}

interface BreakingChangeWarning {
  id: string;
  type: 'api_change' | 'dependency_conflict' | 'behavior_change' | 'schema_change' | 'config_change';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedFiles: string[];
  affectedConsumers: string[];
  suggestedActions: string[];
  confidence: number;
}

interface RegressionRiskScore {
  taskId: string;
  overallScore: number;
  factors: {
    name: string;
    score: number;
    weight: number;
    description: string;
  }[];
  recommendation: string;
  historicalData: {
    similarChanges: number;
    regressionRate: number;
    avgTimeToDetect: number;
  };
}

interface TechnicalDebtMetric {
  date: string;
  score: number;
  components: {
    codeComplexity: number;
    duplications: number;
    outdatedDependencies: number;
    missingTests: number;
    documentationGaps: number;
  };
}

interface TechnicalDebtForecast {
  currentScore: number;
  projectedScore30Days: number;
  projectedScore90Days: number;
  trend: 'improving' | 'stable' | 'degrading' | 'critical';
  trajectory: TechnicalDebtMetric[];
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    action: string;
    impact: number;
  }[];
}

interface ComplexityAlert {
  id: string;
  type: 'file' | 'module' | 'function';
  path: string;
  name: string;
  currentComplexity: number;
  previousComplexity: number;
  growthRate: number;
  trend: 'stable' | 'growing' | 'rapid_growth' | 'critical';
  metrics: {
    cyclomaticComplexity: number;
    linesOfCode: number;
    dependencies: number;
    changeFrequency: number;
  };
  recommendations: string[];
}

interface PredictiveInsightsSummary {
  breakingChangeWarnings: BreakingChangeWarning[];
  regressionRiskScores: RegressionRiskScore[];
  technicalDebtForecast: TechnicalDebtForecast;
  complexityAlerts: ComplexityAlert[];
  overallHealthScore: number;
  trends: {
    codeQuality: 'improving' | 'stable' | 'degrading';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    debtTrajectory: 'improving' | 'stable' | 'worsening';
  };
}

const severityColors = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const trendColors = {
  stable: 'text-muted-foreground',
  growing: 'text-yellow-600 dark:text-yellow-400',
  rapid_growth: 'text-orange-600 dark:text-orange-400',
  critical: 'text-red-600 dark:text-red-400',
};


function BreakingChangeCard({
  warning,
  expanded,
  onToggle,
}: {
  warning: BreakingChangeWarning;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'border rounded-lg p-4 transition-colors',
        warning.severity === 'critical' && 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-900/10',
        warning.severity === 'high' && 'border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-900/10'
      )}
    >
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={cn(
              'h-5 w-5 mt-0.5',
              warning.severity === 'critical' && 'text-red-500',
              warning.severity === 'high' && 'text-orange-500',
              warning.severity === 'medium' && 'text-yellow-500',
              warning.severity === 'low' && 'text-blue-500'
            )}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{warning.title}</span>
              <Badge className={severityColors[warning.severity]} variant="outline">
                {warning.severity}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {warning.description}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {expanded && (
        <div className="mt-4 pl-8 space-y-4">
          {warning.affectedFiles.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Affected Files</h4>
              <div className="flex flex-wrap gap-1">
                {warning.affectedFiles.map((file) => (
                  <code
                    key={file}
                    className="text-xs bg-muted px-2 py-1 rounded"
                  >
                    {file}
                  </code>
                ))}
              </div>
            </div>
          )}

          {warning.suggestedActions.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Suggested Actions
              </h4>
              <ul className="space-y-1">
                {warning.suggestedActions.map((action, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground flex items-start gap-2"
                  >
                    <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Confidence: {Math.round(warning.confidence * 100)}%
          </div>
        </div>
      )}
    </div>
  );
}


function ComplexityAlertItem({ alert }: { alert: ComplexityAlert }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        'p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/30',
        alert.trend === 'critical' && 'border-red-200 dark:border-red-900/50',
        alert.trend === 'rapid_growth' && 'border-orange-200 dark:border-orange-900/50'
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className={cn('h-4 w-4', trendColors[alert.trend])} />
          <span className="text-sm font-medium truncate max-w-[200px]">
            {alert.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-sm font-mono',
              alert.growthRate > 0 ? 'text-orange-500' : 'text-green-500'
            )}
          >
            {alert.growthRate > 0 ? '+' : ''}
            {alert.growthRate.toFixed(1)}%
          </span>
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              alert.trend === 'critical' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              alert.trend === 'rapid_growth' && 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
              alert.trend === 'growing' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
            )}
          >
            {alert.trend.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-3">
          <div className="text-xs text-muted-foreground">{alert.path}</div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Cyclomatic:</span>{' '}
              <span className="font-medium">{alert.metrics.cyclomaticComplexity}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Dependencies:</span>{' '}
              <span className="font-medium">{alert.metrics.dependencies}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Change Freq:</span>{' '}
              <span className="font-medium">{alert.metrics.changeFrequency}x</span>
            </div>
            <div>
              <span className="text-muted-foreground">LOC Delta:</span>{' '}
              <span className="font-medium">{alert.metrics.linesOfCode}</span>
            </div>
          </div>

          {alert.recommendations.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">Recommendation:</span>{' '}
              {alert.recommendations[0]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PredictiveInsights({
  repositoryId,
  projectId,
  taskId,
}: PredictiveInsightsProps) {
  const [expandedWarning, setExpandedWarning] = useState<string | null>(null);

  const { data: insights, isLoading } = useQuery<PredictiveInsightsSummary>({
    queryKey: ['predictions', 'insights', repositoryId, projectId, taskId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (repositoryId) params.set('repositoryId', repositoryId);
      if (projectId) params.set('projectId', projectId);
      if (taskId) params.set('taskId', taskId);
      const res = await fetch(`/api/predictions/insights?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch');
      return data.data;
    },
    enabled: !!(repositoryId || projectId),
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Predictive Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-32 rounded-full mx-auto" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!insights) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Predictive Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-2">
              Select a repository or project to view predictive insights.
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Predictive analysis requires executed tasks with code changes to provide
              breaking change warnings and complexity alerts.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Check if we have actual data
  const hasRealData = insights.breakingChangeWarnings.length > 0 ||
    insights.complexityAlerts.length > 0 ||
    insights.regressionRiskScores.length > 0;

  const criticalWarnings = insights.breakingChangeWarnings.filter(
    (w) => w.severity === 'critical' || w.severity === 'high'
  );
  const criticalAlerts = insights.complexityAlerts.filter(
    (a) => a.trend === 'critical' || a.trend === 'rapid_growth'
  );

  return (
    <div className="space-y-6">
      {/* Overview - Simplified to show real data only */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Predictive Insights Overview
          </CardTitle>
          <CardDescription>
            Analysis based on actual code changes and file history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-orange-500">
                  {criticalWarnings.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  Breaking Change Risks
                </div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-500">
                  {criticalAlerts.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  Complexity Alerts
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Real data sections only */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breaking Change Warnings - Based on actual file changes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Breaking Change Warnings
            </CardTitle>
            <CardDescription>
              Detected from actual file changes in tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {insights.breakingChangeWarnings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No breaking change warnings detected
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {insights.breakingChangeWarnings.map((warning) => (
                  <BreakingChangeCard
                    key={warning.id}
                    warning={warning}
                    expanded={expandedWarning === warning.id}
                    onToggle={() =>
                      setExpandedWarning(
                        expandedWarning === warning.id ? null : warning.id
                      )
                    }
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Complexity Growth Alerts - Based on actual code change history */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-orange-500" />
              Growing Complexity Alerts
            </CardTitle>
            <CardDescription>
              Based on actual code change history
            </CardDescription>
          </CardHeader>
          <CardContent>
            {insights.complexityAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No complexity concerns detected
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {insights.complexityAlerts.slice(0, 10).map((alert) => (
                  <ComplexityAlertItem key={alert.id} alert={alert} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default PredictiveInsights;
