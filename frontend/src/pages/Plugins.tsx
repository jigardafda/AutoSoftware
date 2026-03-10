import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Puzzle,
  Plus,
  Search,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  Settings2,
  Check,
  Globe,
  FolderKanban,
  Package,
  Store,
} from "lucide-react";
import { api } from "@/lib/api";
import { RefreshButton } from "@/components/RefreshButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  repoUrl: string;
  iconUrl?: string;
  category?: string;
  tags?: string[];
  marketplaceId: string;
  marketplaceName: string;
  installed: boolean;
  installedScope?: string;
  installedProjectId?: string;
}

interface InstalledPlugin {
  id: string;
  pluginId: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  repoUrl: string;
  iconUrl?: string;
  scope: "global" | "project";
  projectId?: string;
  project?: { id: string; name: string };
  isEnabled: boolean;
  skillsEnabled: boolean;
  agentsEnabled: boolean;
  hooksEnabled: boolean;
  mcpEnabled: boolean;
  manifest: any;
  lastSyncedAt?: string;
  lastError?: string;
  createdAt: string;
}

function PluginCard({
  plugin,
  installed,
  onInstall,
  installing,
}: {
  plugin: MarketplacePlugin;
  installed: boolean;
  onInstall: (plugin: MarketplacePlugin) => void;
  installing: boolean;
}) {
  return (
    <Card className="group relative overflow-hidden transition-all hover:shadow-md hover:border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {plugin.iconUrl ? (
              <img
                src={plugin.iconUrl}
                alt={plugin.name}
                className="h-10 w-10 rounded-lg object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Puzzle className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{plugin.name}</CardTitle>
              {plugin.author && (
                <p className="text-xs text-muted-foreground">by {plugin.author}</p>
              )}
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            v{plugin.version}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <CardDescription className="line-clamp-2 text-sm">
          {plugin.description}
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {plugin.category && (
            <Badge variant="outline" className="text-xs font-normal capitalize">
              {plugin.category}
            </Badge>
          )}
          {plugin.tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <div className="flex items-center justify-between w-full">
          <a
            href={plugin.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            Source
          </a>
          {installed ? (
            <Badge variant="default" className="bg-green-600 hover:bg-green-600">
              <Check className="h-3 w-3 mr-1" />
              Installed
            </Badge>
          ) : (
            <Button
              size="sm"
              onClick={() => onInstall(plugin)}
              disabled={installing}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Install
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function InstalledPluginRow({
  plugin,
  onToggle,
  onUninstall,
  onSync,
}: {
  plugin: InstalledPlugin;
  onToggle: (id: string, enabled: boolean) => void;
  onUninstall: (id: string) => void;
  onSync: (id: string) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {plugin.iconUrl ? (
            <img
              src={plugin.iconUrl}
              alt={plugin.name}
              className="h-10 w-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Puzzle className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium truncate">{plugin.name}</h4>
              <Badge variant="outline" className="text-xs shrink-0">
                v{plugin.version}
              </Badge>
              {plugin.scope === "global" ? (
                <Badge variant="secondary" className="text-xs shrink-0">
                  <Globe className="h-3 w-3 mr-1" />
                  Global
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs shrink-0">
                  <FolderKanban className="h-3 w-3 mr-1" />
                  {plugin.project?.name || "Project"}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {plugin.description}
            </p>
            {plugin.lastError && (
              <p className="text-xs text-destructive mt-1">{plugin.lastError}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Switch
            checked={plugin.isEnabled}
            onCheckedChange={(checked) => onToggle(plugin.id, checked)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings2 className="h-4 w-4" />
                Configure
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSync(plugin.id)}>
                <RefreshCw className="h-4 w-4" />
                Sync Manifest
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => window.open(plugin.repoUrl, "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
                View Source
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onUninstall(plugin.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Uninstall
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Settings Dialog */}
      <PluginSettingsDialog
        plugin={plugin}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </>
  );
}

function PluginSettingsDialog({
  plugin,
  open,
  onOpenChange,
}: {
  plugin: InstalledPlugin;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    skillsEnabled: plugin.skillsEnabled,
    agentsEnabled: plugin.agentsEnabled,
    hooksEnabled: plugin.hooksEnabled,
    mcpEnabled: plugin.mcpEnabled,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.plugins.update(plugin.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins", "installed"] });
      toast.success("Plugin settings updated");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const manifest = plugin.manifest as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {plugin.name}</DialogTitle>
          <DialogDescription>
            Enable or disable specific plugin components
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {manifest?.skills?.length > 0 && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Skills</p>
                <p className="text-xs text-muted-foreground">
                  {manifest.skills.length} skill(s) available
                </p>
              </div>
              <Switch
                checked={settings.skillsEnabled}
                onCheckedChange={(checked) =>
                  setSettings((s) => ({ ...s, skillsEnabled: checked }))
                }
              />
            </div>
          )}

          {manifest?.agents?.length > 0 && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Agents</p>
                <p className="text-xs text-muted-foreground">
                  {manifest.agents.length} agent(s) available
                </p>
              </div>
              <Switch
                checked={settings.agentsEnabled}
                onCheckedChange={(checked) =>
                  setSettings((s) => ({ ...s, agentsEnabled: checked }))
                }
              />
            </div>
          )}

          {manifest?.hooks?.length > 0 && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Hooks</p>
                <p className="text-xs text-muted-foreground">
                  {manifest.hooks.length} hook(s) available
                </p>
              </div>
              <Switch
                checked={settings.hooksEnabled}
                onCheckedChange={(checked) =>
                  setSettings((s) => ({ ...s, hooksEnabled: checked }))
                }
              />
            </div>
          )}

          {manifest?.mcp_servers?.length > 0 && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">MCP Servers</p>
                <p className="text-xs text-muted-foreground">
                  {manifest.mcp_servers.length} server(s) available
                </p>
              </div>
              <Switch
                checked={settings.mcpEnabled}
                onCheckedChange={(checked) =>
                  setSettings((s) => ({ ...s, mcpEnabled: checked }))
                }
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate(settings)}
            disabled={updateMutation.isPending}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InstallDialog({
  plugin,
  open,
  onOpenChange,
  onInstall,
}: {
  plugin: MarketplacePlugin | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (scope: string, projectId?: string) => void;
}) {
  const [scope, setScope] = useState<"global" | "project">("global");
  const [projectId, setProjectId] = useState<string>("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
    enabled: open,
  });

  if (!plugin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Install {plugin.name}</DialogTitle>
          <DialogDescription>
            Choose where to install this plugin
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Installation Scope</label>
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as "global" | "project")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Global - Available everywhere
                  </div>
                </SelectItem>
                <SelectItem value="project">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4" />
                    Project - Scoped to one project
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "project" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Project</label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onInstall(scope, scope === "project" ? projectId : undefined)}
            disabled={scope === "project" && !projectId}
          >
            <Download className="h-4 w-4 mr-1" />
            Install Plugin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMarketplaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const addMutation = useMutation({
    mutationFn: () => api.plugins.addMarketplace({ name, url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins", "marketplaces"] });
      queryClient.invalidateQueries({ queryKey: ["plugins", "browse"] });
      toast.success("Marketplace added");
      onOpenChange(false);
      setName("");
      setUrl("");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Plugin Marketplace</DialogTitle>
          <DialogDescription>
            Add a custom marketplace to discover more plugins
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="My Custom Marketplace"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Marketplace URL</label>
            <Input
              placeholder="https://example.com/marketplace.json"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              URL to a JSON file following the marketplace format
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!name || !url || addMutation.isPending}
          >
            Add Marketplace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Plugins() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [installPlugin, setInstallPlugin] = useState<MarketplacePlugin | null>(null);
  const [addMarketplaceOpen, setAddMarketplaceOpen] = useState(false);

  // Queries
  const { data: marketplaces = [], isLoading: loadingMarketplaces } = useQuery({
    queryKey: ["plugins", "marketplaces"],
    queryFn: api.plugins.listMarketplaces,
  });

  const { data: availablePlugins = [], isLoading: loadingBrowse } = useQuery({
    queryKey: ["plugins", "browse", search],
    queryFn: () => api.plugins.browse({ search: search || undefined }),
    enabled: marketplaces.length > 0,
  });

  const { data: installedPlugins = [], isLoading: loadingInstalled } = useQuery({
    queryKey: ["plugins", "installed"],
    queryFn: () => api.plugins.listInstalled(),
  });

  // Mutations
  const addOfficialMutation = useMutation({
    mutationFn: api.plugins.addOfficialMarketplace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins", "marketplaces"] });
      queryClient.invalidateQueries({ queryKey: ["plugins", "browse"] });
      toast.success("Official marketplace added");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const installMutation = useMutation({
    mutationFn: (data: { pluginId: string; repoUrl: string; scope: string; projectId?: string }) =>
      api.plugins.install(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast.success("Plugin installed successfully");
      setInstallPlugin(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.plugins.update(id, { isEnabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins", "installed"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: api.plugins.uninstall,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast.success("Plugin uninstalled");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const syncMutation = useMutation({
    mutationFn: api.plugins.sync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins", "installed"] });
      toast.success("Plugin synced");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleInstall = (scope: string, projectId?: string) => {
    if (!installPlugin) return;
    installMutation.mutate({
      pluginId: installPlugin.id,
      repoUrl: installPlugin.repoUrl,
      scope,
      projectId,
    });
  };

  const hasNoMarketplaces = marketplaces.length === 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Plugins</h2>
          <RefreshButton queryKeys={["plugins"]} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAddMarketplaceOpen(true)}>
            <Store className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Add Marketplace</span>
          </Button>
        </div>
      </div>

      {/* No marketplaces state */}
      {hasNoMarketplaces && !loadingMarketplaces ? (
        <div className="rounded-lg border bg-card p-8">
          <EmptyState
            icon={Store}
            title="No plugin marketplaces"
            description="Add a marketplace to discover and install plugins"
            action={
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => addOfficialMutation.mutate()}>
                  <Package className="h-4 w-4 mr-1" />
                  Add Official Marketplace
                </Button>
                <Button variant="outline" onClick={() => setAddMarketplaceOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Custom Marketplace
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <Tabs defaultValue="browse" className="space-y-4">
          <TabsList>
            <TabsTrigger value="browse" className="gap-2">
              <Search className="h-4 w-4" />
              Browse
              {availablePlugins.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {availablePlugins.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="installed" className="gap-2">
              <Package className="h-4 w-4" />
              Installed
              {installedPlugins.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {installedPlugins.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="marketplaces" className="gap-2">
              <Store className="h-4 w-4" />
              Marketplaces
            </TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search plugins..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {loadingBrowse ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4 mt-2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : availablePlugins.length === 0 ? (
              <EmptyState
                icon={Puzzle}
                title={search ? "No plugins found" : "No plugins available"}
                description={
                  search
                    ? "Try a different search term"
                    : "Plugins from your marketplaces will appear here"
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {availablePlugins.map((plugin: MarketplacePlugin) => (
                  <PluginCard
                    key={`${plugin.marketplaceId}-${plugin.id}`}
                    plugin={plugin}
                    installed={plugin.installed}
                    onInstall={setInstallPlugin}
                    installing={installMutation.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Installed Tab */}
          <TabsContent value="installed" className="space-y-4">
            {loadingInstalled ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-6 w-10 rounded-full" />
                  </div>
                ))}
              </div>
            ) : installedPlugins.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No plugins installed"
                description="Browse available plugins to extend functionality"
              />
            ) : (
              <div className="space-y-3">
                {installedPlugins.map((plugin: InstalledPlugin) => (
                  <InstalledPluginRow
                    key={plugin.id}
                    plugin={plugin}
                    onToggle={(id, enabled) => toggleMutation.mutate({ id, enabled })}
                    onUninstall={(id) => uninstallMutation.mutate(id)}
                    onSync={(id) => syncMutation.mutate(id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Marketplaces Tab */}
          <TabsContent value="marketplaces" className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setAddMarketplaceOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Marketplace
              </Button>
            </div>

            {loadingMarketplaces ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                  </div>
                ))}
              </div>
            ) : marketplaces.length === 0 ? (
              <EmptyState
                icon={Store}
                title="No marketplaces configured"
                description="Add a marketplace to discover plugins"
                action={
                  <Button onClick={() => addOfficialMutation.mutate()}>
                    <Package className="h-4 w-4 mr-1" />
                    Add Official Marketplace
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {marketplaces.map((marketplace: any) => (
                  <div
                    key={marketplace.id}
                    className="flex items-center gap-4 p-4 border rounded-lg"
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Store className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{marketplace.name}</h4>
                        {marketplace.isOfficial && (
                          <Badge variant="default" className="text-xs">
                            Official
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {marketplace.url}
                      </p>
                      {marketplace.lastFetched && (
                        <p className="text-xs text-muted-foreground">
                          Last updated:{" "}
                          {new Date(marketplace.lastFetched).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        api.plugins.removeMarketplace(marketplace.id).then(() => {
                          queryClient.invalidateQueries({ queryKey: ["plugins"] });
                          toast.success("Marketplace removed");
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Dialogs */}
      <InstallDialog
        plugin={installPlugin}
        open={!!installPlugin}
        onOpenChange={(open) => !open && setInstallPlugin(null)}
        onInstall={handleInstall}
      />
      <AddMarketplaceDialog
        open={addMarketplaceOpen}
        onOpenChange={setAddMarketplaceOpen}
      />
    </div>
  );
}
