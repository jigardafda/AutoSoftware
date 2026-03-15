import { Clock, AlertCircle, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function PipelineHealthCard({ data }: PipelineHealthCardProps) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6">
        <Skeleton className="h-5 w-32 mb-5" />
        <div className="space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const total = data.pending + data.planning + data.inProgress + data.completed + data.failed;

  const stages = [
    { label: 'Pending', value: data.pending, color: '#64748b', icon: Clock },
    { label: 'Planning', value: data.planning, color: '#f59e0b', icon: AlertCircle },
    { label: 'In Progress', value: data.inProgress, color: '#06b6d4', icon: Loader2 },
    { label: 'Completed', value: data.completed, color: '#10b981', icon: CheckCircle },
    { label: 'Failed', value: data.failed, color: '#ef4444', icon: XCircle },
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="px-6 pt-5 pb-2">
        <h3 className="text-sm font-semibold">Pipeline Health</h3>
      </div>
      <div className="px-6 pb-5">
        <div className="space-y-4">
          {stages.map((stage, i) => {
            const Icon = stage.icon;
            const pct = total > 0 ? (stage.value / total) * 100 : 0;
            return (
              <div key={stage.label} className="relative">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 hover:scale-105"
                    style={{ backgroundColor: `${stage.color}15` }}
                  >
                    <Icon size={17} style={{ color: stage.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium">{stage.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                        <span className="text-sm font-bold tabular-nums">{stage.value}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          backgroundColor: stage.color,
                          boxShadow: pct > 0 ? `0 0 8px ${stage.color}40` : 'none',
                        }}
                      />
                    </div>
                  </div>
                </div>
                {/* Connector line */}
                {i < stages.length - 1 && (
                  <div className="absolute left-5 top-[44px] h-3 w-px bg-border/60" />
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom metrics */}
        <div className="mt-6 pt-5 border-t border-border/40 grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight">{formatDuration(data.avgTimeToComplete)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Avg Completion Time</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold tracking-tight">{data.avgPlanningRounds.toFixed(1)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Avg Planning Rounds</p>
          </div>
        </div>
      </div>
    </div>
  );
}
