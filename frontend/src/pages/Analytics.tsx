import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ExecutiveSummaryCards } from '@/components/analytics/ExecutiveSummaryCards';
import { TimeSeriesChart } from '@/components/analytics/TimeSeriesChart';
import { CostUsageChart } from '@/components/analytics/CostUsageChart';
import { PipelineHealthCard } from '@/components/analytics/PipelineHealthCard';
import { TaskDistributionCharts } from '@/components/analytics/TaskDistributionCharts';
import { RepositoryPerformance } from '@/components/analytics/RepositoryPerformance';
import { ROICalculator } from '@/components/analytics/ROICalculator';
import { SecurityAlertsSummary } from '@/components/analytics/SecurityAlertsSummary';
import { EfficiencyMetrics } from '@/components/analytics/EfficiencyMetrics';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { DrillDownModal } from '@/components/analytics/DrillDownModal';
import { ExportDialog } from '@/components/analytics/ExportDialog';
import { PredictiveInsights } from '@/components/analytics/PredictiveInsights';
import { CodeHealthDashboard } from '@/components/analytics/CodeHealthDashboard';
import { AIMetricsDashboard } from '@/components/analytics/AIMetricsDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Shield, Activity, Brain, Download } from 'lucide-react';

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

  const { data: repos } = useQuery({
    queryKey: ['repos'],
    queryFn: api.repos.list,
  });

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

  const { data: loc } = useQuery({
    queryKey: ['analytics', 'loc', dateRange],
    queryFn: () => api.analytics.getLOC(dateRange),
  });

  const { data: timeSaved } = useQuery({
    queryKey: ['analytics', 'time-saved', dateRange],
    queryFn: () => api.analytics.getTimeSaved(dateRange),
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 px-4 sm:px-6 lg:px-8 py-4">
      {/* Tab Navigation + Filters in one row */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <TabsList className="inline-flex h-9 items-center justify-start rounded-lg bg-muted/60 backdrop-blur-sm p-0.5 border border-border/40 w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="metrics" className="rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground">
              <BarChart3 className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
              <span className="hidden xs:inline">Metrics &</span> ROI
            </TabsTrigger>
            <TabsTrigger value="health" className="rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground">
              <Activity className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
              Health
            </TabsTrigger>
            <TabsTrigger value="predictive" className="rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground">
              <Shield className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
              Predictive
            </TabsTrigger>
            <TabsTrigger value="ai-performance" className="rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground">
              <Brain className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
              AI
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
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
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-all duration-200 text-xs font-medium shadow-sm active:scale-[0.98]"
            >
              <Download size={13} />
              Export
            </button>
          </div>
        </div>

        <TabsContent value="metrics" className="space-y-4 mt-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <ExecutiveSummaryCards data={overview} isLoading={overviewLoading} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TimeSeriesChart
              locData={loc || []}
              timeSavedData={timeSaved || []}
              title="Code Changes & Time Saved"
            />
            <CostUsageChart dateRange={dateRange} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <PipelineHealthCard data={pipeline} />
            <div className="md:col-span-1 lg:col-span-2">
              <TaskDistributionCharts />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RepositoryPerformance />
            <ROICalculator dateRange={dateRange} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SecurityAlertsSummary />
            <EfficiencyMetrics
              dateRange={dateRange}
              projectId={selectedProject}
              repositoryId={selectedRepo}
            />
          </div>
        </TabsContent>

        <TabsContent value="health" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <CodeHealthDashboard repositoryId={selectedRepo} projectId={selectedProject} />
        </TabsContent>

        <TabsContent value="predictive" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <PredictiveInsights repositoryId={selectedRepo} projectId={selectedProject} />
        </TabsContent>

        <TabsContent value="ai-performance" className="mt-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <AIMetricsDashboard dateRange={dateRange} />
        </TabsContent>
      </Tabs>

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
