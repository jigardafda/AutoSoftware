import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ExecutiveSummaryCards } from '@/components/analytics/ExecutiveSummaryCards';
import { TimeSeriesChart } from '@/components/analytics/TimeSeriesChart';
import { CostUsageChart } from '@/components/analytics/CostUsageChart';
import { PipelineHealthCard } from '@/components/analytics/PipelineHealthCard';
import { TaskDistributionCharts } from '@/components/analytics/TaskDistributionCharts';
import { ContributorsLeaderboard } from '@/components/analytics/ContributorsLeaderboard';
import { ROICalculator } from '@/components/analytics/ROICalculator';
import { ActivityTimeline } from '@/components/analytics/ActivityTimeline';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { DrillDownModal } from '@/components/analytics/DrillDownModal';
import { ExportDialog } from '@/components/analytics/ExportDialog';
import { PredictiveInsights } from '@/components/analytics/PredictiveInsights';
import { CodeHealthDashboard } from '@/components/analytics/CodeHealthDashboard';
import { AIMetricsDashboard } from '@/components/analytics/AIMetricsDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Shield, Activity, Brain } from 'lucide-react';

// Helper to get default 30-day range
function getDefaultDateRange() {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const startDate = start.toISOString().slice(0, 10);
  return { startDate, endDate };
}

export default function Analytics() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [selectedProject, setSelectedProject] = useState<string | undefined>();
  const [selectedRepo, setSelectedRepo] = useState<string | undefined>();
  const [drillDown, setDrillDown] = useState<{ type: string; id: string } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'health' | 'predictive' | 'ai-performance'>('metrics');

  // Fetch repositories for auto-selection
  const { data: repos } = useQuery({
    queryKey: ['repos'],
    queryFn: api.repos.list,
  });

  // Auto-select first repository when health/predictive tabs are active and no repo selected
  useEffect(() => {
    if ((activeTab === 'health' || activeTab === 'predictive') && !selectedRepo && repos && repos.length > 0) {
      setSelectedRepo(repos[0].id);
    }
  }, [activeTab, selectedRepo, repos]);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics', 'overview', dateRange, selectedProject, selectedRepo],
    queryFn: () => api.analytics.getOverview({
      ...dateRange,
      projectId: selectedProject,
      repositoryId: selectedRepo,
    }),
  });

  const { data: pipeline } = useQuery({
    queryKey: ['analytics', 'pipeline'],
    queryFn: () => api.analytics.getPipeline(),
  });

  const { data: contributors } = useQuery({
    queryKey: ['analytics', 'contributors', dateRange],
    queryFn: () => api.analytics.getContributors({
      ...dateRange,
      limit: 10,
    }),
  });

  const { data: loc } = useQuery({
    queryKey: ['analytics', 'loc', dateRange],
    queryFn: () => api.analytics.getLOC(dateRange),
  });

  const { data: timeSaved } = useQuery({
    queryKey: ['analytics', 'time-saved', dateRange],
    queryFn: () => api.analytics.getTimeSaved(dateRange),
  });

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Header - stacks on mobile */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Track your engineering productivity and ROI</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <AnalyticsFilters
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            selectedProject={selectedProject}
            onProjectChange={setSelectedProject}
            selectedRepo={selectedRepo}
            onRepoChange={setSelectedRepo}
          />
          <button
            onClick={() => setShowExport(true)}
            className="px-4 py-2.5 sm:py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 min-h-[44px] sm:min-h-0"
          >
            Export
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'metrics' | 'health' | 'predictive' | 'ai-performance')}>
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="metrics" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Metrics & ROI</span>
            <span className="sm:hidden">Metrics</span>
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Code Health</span>
            <span className="sm:hidden">Health</span>
          </TabsTrigger>
          <TabsTrigger value="predictive" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Predictive</span>
            <span className="sm:hidden">Predict</span>
          </TabsTrigger>
          <TabsTrigger value="ai-performance" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">AI Performance</span>
            <span className="sm:hidden">AI</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4 sm:space-y-6 mt-4 sm:mt-6">
          {/* Executive Summary */}
          <ExecutiveSummaryCards
            data={overview}
            isLoading={overviewLoading}
          />

          {/* Charts Row - stack on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <TimeSeriesChart
              locData={loc || []}
              timeSavedData={timeSaved || []}
              title="Code Changes & Time Saved"
            />
            <CostUsageChart dateRange={dateRange} />
          </div>

          {/* Pipeline and Distribution - stack on mobile/tablet */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <PipelineHealthCard data={pipeline} />
            <div className="md:col-span-1 lg:col-span-2">
              <TaskDistributionCharts />
            </div>
          </div>

          {/* Contributors and ROI - stack on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <ContributorsLeaderboard
              contributors={contributors || []}
              onUserClick={(userId) => setDrillDown({ type: 'user', id: userId })}
            />
            <ROICalculator dateRange={dateRange} />
          </div>

          {/* Activity Timeline */}
          <ActivityTimeline />
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          {/* Code Health Dashboard */}
          <CodeHealthDashboard
            repositoryId={selectedRepo}
            projectId={selectedProject}
          />
        </TabsContent>

        <TabsContent value="predictive" className="mt-6">
          {/* Predictive Analysis */}
          <PredictiveInsights
            repositoryId={selectedRepo}
            projectId={selectedProject}
          />
        </TabsContent>

        <TabsContent value="ai-performance" className="mt-6">
          {/* AI Performance & Self-Improvement */}
          <AIMetricsDashboard dateRange={dateRange} />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {drillDown && (
        <DrillDownModal
          type={drillDown.type}
          id={drillDown.id}
          onClose={() => setDrillDown(null)}
          onNavigate={(type, id) => setDrillDown({ type, id })}
        />
      )}

      {showExport && (
        <ExportDialog
          dateRange={dateRange}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
