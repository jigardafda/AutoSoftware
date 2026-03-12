/**
 * Scan Analysis Dashboard
 * Combined view of all scan analysis data
 */

import { useMemo } from 'react';
import { Building2, Link2, Trash2, Copy, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArchitectureCard } from './ArchitectureCard';
import { DependenciesGraph } from './DependenciesGraph';
import { DeadCodeList } from './DeadCodeList';
import { DuplicationsList } from './DuplicationsList';
import { PerformanceIssuesList } from './PerformanceIssuesList';
import type { CodeAnalysisResult, ArchitecturePattern } from './types';

interface ScanAnalysisDashboardProps {
  codeAnalysis: CodeAnalysisResult | null;
  languageProfile?: {
    languages?: Array<{ language: string; percentage: number; fileCount?: number; lineCount?: number }>;
    frameworkHints?: string[];
  } | null;
  primaryLanguage?: string | null;
  className?: string;
}

export function ScanAnalysisDashboard({
  codeAnalysis,
  languageProfile,
  primaryLanguage,
  className,
}: ScanAnalysisDashboardProps) {
  // Parse architecture pattern from string
  const architecturePattern = useMemo<ArchitecturePattern | null>(() => {
    if (!codeAnalysis?.architecturePattern) return null;
    try {
      // If it's stored as JSON string
      if (typeof codeAnalysis.architecturePattern === 'string') {
        const parsed = JSON.parse(codeAnalysis.architecturePattern);
        return parsed;
      }
      return codeAnalysis.architecturePattern as any;
    } catch {
      // If it's just a type string like "mvc"
      return {
        type: codeAnalysis.architecturePattern as any,
        confidence: 7,
        evidence: [],
      };
    }
  }, [codeAnalysis?.architecturePattern]);

  // Summary stats
  const stats = useMemo(() => {
    if (!codeAnalysis) {
      return {
        dependencies: 0,
        deadCode: 0,
        duplications: 0,
        performanceIssues: 0,
        criticalIssues: 0,
      };
    }

    const performanceIssues = codeAnalysis.performanceIssues || [];
    const criticalIssues = performanceIssues.filter(
      (i) => i.severityLevel === 'critical'
    ).length;

    return {
      dependencies: (codeAnalysis.dependencies || []).length,
      deadCode: (codeAnalysis.deadCodePaths || []).length,
      duplications: (codeAnalysis.duplications || []).length,
      performanceIssues: performanceIssues.length,
      criticalIssues,
    };
  }, [codeAnalysis]);

  // Check if we have any analysis data
  const hasData =
    codeAnalysis &&
    (stats.dependencies > 0 ||
      stats.deadCode > 0 ||
      stats.duplications > 0 ||
      stats.performanceIssues > 0 ||
      architecturePattern);

  if (!hasData) {
    return (
      <Card className={className}>
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No detailed analysis data available</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Code analysis will be generated during the next scan
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <Building2 className="h-4 w-4 text-blue-500" />
              <Badge variant="outline" className="text-xs">
                {architecturePattern?.type || 'Unknown'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Architecture</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <Link2 className="h-4 w-4 text-purple-500" />
              <span className="text-lg font-bold">{stats.dependencies}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Dependencies</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <Trash2 className="h-4 w-4 text-red-500" />
              <span className="text-lg font-bold">{stats.deadCode}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Dead Code</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <Copy className="h-4 w-4 text-yellow-500" />
              <span className="text-lg font-bold">{stats.duplications}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Duplications</p>
          </CardContent>
        </Card>

        <Card className="col-span-2 md:col-span-1">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <Zap className="h-4 w-4 text-orange-500" />
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold">{stats.performanceIssues}</span>
                {stats.criticalIssues > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1 py-0 bg-red-500/15 text-red-500 border-red-500/20"
                  >
                    {stats.criticalIssues} critical
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Performance Issues</p>
          </CardContent>
        </Card>
      </div>

      {/* Language Info */}
      {(primaryLanguage || (languageProfile?.languages && languageProfile.languages.length > 0)) && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Language Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {languageProfile?.languages?.map((lang, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={i === 0 ? 'bg-primary/15 text-primary border-primary/20' : ''}
                >
                  {lang.language} ({lang.percentage.toFixed(1)}%)
                  {lang.fileCount && (
                    <span className="ml-1 text-muted-foreground">
                      • {lang.fileCount} files
                    </span>
                  )}
                </Badge>
              ))}
              {languageProfile?.frameworkHints && languageProfile.frameworkHints.length > 0 && (
                <>
                  <span className="text-muted-foreground mx-1">•</span>
                  {languageProfile.frameworkHints.map((hint, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {hint}
                    </Badge>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Analysis Tabs */}
      <Tabs defaultValue="architecture" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="architecture" className="text-xs sm:text-sm">
            <Building2 className="h-4 w-4 mr-1 hidden sm:inline" />
            Architecture
          </TabsTrigger>
          <TabsTrigger value="dependencies" className="text-xs sm:text-sm">
            <Link2 className="h-4 w-4 mr-1 hidden sm:inline" />
            Dependencies
            {stats.dependencies > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 hidden sm:inline-flex">
                {stats.dependencies}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dead-code" className="text-xs sm:text-sm">
            <Trash2 className="h-4 w-4 mr-1 hidden sm:inline" />
            Dead Code
            {stats.deadCode > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0 hidden sm:inline-flex">
                {stats.deadCode}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="duplications" className="text-xs sm:text-sm">
            <Copy className="h-4 w-4 mr-1 hidden sm:inline" />
            Duplications
            {stats.duplications > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 hidden sm:inline-flex bg-yellow-500/15 text-yellow-600">
                {stats.duplications}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="performance" className="text-xs sm:text-sm">
            <Zap className="h-4 w-4 mr-1 hidden sm:inline" />
            Performance
            {stats.performanceIssues > 0 && (
              <Badge
                variant="secondary"
                className={`ml-1 text-[10px] px-1.5 py-0 hidden sm:inline-flex ${
                  stats.criticalIssues > 0
                    ? 'bg-red-500/15 text-red-500'
                    : 'bg-orange-500/15 text-orange-500'
                }`}
              >
                {stats.performanceIssues}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="architecture">
          <ArchitectureCard pattern={architecturePattern} />
        </TabsContent>

        <TabsContent value="dependencies">
          <DependenciesGraph dependencies={codeAnalysis?.dependencies || []} />
        </TabsContent>

        <TabsContent value="dead-code">
          <DeadCodeList deadCode={codeAnalysis?.deadCodePaths || []} />
        </TabsContent>

        <TabsContent value="duplications">
          <DuplicationsList duplications={codeAnalysis?.duplications || []} />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceIssuesList issues={codeAnalysis?.performanceIssues || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
