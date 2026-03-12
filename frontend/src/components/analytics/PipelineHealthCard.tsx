import { Clock, AlertCircle, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface PipelineHealth {
  pending: number;
  planning: number;
  inProgress: number;
  completed: number;
  failed: number;
  avgTimeToComplete: number;
  avgPlanningRounds: number;
}

interface PipelineHealthCardProps {
  data?: PipelineHealth;
}

interface FunnelStageProps {
  label: string;
  value: number;
  percentage: number;
  color: string;
  icon: React.ElementType;
  isLast?: boolean;
}

function FunnelStage({ label, value, percentage, color, icon: Icon, isLast }: FunnelStageProps) {
  return (
    <div className="relative">
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">{label}</span>
            <span className="text-sm font-semibold">{value}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </div>
      </div>
      {!isLast && (
        <div className="absolute left-5 top-12 h-4 w-px bg-border" />
      )}
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function PipelineHealthCard({ data }: PipelineHealthCardProps) {
  if (!data) {
    return (
      <Card>
        <CardHeader className="p-4 pb-0">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="p-4 pt-4">
          <div className="space-y-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-24 mb-2" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.pending + data.planning + data.inProgress + data.completed + data.failed;

  const stages: FunnelStageProps[] = [
    {
      label: 'Pending',
      value: data.pending,
      percentage: total > 0 ? (data.pending / total) * 100 : 0,
      color: 'oklch(0.55 0.01 250)',
      icon: Clock,
    },
    {
      label: 'Planning',
      value: data.planning,
      percentage: total > 0 ? (data.planning / total) * 100 : 0,
      color: 'oklch(0.70 0.15 85)',
      icon: AlertCircle,
    },
    {
      label: 'In Progress',
      value: data.inProgress,
      percentage: total > 0 ? (data.inProgress / total) * 100 : 0,
      color: 'oklch(0.65 0.18 195)',
      icon: Loader2,
    },
    {
      label: 'Completed',
      value: data.completed,
      percentage: total > 0 ? (data.completed / total) * 100 : 0,
      color: 'oklch(0.65 0.18 145)',
      icon: CheckCircle,
    },
    {
      label: 'Failed',
      value: data.failed,
      percentage: total > 0 ? (data.failed / total) * 100 : 0,
      color: 'oklch(0.60 0.22 25)',
      icon: XCircle,
      isLast: true,
    },
  ];

  return (
    <Card>
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm">Pipeline Health</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-4">
        <div className="space-y-5">
          {stages.map((stage, index) => (
            <FunnelStage key={stage.label} {...stage} isLast={index === stages.length - 1} />
          ))}
        </div>

        {/* Metrics */}
        <div className="mt-6 pt-4 border-t border-border/50 grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-2xl font-semibold tracking-tight">
              {formatDuration(data.avgTimeToComplete)}
            </p>
            <p className="text-xs text-muted-foreground">Avg. Time to Complete</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold tracking-tight">
              {data.avgPlanningRounds.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">Avg. Planning Rounds</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
