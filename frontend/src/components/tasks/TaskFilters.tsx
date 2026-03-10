import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, Check, ChevronsUpDown, Github, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TaskFiltersProps {
  filters: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "planning", label: "Planning" },
  { value: "awaiting_input", label: "Awaiting Input" },
  { value: "planned", label: "Planned" },
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

function SearchableFilter({
  label,
  value,
  items,
  onChange,
  icon: Icon,
  allLabel,
  getItemLabel,
}: {
  label: string;
  value: string;
  items: { id: string; name: string }[];
  onChange: (value: string) => void;
  icon: React.ElementType;
  allLabel: string;
  getItemLabel: (item: { id: string; name: string }) => string;
}) {
  const [open, setOpen] = useState(false);
  const selectedItem = items.find((item) => item.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-40 justify-between text-xs font-normal"
        >
          <span className="flex items-center gap-1.5 truncate">
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {value && value !== "all"
                ? getItemLabel(selectedItem!)
                : allLabel}
            </span>
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No {label.toLowerCase()} found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => {
                  onChange("all");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value || value === "all" ? "opacity-100" : "opacity-0"
                  )}
                />
                <Icon className="mr-2 h-4 w-4" />
                {allLabel}
              </CommandItem>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={getItemLabel(item)}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === item.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Icon className="mr-2 h-4 w-4" />
                  <span className="truncate">{getItemLabel(item)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const hasActiveFilters = (filters: Record<string, string>) =>
  Object.values(filters).some((v) => v && v !== "all");

export function TaskFilters({ filters, onChange, onClear }: TaskFiltersProps) {
  // Fetch repos and projects for filters
  const { data: repos = [] } = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos.list,
    staleTime: 60_000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchableFilter
        label="Repository"
        value={filters.repositoryId || "all"}
        items={repos.map((r: any) => ({ id: r.id, name: r.fullName }))}
        onChange={(v) => onChange("repositoryId", v)}
        icon={Github}
        allLabel="All Repos"
        getItemLabel={(item) => item.name}
      />
      <SearchableFilter
        label="Project"
        value={filters.projectId || "all"}
        items={projects.map((p: any) => ({ id: p.id, name: p.name }))}
        onChange={(v) => onChange("projectId", v)}
        icon={FolderKanban}
        allLabel="All Projects"
        getItemLabel={(item) => item.name}
      />
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
