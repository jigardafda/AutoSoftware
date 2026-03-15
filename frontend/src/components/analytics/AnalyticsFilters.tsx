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

type PresetRange = '7d' | '30d' | '90d' | '1y';

const presets: { value: PresetRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '1y', label: '1Y' },
];

function getPresetDates(preset: PresetRange): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 365;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function detectPreset(dateRange: { startDate: string; endDate: string }): PresetRange | null {
  if (!dateRange.startDate || !dateRange.endDate) return '30d';
  const diff = Math.floor(
    (new Date(dateRange.endDate).getTime() - new Date(dateRange.startDate).getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diff === 7) return '7d';
  if (diff === 30) return '30d';
  if (diff === 90) return '90d';
  if (diff >= 364 && diff <= 366) return '1y';
  return null;
}

export function AnalyticsFilters({
  dateRange,
  onDateRangeChange,
  selectedProject,
  onProjectChange,
  selectedRepo,
  onRepoChange,
}: AnalyticsFiltersProps) {
  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const [isRepoOpen, setIsRepoOpen] = useState(false);
  const [isCustomOpen, setIsCustomOpen] = useState(false);
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

  const filteredProjects = useMemo(() => {
    const list = projects || [];
    if (!projectSearch) return list;
    return list.filter((p: any) => p.name.toLowerCase().includes(projectSearch.toLowerCase()));
  }, [projects, projectSearch]);

  const filteredRepos = useMemo(() => {
    const list = repos || [];
    if (!repoSearch) return list;
    return list.filter((r: any) =>
      r.name?.toLowerCase().includes(repoSearch.toLowerCase()) ||
      r.fullName?.toLowerCase().includes(repoSearch.toLowerCase())
    );
  }, [repos, repoSearch]);

  const selectedProjectName = useMemo(() => {
    if (!selectedProject) return 'All Projects';
    return (projects || []).find((p: any) => p.id === selectedProject)?.name || 'All Projects';
  }, [selectedProject, projects]);

  const selectedRepoName = useMemo(() => {
    if (!selectedRepo) return 'All Repos';
    return (repos || []).find((r: any) => r.id === selectedRepo)?.name || 'All Repos';
  }, [selectedRepo, repos]);

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onDateRangeChange({ startDate: customStart, endDate: customEnd });
      setIsCustomOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Inline date range pills */}
      <div className="flex items-center gap-0.5 p-0.5 bg-muted/60 rounded-lg border border-border/40">
        {presets.map(preset => (
          <button
            key={preset.value}
            onClick={() => onDateRangeChange(getPresetDates(preset.value))}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200",
              currentPreset === preset.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {preset.label}
          </button>
        ))}
        {/* Custom date range */}
        <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "px-2 py-1 text-xs font-medium rounded-md transition-all duration-200",
                currentPreset === null
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Calendar size={12} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Custom Range</p>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-full items-center rounded-md border border-border/50 bg-background/50 px-2 focus-within:border-primary/40 transition-colors">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-transparent text-xs outline-none border-none focus:outline-none focus:ring-0 [color-scheme:light] dark:[color-scheme:dark]"
                  style={{ outline: 'none' }}
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">to</span>
              <div className="flex h-8 w-full items-center rounded-md border border-border/50 bg-background/50 px-2 focus-within:border-primary/40 transition-colors">
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full bg-transparent text-xs outline-none border-none focus:outline-none focus:ring-0 [color-scheme:light] dark:[color-scheme:dark]"
                  style={{ outline: 'none' }}
                />
              </div>
            </div>
            <Button onClick={handleCustomApply} disabled={!customStart || !customEnd} className="w-full mt-2" size="sm">
              Apply
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Project Filter */}
      <Popover open={isProjectOpen} onOpenChange={setIsProjectOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/40 text-xs transition-all duration-200",
              "bg-background/50 hover:border-border hover:bg-background",
              selectedProject && "border-primary/50 bg-primary/5"
            )}
          >
            <FolderKanban size={12} className="text-muted-foreground" />
            <span className="max-w-[100px] truncate hidden sm:inline">{selectedProjectName}</span>
            <ChevronDown size={10} className="text-muted-foreground hidden sm:block" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[240px] p-0">
          <Command>
            <div className="p-1.5 border-b border-border/50">
              <div className="flex items-center gap-1.5 px-2 h-7 rounded-md bg-muted/50 border border-border/50 focus-within:border-primary/50 transition-all">
                <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                <input
                  placeholder="Search..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
                {projectSearch && (
                  <button onClick={() => setProjectSearch('')} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <CommandList>
              <CommandEmpty>No projects found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all"
                  onSelect={() => { onProjectChange(undefined); setIsProjectOpen(false); setProjectSearch(''); }}
                >
                  <Check className={cn("mr-2 h-3 w-3", !selectedProject ? "opacity-100" : "opacity-0")} />
                  All Projects
                </CommandItem>
                {filteredProjects.map((project: any) => (
                  <CommandItem
                    key={project.id}
                    value={project.name}
                    onSelect={() => { onProjectChange(project.id); setIsProjectOpen(false); setProjectSearch(''); }}
                  >
                    <Check className={cn("mr-2 h-3 w-3", selectedProject === project.id ? "opacity-100" : "opacity-0")} />
                    {project.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Repository Filter */}
      <Popover open={isRepoOpen} onOpenChange={setIsRepoOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/40 text-xs transition-all duration-200",
              "bg-background/50 hover:border-border hover:bg-background",
              selectedRepo && "border-primary/50 bg-primary/5"
            )}
          >
            <GitBranch size={12} className="text-muted-foreground" />
            <span className="max-w-[100px] truncate hidden sm:inline">{selectedRepoName}</span>
            <ChevronDown size={10} className="text-muted-foreground hidden sm:block" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[260px] p-0">
          <Command>
            <div className="p-1.5 border-b border-border/50">
              <div className="flex items-center gap-1.5 px-2 h-7 rounded-md bg-muted/50 border border-border/50 focus-within:border-primary/50 transition-all">
                <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                <input
                  placeholder="Search..."
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
                {repoSearch && (
                  <button onClick={() => setRepoSearch('')} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <CommandList>
              <CommandEmpty>No repositories found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all"
                  onSelect={() => { onRepoChange(undefined); setIsRepoOpen(false); setRepoSearch(''); }}
                >
                  <Check className={cn("mr-2 h-3 w-3", !selectedRepo ? "opacity-100" : "opacity-0")} />
                  All Repos
                </CommandItem>
                {filteredRepos.map((repo: any) => (
                  <CommandItem
                    key={repo.id}
                    value={repo.fullName || repo.name}
                    onSelect={() => { onRepoChange(repo.id); setIsRepoOpen(false); setRepoSearch(''); }}
                  >
                    <Check className={cn("mr-2 h-3 w-3", selectedRepo === repo.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{repo.fullName || repo.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Clear filters */}
      {(selectedProject || selectedRepo) && (
        <button
          onClick={() => { onProjectChange(undefined); onRepoChange(undefined); }}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Clear filters"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
