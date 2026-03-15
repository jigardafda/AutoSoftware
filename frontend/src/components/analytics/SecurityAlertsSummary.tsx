import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, ChevronRight, Shield } from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: typeof AlertTriangle }> = {
  critical: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', icon: ShieldAlert },
  high: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', icon: AlertTriangle },
  medium: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', icon: AlertCircle },
  low: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)', icon: Info },
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function SecurityAlertsSummary() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dependencies', 'stats'],
    queryFn: api.dependencies.getStats,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const severityCounts = stats?.alertsBySeverity || {};
  const typeCounts = stats?.alertsByType || {};
  const recentAlerts = stats?.recentAlerts || [];
  const totalAlerts = stats?.totalAlerts || 0;

  const hasCritical = (severityCounts['critical'] || 0) > 0;
  const hasHigh = (severityCounts['high'] || 0) > 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-5 pt-4 pb-3">
        <div className={`h-6 w-6 rounded-lg flex items-center justify-center ${hasCritical ? 'bg-red-500/15' : hasHigh ? 'bg-orange-500/15' : 'bg-emerald-500/15'}`}>
          <Shield size={12} className={hasCritical ? 'text-red-500' : hasHigh ? 'text-orange-500' : 'text-emerald-500'} />
        </div>
        <h3 className="text-sm font-semibold">Security & Dependencies</h3>
        {totalAlerts > 0 && (
          <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${hasCritical ? 'bg-red-500/10 text-red-500' : hasHigh ? 'bg-orange-500/10 text-orange-500' : 'bg-muted/60 text-muted-foreground'}`}>
            {totalAlerts} alert{totalAlerts !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="px-4 pb-4 flex-1 flex flex-col gap-3">
        {/* Severity cards */}
        <div className="grid grid-cols-4 gap-2">
          {SEVERITY_ORDER.map((severity) => {
            const count = severityCounts[severity] || 0;
            const config = SEVERITY_CONFIG[severity];
            const Icon = config.icon;
            return (
              <div
                key={severity}
                className="rounded-xl border border-border/40 p-3 text-center transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center justify-center mb-1.5">
                  <div
                    className="h-5 w-5 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: config.bg }}
                  >
                    <Icon size={11} style={{ color: config.color }} />
                  </div>
                </div>
                <div className="text-lg font-bold tabular-nums" style={{ color: count > 0 ? config.color : undefined }}>
                  {count}
                </div>
                <div className="text-[10px] font-medium text-muted-foreground capitalize">
                  {severity}
                </div>
              </div>
            );
          })}
        </div>

        {/* Alert type breakdown */}
        {Object.keys(typeCounts).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(typeCounts).map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-muted/50 text-muted-foreground"
              >
                <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                <span className="font-bold text-foreground">{count as number}</span>
              </span>
            ))}
          </div>
        )}

        {/* Recent alerts */}
        {recentAlerts.length > 0 && (
          <div className="flex-1 space-y-1 mt-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
              Recent Alerts
            </p>
            {recentAlerts.slice(0, 4).map((alert: any) => {
              const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low;
              const Icon = config.icon;
              return (
                <div
                  key={alert.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors"
                >
                  <div
                    className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: config.bg }}
                  >
                    <Icon size={10} style={{ color: config.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{alert.title}</p>
                    <p className="text-[10px] text-muted-foreground">{alert.repository}</p>
                  </div>
                  <ChevronRight size={12} className="shrink-0 text-muted-foreground/40" />
                </div>
              );
            })}
          </div>
        )}

        {totalAlerts === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                <Shield size={16} className="text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">All clear</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">No dependency alerts found</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
