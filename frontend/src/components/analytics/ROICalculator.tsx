import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, DollarSign, Clock, TrendingUp, ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ROICalculatorProps {
  dateRange: { startDate: string; endDate: string };
}

export function ROICalculator({ dateRange }: ROICalculatorProps) {
  const { data: savedSettings } = useQuery({
    queryKey: ['analytics', 'settings'],
    queryFn: api.analytics.getSettings,
    staleTime: Infinity,
  });

  const [hourlyRate, setHourlyRate] = useState<number | null>(null);
  const [debouncedRate, setDebouncedRate] = useState<number>(75);

  // Initialize from saved settings once loaded
  useEffect(() => {
    if (savedSettings && hourlyRate === null) {
      setHourlyRate(savedSettings.hourlyRate);
      setDebouncedRate(savedSettings.hourlyRate);
    }
  }, [savedSettings, hourlyRate]);

  useEffect(() => {
    if (hourlyRate === null) return;
    const timer = setTimeout(() => setDebouncedRate(hourlyRate), 500);
    return () => clearTimeout(timer);
  }, [hourlyRate]);

  const displayRate = hourlyRate ?? savedSettings?.hourlyRate ?? 75;

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'roi', dateRange, debouncedRate],
    queryFn: () => api.analytics.getROI({ ...dateRange, hourlyRate: debouncedRate }),
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6">
        <Skeleton className="h-5 w-32 mb-6" />
        <Skeleton className="h-[360px] rounded-xl" />
      </div>
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

  const isPositive = roiData.netSavings > 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calculator size={15} className="text-muted-foreground" />
          ROI Calculator
        </h3>
      </div>
      <div className="px-6 pb-6">
        {/* Rate Input */}
        <div className="mb-5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Engineering Hourly Rate
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">$</span>
            <input
              type="number"
              value={displayRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              min={0}
              max={500}
              className={cn(
                "h-10 w-24 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-sm font-medium",
                "transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
              )}
            />
            <span className="text-xs text-muted-foreground">/ hour</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-3">
          {/* Saved */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Clock size={17} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Engineering Cost Saved</p>
                <p className="text-[11px] text-muted-foreground">
                  {roiData.totalHoursSaved.toFixed(1)} hrs @ ${displayRate}/hr
                </p>
              </div>
            </div>
            <span className="text-lg font-bold text-emerald-500 tabular-nums">
              +${roiData.engineeringCostSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Platform Cost */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-red-500/5 border border-red-500/10">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                <DollarSign size={17} className="text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Platform Cost</p>
                <p className="text-[11px] text-muted-foreground">API & compute costs</p>
              </div>
            </div>
            <span className="text-lg font-bold text-red-500 tabular-nums">
              -${roiData.platformCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-border/60" />
            <ArrowRight size={14} className="text-muted-foreground/50" />
            <div className="flex-1 h-px bg-border/60" />
          </div>

          {/* Net Savings */}
          <div className={cn(
            "flex items-center justify-between p-4 rounded-xl border",
            isPositive
              ? "bg-gradient-to-r from-emerald-500/5 to-cyan-500/5 border-emerald-500/20"
              : "bg-gradient-to-r from-red-500/5 to-orange-500/5 border-red-500/20"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center",
                isPositive ? "bg-emerald-500/10" : "bg-red-500/10"
              )}>
                <TrendingUp size={19} className={isPositive ? "text-emerald-500" : "text-red-500"} />
              </div>
              <div>
                <p className="text-sm font-semibold">Net Savings</p>
                <p className="text-[11px] text-muted-foreground">Total ROI for period</p>
              </div>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-2xl font-bold tabular-nums",
                isPositive ? "text-emerald-500" : "text-red-500"
              )}>
                {isPositive ? '+' : '-'}${Math.abs(roiData.netSavings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <p className={cn(
                "text-sm font-bold",
                isPositive ? "text-emerald-500" : "text-red-500"
              )}>
                {roiData.roi.toFixed(0)}% ROI
              </p>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/60 mt-4 text-center">
          ROI = (Engineering Cost Saved - Platform Cost) / Platform Cost x 100
        </p>
      </div>
    </div>
  );
}
