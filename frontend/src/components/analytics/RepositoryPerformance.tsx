import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { GitBranch, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

export function RepositoryPerformance() {
  const { data: repos = [], isLoading: reposLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: api.repos.list,
  });

  const { data: distribution, isLoading: distLoading } = useQuery({
    queryKey: ['analytics', 'distribution', 'repository'],
    queryFn: () => api.analytics.getDistribution('repository'),
  });

  const isLoading = reposLoading || distLoading;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6">
        <Skeleton className="h-5 w-44 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const items = distribution?.items || [];
  const totalTasks = items.reduce((sum, i) => sum + i.value, 0);

  // Merge distribution data with repo metadata
  const repoData = items.map((item) => {
    const repo = repos.find((r: any) => r.fullName === item.label || r.name === item.label);
    return {
      id: repo?.id,
      name: item.label,
      taskCount: item.value,
      percentage: item.percentage,
    };
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <GitBranch size={15} className="text-muted-foreground" />
          Repository Performance
        </h3>
        <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
          {items.length} repos
        </span>
      </div>
      <div className="px-3 pb-3">
        {repoData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No repository data available</p>
          </div>
        ) : (
          <ScrollArea className="h-[340px]">
            <div className="space-y-1">
              {repoData.map((repo, index) => {
                const barWidth = totalTasks > 0 ? (repo.taskCount / totalTasks) * 100 : 0;
                return (
                  <Link
                    key={repo.name}
                    to={repo.id ? `/repos/${repo.id}` : '#'}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-muted/50"
                  >
                    {/* Rank */}
                    <span className="w-5 text-xs font-semibold text-muted-foreground tabular-nums text-center shrink-0">
                      {index + 1}
                    </span>

                    {/* Repo info + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-sm font-medium truncate">{repo.name}</p>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-sm font-bold tabular-nums">{repo.taskCount}</span>
                          <span className="text-[10px] text-muted-foreground">tasks</span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/60 transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{repo.percentage}% of total</p>
                    </div>

                    <ChevronRight size={14} className="shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-all group-hover:translate-x-0.5" />
                  </Link>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
