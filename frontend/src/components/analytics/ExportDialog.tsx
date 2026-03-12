import { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ExportDialogProps {
  dateRange: { startDate: string; endDate: string };
  onClose: () => void;
}

type ExportFormat = 'csv' | 'json';

interface ExportOption {
  value: ExportFormat;
  label: string;
  description: string;
  icon: React.ElementType;
}

const exportOptions: ExportOption[] = [
  {
    value: 'csv',
    label: 'CSV',
    description: 'Spreadsheet compatible format',
    icon: FileSpreadsheet,
  },
  {
    value: 'json',
    label: 'JSON',
    description: 'Structured data format',
    icon: FileJson,
  },
];

export function ExportDialog({ dateRange, onClose }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const params = {
        format: selectedFormat,
        ...(dateRange.startDate && { startDate: dateRange.startDate }),
        ...(dateRange.endDate && { endDate: dateRange.endDate }),
      };

      // Build URL for download
      const queryString = new URLSearchParams(params as Record<string, string>).toString();
      const downloadUrl = `/api/analytics/export?${queryString}`;

      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `analytics-export-${new Date().toISOString().slice(0, 10)}.${selectedFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Close dialog after short delay
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const formatDateRange = () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      return 'All time';
    }
    return `${dateRange.startDate} to ${dateRange.endDate}`;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download size={20} className="text-muted-foreground" />
            Export Analytics Data
          </DialogTitle>
          <DialogDescription>
            Download your analytics data for the selected period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Range Info */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">Date Range</p>
            <p className="text-sm font-medium">{formatDateRange()}</p>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Select Format</p>
            <div className="grid grid-cols-2 gap-3">
              {exportOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedFormat === option.value;

                return (
                  <button
                    key={option.value}
                    onClick={() => setSelectedFormat(option.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-border hover:bg-muted/30"
                    )}
                  >
                    <Icon
                      size={24}
                      className={isSelected ? "text-primary" : "text-muted-foreground"}
                    />
                    <div className="text-center">
                      <p className={cn(
                        "text-sm font-medium",
                        isSelected ? "text-primary" : "text-foreground"
                      )}>
                        {option.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* What's Included */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Included Data</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Task statistics and metrics
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Time saved breakdown
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Cost and usage data
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Contributor performance
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                ROI calculations
              </li>
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Exporting...
              </>
            ) : (
              <>
                <Download size={16} className="mr-2" />
                Export {selectedFormat.toUpperCase()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
