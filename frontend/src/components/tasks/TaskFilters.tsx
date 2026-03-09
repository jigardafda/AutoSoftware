import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TaskFiltersProps {
  filters: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "improvement", label: "Improvement" },
  { value: "bugfix", label: "Bugfix" },
  { value: "feature", label: "Feature" },
  { value: "refactor", label: "Refactor" },
  { value: "security", label: "Security" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "All Sources" },
  { value: "auto_scan", label: "Auto Scan" },
  { value: "manual", label: "Manual" },
];

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger className="w-32 h-8 text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const hasActiveFilters = (filters: Record<string, string>) =>
  Object.values(filters).some((v) => v && v !== "all");

export function TaskFilters({ filters, onChange, onClear }: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        label="Status"
        value={filters.status || "all"}
        options={STATUS_OPTIONS}
        onChange={(v) => onChange("status", v)}
      />
      <FilterSelect
        label="Type"
        value={filters.type || "all"}
        options={TYPE_OPTIONS}
        onChange={(v) => onChange("type", v)}
      />
      <FilterSelect
        label="Priority"
        value={filters.priority || "all"}
        options={PRIORITY_OPTIONS}
        onChange={(v) => onChange("priority", v)}
      />
      <FilterSelect
        label="Source"
        value={filters.source || "all"}
        options={SOURCE_OPTIONS}
        onChange={(v) => onChange("source", v)}
      />
      {hasActiveFilters(filters) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 text-xs text-muted-foreground"
        >
          <X className="mr-1 h-3 w-3" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
