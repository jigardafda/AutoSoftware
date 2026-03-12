import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronDown, X, Check, Search, FolderKanban, GitBranch } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AnalyticsFiltersProps {
  dateRange: { startDate: string; endDate: string };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  selectedProject?: string;
  onProjectChange: (projectId: string | undefined) => void;
  selectedRepo?: string;
  onRepoChange: (repoId: string | undefined) => void;
}

type PresetRange = '7d' | '30d' | '90d' | '1y' | 'custom';

const presets: { value: PresetRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
];

function getPresetDates(preset: PresetRange): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);

  let startDate: string;
  switch (preset) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      break;
    default:
      startDate = '';
  }

  return { startDate, endDate };
}

function detectPreset(dateRange: { startDate: string; endDate: string }): PresetRange {
  if (!dateRange.startDate || !dateRange.endDate) return '30d';

  const start = new Date(dateRange.startDate).getTime();
  const end = new Date(dateRange.endDate).getTime();
  const diff = Math.floor((end - start) / (24 * 60 * 60 * 1000));

  if (diff === 7) return '7d';
  if (diff === 30) return '30d';
  if (diff === 90) return '90d';
  if (diff >= 364 && diff <= 366) return '1y';
  return 'custom';
}

export function AnalyticsFilters({
  dateRange,
  onDateRangeChange,
  selectedProject,
  onProjectChange,
  selectedRepo,
  onRepoChange,
}: AnalyticsFiltersProps) {
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const [isRepoOpen, setIsRepoOpen] = useState(false);
  const [customStart, setCustomStart] = useState(dateRange.startDate);
  const [customEnd, setCustomEnd] = useState(dateRange.endDate);
  const [projectSearch, setProjectSearch] = useState('');
  const [repoSearch, setRepoSearch] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
  });

  const { data: repos } = useQuery({
    queryKey: ['repos'],
    queryFn: api.repos.list,
  });

  const currentPreset = detectPreset(dateRange);

  // Filter projects based on search
  const filteredProjects = useMemo(() => {
    const projectList = projects || [];
    if (!projectSearch) return projectList;
    return projectList.filter((p: any) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase())
    );
  }, [projects, projectSearch]);

  // Filter repos based on search
  const filteredRepos = useMemo(() => {
    const repoList = repos || [];
    if (!repoSearch) return repoList;
    return repoList.filter((r: any) =>
      r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
      r.fullName?.toLowerCase().includes(repoSearch.toLowerCase())
    );
  }, [repos, repoSearch]);

  // Get selected project/repo names for display
  const selectedProjectName = useMemo(() => {
    if (!selectedProject) return 'All Projects';
    const project = (projects || []).find((p: any) => p.id === selectedProject);
    return project?.name || 'All Projects';
  }, [selectedProject, projects]);

  const selectedRepoName = useMemo(() => {
    if (!selectedRepo) return 'All Repos';
    const repo = (repos || []).find((r: any) => r.id === selectedRepo);
    return repo?.name || 'All Repos';
  }, [selectedRepo, repos]);

  const handlePresetChange = (preset: PresetRange) => {
    if (preset === 'custom') {
      setIsDateOpen(true);
      return;
    }
    const dates = getPresetDates(preset);
    onDateRangeChange(dates);
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onDateRangeChange({ startDate: customStart, endDate: customEnd });
      setIsDateOpen(false);
    }
  };

  const formatDateRange = () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      return 'Last 30 days';
    }
    const preset = presets.find(p => p.value === currentPreset);
    if (preset && preset.value !== 'custom') {
      return preset.label;
    }
    return `${dateRange.startDate} - ${dateRange.endDate}`;
  };

  return (
    <div className="flex items-center gap-3">
      {/* Date Range Filter */}
      <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50",
              "bg-background/50 text-sm transition-all duration-200",
              "hover:border-border hover:bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
            )}
          >
            <Calendar size={16} className="text-muted-foreground" />
            <span>{formatDateRange()}</span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          {/* Presets */}
          <div className="p-2 border-b border-border/50">
            <div className="grid grid-cols-2 gap-1">
              {presets.filter(p => p.value !== 'custom').map(preset => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetChange(preset.value)}
                  className={cn(
                    "px-3 py-2 text-sm rounded-md transition-colors",
                    currentPreset === preset.value
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Range */}
          <div className="p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Custom Range
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className={cn(
                  "flex h-9 w-full rounded-lg border border-border/50 bg-background/50 px-3 py-1 text-sm",
                  "transition-all duration-200",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                )}
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={cn(
                  "flex h-9 w-full rounded-lg border border-border/50 bg-background/50 px-3 py-1 text-sm",
                  "transition-all duration-200",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                )}
              />
            </div>
            <Button
              onClick={handleCustomApply}
              disabled={!customStart || !customEnd}
              className="w-full"
              size="sm"
            >
              Apply Range
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Project Filter - Searchable */}
      <Popover open={isProjectOpen} onOpenChange={setIsProjectOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 min-w-[160px]",
              "bg-background/50 text-sm transition-all duration-200",
              "hover:border-border hover:bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
              selectedProject && "border-primary/50 bg-primary/5"
            )}
          >
            <FolderKanban size={16} className="text-muted-foreground" />
            <span className="truncate flex-1 text-left">{selectedProjectName}</span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[260px] p-0">
          <Command>
            <div className="p-2 border-b border-border/50">
              <div className="flex items-center gap-2 px-3 h-9 rounded-md bg-muted/50 border border-border/50 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {projectSearch && (
                  <button
                    onClick={() => setProjectSearch('')}
                    className="h-4 w-4 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 flex items-center justify-center transition-colors"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            <CommandList>
              <CommandEmpty>No projects found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all"
                  onSelect={() => {
                    onProjectChange(undefined);
                    setIsProjectOpen(false);
                    setProjectSearch('');
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !selectedProject ? "opacity-100" : "opacity-0"
                    )}
                  />
                  All Projects
                </CommandItem>
                {filteredProjects.map((project: any) => (
                  <CommandItem
                    key={project.id}
                    value={project.name}
                    onSelect={() => {
                      onProjectChange(project.id);
                      setIsProjectOpen(false);
                      setProjectSearch('');
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedProject === project.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {project.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Repository Filter - Searchable */}
      <Popover open={isRepoOpen} onOpenChange={setIsRepoOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 min-w-[160px]",
              "bg-background/50 text-sm transition-all duration-200",
              "hover:border-border hover:bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
              selectedRepo && "border-primary/50 bg-primary/5"
            )}
          >
            <GitBranch size={16} className="text-muted-foreground" />
            <span className="truncate flex-1 text-left">{selectedRepoName}</span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[300px] p-0">
          <Command>
            <div className="p-2 border-b border-border/50">
              <div className="flex items-center gap-2 px-3 h-9 rounded-md bg-muted/50 border border-border/50 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  placeholder="Search repositories..."
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {repoSearch && (
                  <button
                    onClick={() => setRepoSearch('')}
                    className="h-4 w-4 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 flex items-center justify-center transition-colors"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            <CommandList>
              <CommandEmpty>No repositories found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all"
                  onSelect={() => {
                    onRepoChange(undefined);
                    setIsRepoOpen(false);
                    setRepoSearch('');
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !selectedRepo ? "opacity-100" : "opacity-0"
                    )}
                  />
                  All Repos
                </CommandItem>
                {filteredRepos.map((repo: any) => (
                  <CommandItem
                    key={repo.id}
                    value={repo.fullName || repo.name}
                    onSelect={() => {
                      onRepoChange(repo.id);
                      setIsRepoOpen(false);
                      setRepoSearch('');
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedRepo === repo.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{repo.name}</span>
                      {repo.fullName && repo.fullName !== repo.name && (
                        <span className="text-xs text-muted-foreground">{repo.fullName}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Clear Project/Repo Filters */}
      {(selectedProject || selectedRepo) && (
        <button
          onClick={() => {
            onProjectChange(undefined);
            onRepoChange(undefined);
          }}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Clear project and repo filters"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
