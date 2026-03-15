import { useCallback, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  ArrowLeft,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Ban,
  ExternalLink,
  MessageSquare,
  Github,
  GitlabIcon,
  FolderKanban,
  FileText,
  GitBranch,
  Unplug,
  Link2,
  Import,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination, paginate } from "@/components/Pagination";
import { RefreshButton } from "@/components/RefreshButton";
import { TaskKanbanBoard } from "@/components/tasks/TaskKanbanBoard";
import { TaskViewToolbar, type TaskViewMode } from "@/components/tasks/TaskViewToolbar";
import { AddRepoToProjectDialog } from "@/components/projects/AddRepoToProjectDialog";
import { DocumentEditor } from "@/components/projects/DocumentEditor";
import { ProviderIcon } from "@/components/integrations/ProviderIcon";
import { LinkExternalProjectDialog } from "@/components/integrations/LinkExternalProjectDialog";
import { ImportItemsSheet } from "@/components/integrations/ImportItemsSheet";
import { ConfirmDeleteDialog as IntegrationDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmbedConfigTab } from "@/components/projects/EmbedConfigTab";
import { EmbedSubmissionsTable } from "@/components/projects/EmbedSubmissionsTable";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return cost > 0 ? "<$0.01" : "$0.00";
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "scanning":
      return (
        <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/20">
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Scanning
        </Badge>
      );
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="secondary">Idle</Badge>;
  }
}

const STATUS_ICON: Record<string, { icon: React.ElementType; className: string }> = {
  pending: { icon: Clock, className: "text-muted-foreground" },
  in_progress: { icon: Loader2, className: "text-blue-500 animate-spin" },
  completed: { icon: CheckCircle2, className: "text-green-500" },
  failed: { icon: XCircle, className: "text-red-500" },
  cancelled: { icon: Ban, className: "text-muted-foreground" },
  planning: { icon: Loader2, className: "text-amber-500 animate-spin" },
  awaiting_input: { icon: MessageSquare, className: "text-amber-600" },
  planned: { icon: CheckCircle2, className: "text-cyan-500" },
};

