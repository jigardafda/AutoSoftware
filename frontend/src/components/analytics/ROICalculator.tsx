import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, DollarSign, Clock, TrendingUp, Minus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ROICalculatorProps {
  dateRange: { startDate: string; endDate: string };
}

export function ROICalculator({ dateRange }: ROICalculatorProps) {
  const [hourlyRate, setHourlyRate] = useState(75);
  const [debouncedRate, setDebouncedRate] = useState(hourlyRate);

  // Debounce hourly rate changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRate(hourlyRate);
    }, 500);
    return () => clearTimeout(timer);
  }, [hourlyRate]);

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'roi', dateRange, debouncedRate],
    queryFn: () => api.analytics.getROI({
      ...dateRange,
      hourlyRate: debouncedRate,
    }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-4 pb-0">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="p-4 pt-4">
          <Skeleton className="h-[340px]" />
        </CardContent>
      </Card>
    );
  }

  const roiData = data || {
    engineeringCostSaved: 0,
    platformCost: 0,
    netSavings: 0,
    roi: 0,
    hourlyRate: 75,
    totalHoursSaved: 0,
  };

  const isPositiveROI = roiData.netSavings > 0;

  return (
    <Card>
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator size={16} className="text-muted-foreground" />
            ROI Calculator
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-4">
        {/* Hourly Rate Input */}
        <div className="mb-6">
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            Engineering Hourly Rate
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">$</span>
            <input
              type="number"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              min={0}
              max={500}
              className={cn(
                "flex h-10 w-24 rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm",
                "transition-all duration-200 ring-offset-background",
                "placeholder:text-muted-foreground/70",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
                "hover:border-border"
              )}
            />
            <span className="text-sm text-muted-foreground">/ hour</span>
          </div>
        </div>

        {/* ROI Breakdown */}
        <div className="space-y-4">
          {/* Engineering Cost Saved */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-[oklch(0.65_0.18_145)]/10 flex items-center justify-center">
                <Clock size={18} className="text-[oklch(0.65_0.18_145)]" />
              </div>
              <div>
                <p className="text-sm font-medium">Engineering Cost Saved</p>
                <p className="text-xs text-muted-foreground">
                  {roiData.totalHoursSaved.toFixed(1)} hours @ ${hourlyRate}/hr
                </p>
              </div>
            </div>
            <span className="text-lg font-semibold text-[oklch(0.65_0.18_145)]">
              +${roiData.engineeringCostSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Platform Cost */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-[oklch(0.60_0.22_25)]/10 flex items-center justify-center">
                <DollarSign size={18} className="text-[oklch(0.60_0.22_25)]" />
              </div>
              <div>
                <p className="text-sm font-medium">Platform Cost</p>
                <p className="text-xs text-muted-foreground">API and compute costs</p>
              </div>
            </div>
            <span className="text-lg font-semibold text-[oklch(0.60_0.22_25)]">
              -${roiData.platformCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2 py-2">
            <div className="flex-1 h-px bg-border" />
            <Minus size={16} className="text-muted-foreground" />
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Net Savings */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Net Savings</p>
                <p className="text-xs text-muted-foreground">Total ROI for period</p>
              </div>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-2xl font-bold",
                isPositiveROI ? "text-[oklch(0.65_0.18_145)]" : "text-[oklch(0.60_0.22_25)]"
              )}>
                {isPositiveROI ? '+' : '-'}${Math.abs(roiData.netSavings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <p className={cn(
                "text-sm font-semibold",
                isPositiveROI ? "text-[oklch(0.65_0.18_145)]" : "text-[oklch(0.60_0.22_25)]"
              )}>
                {roiData.roi.toFixed(0)}% ROI
              </p>
            </div>
          </div>
        </div>

        {/* Helper Text */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          ROI is calculated as (Engineering Cost Saved - Platform Cost) / Platform Cost x 100
        </p>
      </CardContent>
    </Card>
  );
}
