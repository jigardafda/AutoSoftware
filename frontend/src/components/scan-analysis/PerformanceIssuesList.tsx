/**
 * Performance Issues List Component
 * Displays detected performance problems with severity levels
 */

import { useState } from 'react';
import {
  Zap,
  FileCode,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Database,
  MemoryStick,
  Cpu,
  Package,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PerformanceIssue } from './types';

interface PerformanceIssuesListProps {
  issues: PerformanceIssue[];
  className?: string;
}

const issueTypeConfig: Record<
  string,
  { label: string; icon: React.ElementType; description: string }
> = {
  n_plus_one: {
    label: 'N+1 Query',
    icon: Database,
    description: 'Multiple database queries in a loop',
  },
  memory_leak: {
    label: 'Memory Leak',
    icon: MemoryStick,
    description: 'Potential memory leak detected',
  },
  inefficient_algorithm: {
    label: 'Inefficient Algorithm',
    icon: Cpu,
    description: 'Algorithm with suboptimal time complexity',
  },
  large_bundle: {
    label: 'Large Bundle',
    icon: Package,
    description: 'Large bundle size affecting load time',
  },
  blocking_operation: {
    label: 'Blocking Operation',
    icon: Clock,
    description: 'Synchronous operation blocking main thread',
  },
  other: {
    label: 'Other',
    icon: HelpCircle,
    description: 'Other performance concern',
  },
};

const severityConfig: Record<string, { color: string; priority: number }> = {
  critical: {
    color: 'bg-red-500/15 text-red-500 border-red-500/20',
    priority: 4,
  },
  major: {
    color: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
    priority: 3,
  },
  minor: {
    color: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20',
    priority: 2,
  },
  nitpick: {
    color: 'bg-muted text-muted-foreground',
    priority: 1,
  },
};

function PerformanceIssueItem({ issue }: { issue: PerformanceIssue }) {
  const [expanded, setExpanded] = useState(false);
  const typeConfig = issueTypeConfig[issue.type] || issueTypeConfig.other;
  const severity = severityConfig[issue.severityLevel] || severityConfig.minor;
  const Icon = typeConfig.icon;
  const fileName = issue.filePath.split('/').pop() || issue.filePath;

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden',
        issue.severityLevel === 'critical' && 'border-red-500/30'
      )}
    >
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        )}

        <Icon
          className={cn(
            'h-4 w-4 shrink-0 mt-0.5',
            issue.severityLevel === 'critical'
              ? 'text-red-500'
              : issue.severityLevel === 'major'
              ? 'text-orange-500'
              : 'text-yellow-500'
          )}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{typeConfig.label}</span>
            <Badge variant="outline" className={cn('text-xs', severity.color)}>
              {issue.severityLevel}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {issue.description}
          </p>
        </div>

        <div className="text-xs text-muted-foreground shrink-0">
          {issue.confidenceScore}/10
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <FileCode className="h-3 w-3 text-muted-foreground" />
            <code className="bg-background px-2 py-0.5 rounded border">{issue.filePath}</code>
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
              <AlertTriangle className="h-3 w-3" />
              Description
            </span>
            <p className="text-sm text-foreground">{issue.description}</p>
          </div>

          {issue.codeSnippet && (
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-1 block">
                Code Snippet
              </span>
              <pre className="text-xs bg-background p-2 rounded border overflow-x-auto max-h-[150px]">
                <code>{issue.codeSnippet}</code>
              </pre>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs pt-1 border-t">
            <span className="text-muted-foreground">
              Type: <span className="text-foreground">{typeConfig.description}</span>
            </span>
            <span className="text-muted-foreground">
              Confidence: <span className="font-medium">{issue.confidenceScore}/10</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function PerformanceIssuesList({ issues, className }: PerformanceIssuesListProps) {
  const [filter, setFilter] = useState<'all' | 'critical' | 'major'>('all');

  if (!issues || issues.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Performance Issues
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="h-10 w-10 rounded-full bg-green-500/15 flex items-center justify-center mb-2">
              <Zap className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground">No performance issues detected</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Your code is running efficiently!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedIssues = [...issues].sort(
    (a, b) =>
      (severityConfig[b.severityLevel]?.priority || 0) -
      (severityConfig[a.severityLevel]?.priority || 0)
  );

  const filteredIssues = sortedIssues.filter((i) => {
    if (filter === 'all') return true;
    if (filter === 'critical') return i.severityLevel === 'critical';
    if (filter === 'major') return ['critical', 'major'].includes(i.severityLevel);
    return true;
  });

  const criticalCount = issues.filter((i) => i.severityLevel === 'critical').length;
  const majorCount = issues.filter((i) => i.severityLevel === 'major').length;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" />
              Performance Issues
              <Badge
                variant="outline"
                className="bg-orange-500/15 text-orange-500 border-orange-500/20"
              >
                {issues.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {criticalCount > 0 && (
                <span className="text-red-500">{criticalCount} critical</span>
              )}
              {criticalCount > 0 && majorCount > 0 && ' • '}
              {majorCount > 0 && <span className="text-orange-500">{majorCount} major</span>}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {(['all', 'major', 'critical'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md transition-colors',
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {filteredIssues.map((issue, i) => (
          <PerformanceIssueItem key={i} issue={issue} />
        ))}
      </CardContent>
    </Card>
  );
}