const TYPE_COLOR: Record<string, string> = {
  improvement: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  bugfix: "bg-red-500/10 text-red-500 border-red-500/20",
  feature: "bg-green-500/10 text-green-500 border-green-500/20",
  refactor: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  security: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
};

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
const BAR_COLORS: Record<string, string> = {
  pending: "#94a3b8",
  in_progress: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
  cancelled: "#6b7280",
};

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [tasksPage, setTasksPage] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [importLink, setImportLink] = useState<any>(null);
  const [editingDefaultBranch, setEditingDefaultBranch] = useState(false);
  const [defaultBranchValue, setDefaultBranchValue] = useState("");
  const [editingRepoBranch, setEditingRepoBranch] = useState<string | null>(null);
  const [repoBranchValue, setRepoBranchValue] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>(() => {
    return (localStorage.getItem("project-tasks-view-mode") as TaskViewMode) || "list";
  });

  const handleTaskViewModeChange = useCallback((mode: TaskViewMode) => {
    setTaskViewMode(mode);
    localStorage.setItem("project-tasks-view-mode", mode);
  }, []);

  const VALID_TABS = ["overview", "repos", "documents", "tasks", "integrations", "usage", "embed"] as const;
  const tab = useMemo(() => {
    const t = searchParams.get("tab");
    return VALID_TABS.includes(t as any) ? t! : "overview";
  }, [searchParams]);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.projects.get(id!),
    enabled: !!id,
  });

  const { data: stats } = useQuery({
    queryKey: ["project-stats", id],
    queryFn: () => api.projects.stats(id!),
    enabled: !!id,
  });

  const { data: projectTasks = [] } = useQuery({
    queryKey: ["tasks", { projectId: id }],
    queryFn: () => api.tasks.list({ projectId: id! }),
    enabled: !!id,
  });

  const { data: integrationLinks = [], refetch: refetchLinks } = useQuery({
    queryKey: ["integration-links", id],
    queryFn: () => api.integrations.projectLinks(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (body: { name?: string; description?: string; defaultBranch?: string | null }) =>
      api.projects.update(id!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditingName(false);
      toast.success("Project updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.projects.delete(id!),
    onSuccess: () => {
      toast.success("Project deleted");
      navigate("/projects");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeRepoMutation = useMutation({
    mutationFn: (repoId: string) => api.projects.removeRepo(id!, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Repository removed from project");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateRepoBranchMutation = useMutation({
    mutationFn: ({ repoId, branchOverride }: { repoId: string; branchOverride: string | null }) =>
      api.projects.updateRepo(id!, repoId, { branchOverride }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      setEditingRepoBranch(null);
      toast.success("Branch override updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createDocMutation = useMutation({
    mutationFn: () => api.projects.documents.create(id!, { title: "Untitled Document" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      toast.success("Document created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reorderMutation = useMutation({
    mutationFn: ({ docId, sortOrder }: { docId: string; sortOrder: number }) =>
      api.projects.documents.update(id!, docId, { sortOrder }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => api.integrations.deleteLink(linkId),
    onSuccess: () => {
      refetchLinks();
      toast.success("Link removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const existingRepoIds = new Set<string>(project?.repos?.map((r: any) => r.id) || []);

  const filteredProjectTasks = useMemo(() => {
    if (!taskSearch.trim()) return projectTasks;
    const q = taskSearch.toLowerCase();
    return projectTasks.filter((t: any) =>
      t.title?.toLowerCase().includes(q) ||
      t.repositoryName?.toLowerCase().includes(q) ||
      t.type?.toLowerCase().includes(q) ||
      t.targetBranch?.toLowerCase().includes(q)
    );
  }, [projectTasks, taskSearch]);

  const pagedTasks = paginate(filteredProjectTasks, tasksPage);

  const totalTasks = stats?.totalTasks ?? 0;
  const totalCost = stats?.usage?.totalCost ?? 0;

  const handleSwap = useCallback((docs: any[], idx: number, dir: "up" | "down") => {
    const otherIdx = dir === "up" ? idx - 1 : idx + 1;
    if (otherIdx < 0 || otherIdx >= docs.length) return;
    reorderMutation.mutate({ docId: docs[idx].id, sortOrder: docs[otherIdx].sortOrder });
    reorderMutation.mutate({ docId: docs[otherIdx].id, sortOrder: docs[idx].sortOrder });
  }, [reorderMutation]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="link" onClick={() => navigate("/projects")}>Back to Projects</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/projects")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FolderKanban className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            {editingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (nameValue.trim()) updateMutation.mutate({ name: nameValue });
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-8 text-lg font-semibold"
                  autoFocus
                />
                <Button type="submit" size="sm" variant="outline">Save</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
              </form>
            ) : (
              <h2
                className="text-lg font-semibold truncate cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={() => {
                  setNameValue(project.name);
                  setEditingName(true);
                }}
              >
                {project.name}
              </h2>
            )}
            {project.description && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">{project.description}</p>
            )}
            {/* Default Branch Badge */}
            <div className="flex items-center gap-2 mt-1">
              {editingDefaultBranch ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateMutation.mutate({ defaultBranch: defaultBranchValue || null });
                    setEditingDefaultBranch(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={defaultBranchValue}
                    onChange={(e) => setDefaultBranchValue(e.target.value)}
                    placeholder="e.g., develop"
                    className="h-6 w-32 text-xs"
                    autoFocus
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-6 text-xs">Save</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingDefaultBranch(false)}>Cancel</Button>
                </form>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => {
                    setDefaultBranchValue(project.defaultBranch || "");
                    setEditingDefaultBranch(true);
                  }}
                >
                  <GitBranch className="h-3 w-3" />
                  {project.defaultBranch || "No default branch"}
                  <Pencil className="h-2.5 w-2.5 ml-1 text-muted-foreground" />
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RefreshButton queryKeys={[["project-stats", id]]} />
          <ConfirmDeleteDialog
            title="Delete project"
            description="This will permanently delete this project. Repositories will not be affected."
            onConfirm={() => deleteMutation.mutate()}
            trigger={
              <Button size="sm" variant="destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Repositories</p>
            <p className="text-2xl font-semibold">{project.repoCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Tasks</p>
            <p className="text-2xl font-semibold">{totalTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Documents</p>
            <p className="text-2xl font-semibold">{project.docCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Estimated Cost</p>
            <p className="text-2xl font-semibold">{formatCost(totalCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="repos">Repos ({project.repoCount})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({project.docCount})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({totalTasks})</TabsTrigger>
          <TabsTrigger value="integrations">Integrations ({integrationLinks.length})</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="embed">Embed</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tasks by Status</CardTitle>
              </CardHeader>
              <CardContent>
                {!stats?.tasksByStatus?.length ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No tasks yet</p>
                ) : (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.tasksByStatus} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {stats.tasksByStatus.map((entry: any, i: number) => (
                            <Cell key={i} fill={BAR_COLORS[entry.status] || "#94a3b8"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tasks by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {!stats?.tasksByType?.length ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No tasks yet</p>
                ) : (
                  <div className="h-48 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.tasksByType}
                          dataKey="count"
                          nameKey="type"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          stroke="var(--background)"
                          label={({ x, y, textAnchor, ...rest }: any) => (
                            <text x={x} y={y} textAnchor={textAnchor} fill="var(--foreground)" fontSize={12}>
                              {`${rest.type} (${rest.count})`}
                            </text>
                          )}
                          labelLine={false}
                        >
                          {stats.tasksByType.map((_: any, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {stats?.usage?.daily?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Daily Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.usage.daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                      <Tooltip formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]} />
                      <Area type="monotone" dataKey="cost" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Repos Tab */}
        <TabsContent value="repos" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAddRepoOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Repository
            </Button>
          </div>
          {!project.repos?.length ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No repositories added yet. Add repos to group them under this project.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repository</TableHead>
                    <TableHead className="w-20">Provider</TableHead>
                    <TableHead className="w-36">Branch</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="w-24">Last Scanned</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.repos.map((repo: any) => (
                    <TableRow key={repo.id} className="cursor-pointer" onClick={() => navigate(`/repos/${repo.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {repo.provider === "github" ? (
                            <Github className="h-4 w-4 shrink-0" />
                          ) : repo.provider === "gitlab" ? (
                            <GitlabIcon className="h-4 w-4 text-orange-400 shrink-0" />
                          ) : (
                            <GitBranch className="h-4 w-4 shrink-0" />
                          )}
                          <span className="font-medium truncate">{repo.fullName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{{ github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" }[repo.provider] ?? repo.provider}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {editingRepoBranch === repo.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              updateRepoBranchMutation.mutate({
                                repoId: repo.id,
                                branchOverride: repoBranchValue || null,
                              });
                            }}
                            className="flex items-center gap-1"
                          >
                            <Input
                              value={repoBranchValue}
                              onChange={(e) => setRepoBranchValue(e.target.value)}
                              placeholder={project.defaultBranch || repo.defaultBranch}
                              className="h-6 w-24 text-xs"
                              autoFocus
                            />
                            <Button type="submit" size="sm" variant="ghost" className="h-6 w-6 p-0">
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingRepoBranch(null)}>
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </form>
                        ) : (
                          <div
                            className="flex items-center gap-1 cursor-pointer group"
                            onClick={() => {
                              setRepoBranchValue(repo.branchOverride || "");
                              setEditingRepoBranch(repo.id);
                            }}
                          >
                            <GitBranch className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{repo.effectiveBranch}</span>
                            {repo.branchOverride && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">override</Badge>
                            )}
                            <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={repo.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{relativeTime(repo.lastScannedAt)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRepoMutation.mutate(repo.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => createDocMutation.mutate()} disabled={createDocMutation.isPending}>
              {createDocMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Document
            </Button>
          </div>
          {!project.documents?.length ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                No documents yet. Add context documents to guide AI analysis of your repos.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {project.documents.map((doc: any, idx: number) => (
                <DocumentEditor
                  key={doc.id}
                  projectId={id!}
                  document={doc}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < project.documents.length - 1}
                  onMoveUp={() => handleSwap(project.documents, idx, "up")}
                  onMoveDown={() => handleSwap(project.documents, idx, "down")}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-3">
          {projectTasks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No tasks found for this project's repositories.
              </CardContent>
            </Card>
          ) : (
            <>
              <TaskViewToolbar
                search={taskSearch}
                onSearchChange={setTaskSearch}
                viewMode={taskViewMode}
                onViewModeChange={handleTaskViewModeChange}
              />

              {filteredProjectTasks.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No tasks match "{taskSearch}".
                    <button
                      className="ml-1 text-primary underline underline-offset-2 hover:text-primary/80"
                      onClick={() => setTaskSearch("")}
                    >
                      Clear search
                    </button>
                  </CardContent>
                </Card>
              ) : taskViewMode === "kanban" ? (
                <TaskKanbanBoard
                  tasks={filteredProjectTasks}
                  onTaskClick={(task) => navigate(`/tasks/${task.id}`)}
                />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">Status</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead className="w-20">Type</TableHead>
                          <TableHead className="w-20">Priority</TableHead>
                          <TableHead className="w-16">Source</TableHead>
                          <TableHead className="w-8">PR</TableHead>
                          <TableHead className="w-20 text-right">Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedTasks.map((task: any) => {
                          const statusCfg = STATUS_ICON[task.status] || STATUS_ICON.pending;
                          const Icon = statusCfg.icon;
                          return (
                            <TableRow key={task.id} className="cursor-pointer" onClick={() => navigate(`/tasks/${task.id}`)}>
                              <TableCell><Icon className={cn("h-4 w-4", statusCfg.className)} /></TableCell>
                              <TableCell>
                                <p className="text-sm font-medium truncate max-w-[300px]">{task.title}</p>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", TYPE_COLOR[task.type])}>
                                  {task.type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLOR[task.priority])}>
                                  {task.priority}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">{task.source === "auto_scan" ? "Auto" : "Manual"}</span>
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                {task.pullRequestUrl ? (
                                  <a href={task.pullRequestUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground/40">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{relativeTime(task.createdAt)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination page={tasksPage} total={filteredProjectTasks.length} onPageChange={setTasksPage} />
                </>
              )}
            </>
          )}
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setLinkDialogOpen(true)}>
              <Link2 className="h-4 w-4" />
              Link External Source
            </Button>
          </div>
          {integrationLinks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                <Unplug className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                No external sources linked. Connect and link a Jira project, Sentry project, or other source.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {integrationLinks.map((link: any) => (
                <div key={link.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <ProviderIcon provider={link.integration?.provider} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {link.integration?.displayName}: {link.externalProjectName}
                    </p>
                    {link.externalProjectUrl && (
                      <a href={link.externalProjectUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        {link.externalProjectKey || link.externalProjectUrl}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {link.importCount} imported
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setImportLink(link)}
                  >
                    <Import className="h-3.5 w-3.5 mr-1" />
                    Browse & Import
                  </Button>
                  <IntegrationDeleteDialog
                    title="Unlink external source"
                    description="This will remove the link. Imported tasks will not be deleted."
                    onConfirm={() => unlinkMutation.mutate(link.id)}
                    trigger={
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                        <Unplug className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-2xl font-semibold">{formatCost(stats?.usage?.totalCost ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Tokens</p>
                <p className="text-2xl font-semibold">
                  {formatTokens((stats?.usage?.totalInputTokens ?? 0) + (stats?.usage?.totalOutputTokens ?? 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">API Requests</p>
                <p className="text-2xl font-semibold">{stats?.usage?.totalRequests ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          {stats?.usage?.daily?.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Daily Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.usage.daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                      <Tooltip formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]} />
                      <Area type="monotone" dataKey="cost" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No usage data tracked yet.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Embed Tab */}
        <TabsContent value="embed" className="space-y-6">
          <EmbedConfigTab projectId={id!} />
          <EmbedSubmissionsTable
            projectId={id!}
            repositories={project.repos?.map((r: any) => ({ id: r.id, fullName: r.fullName })) || []}
          />
        </TabsContent>
      </Tabs>

      <AddRepoToProjectDialog
        projectId={id!}
        existingRepoIds={existingRepoIds}
        open={addRepoOpen}
        onOpenChange={setAddRepoOpen}
      />

      <LinkExternalProjectDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        projectId={id!}
        onLinked={() => refetchLinks()}
      />

      {importLink && (
        <ImportItemsSheet
          open={!!importLink}
          onOpenChange={(open) => !open && setImportLink(null)}
          link={importLink}
          repos={project.repos || []}
          onImported={() => {
            refetchLinks();
            queryClient.invalidateQueries({ queryKey: ["tasks", { projectId: id }] });
          }}
        />
      )}
    </div>
  );
}
