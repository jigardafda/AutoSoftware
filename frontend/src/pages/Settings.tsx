import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Sun,
  Moon,
  Monitor,
  Github,
  GitlabIcon,
  DollarSign,
  Key,
  Check,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddApiKeyDialog } from "@/components/settings/AddApiKeyDialog";
import { IntegrationsTab } from "@/components/integrations/IntegrationsTab";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "github":
      return <Github className="h-5 w-5" />;
    case "gitlab":
      return <GitlabIcon className="h-5 w-5 text-orange-400" />;
    case "bitbucket":
      return (
        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.65 3C2.3 3 2 3.3 2 3.65v.12l2.73 16.5c.07.42.43.73.85.73h13.05c.31 0 .58-.24.63-.55L22 3.77v-.12c0-.35-.3-.65-.65-.65H2.65zM14.1 14.95H9.94L8.81 9.07h6.3l-1.01 5.88z" />
        </svg>
      );
    default:
      return null;
  }
}

function ProfileTab() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information from OAuth.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.avatarUrl || undefined} alt={user?.name || "User"} />
              <AvatarFallback className="text-lg">
                {getInitials(user?.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-medium">{user?.name || "No name"}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Providers</CardTitle>
          <CardDescription>
            Manage your connected source code providers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {["github", "gitlab", "bitbucket"].map((provider) => {
              const connected = user?.providers.includes(provider);
              return (
                <div
                  key={provider}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-3">
                    <ProviderIcon provider={provider} />
                    <span className="font-medium capitalize">{provider}</span>
                  </div>
                  {connected ? (
                    <Badge
                      variant="secondary"
                      className="bg-green-500/10 text-green-500 border-green-500/20"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/auth/login/${provider}`}>Connect</a>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesTab() {
  const { theme, setTheme } = useTheme();

  const themeOptions = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose your preferred color theme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const selected = theme === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:bg-muted/50",
                    selected
                      ? "border-primary bg-muted/30"
                      : "border-transparent bg-muted/10"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6",
                      selected ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      selected ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {option.label}
                  </span>
                  {selected && (
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ApiKeyItem {
  id: string;
  label: string;
  keyPrefix: string;
  priority: number;
  isActive: boolean;
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  usageCount: number;
}

interface UsageData {
  daily: { date: string; cost: number; input: number; output: number; count: number }[];
  byModel: { model: string; cost: number; input: number; output: number; count: number }[];
  bySource: { source: string; cost: number; count: number }[];
  totalCost: number;
  totalRequests: number;
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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function KeyUsageDetail({ keyId }: { keyId: string }) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.apiKeys.usage(keyId, 30).then(setUsage).catch(() => {}).finally(() => setLoading(false));
  }, [keyId]);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!usage || usage.totalRequests === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">No usage data in the last 30 days.</div>
    );
  }

  return (
    <div className="space-y-4 p-4 border-t">
      {/* Daily cost chart */}
      {usage.daily.length > 1 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Daily Cost (30d)</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usage.daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) => d.slice(5)}
                  className="text-muted-foreground"
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(2)}`} className="text-muted-foreground" />
                <Tooltip
                  formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]}
                  labelFormatter={(label) => String(label)}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* By model */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">By Model</p>
          <div className="space-y-1">
            {usage.byModel.map((m) => (
              <div key={m.model} className="flex justify-between text-xs">
                <span className="truncate font-mono">{m.model.replace("claude-", "").replace(/-\d{8}$/, "")}</span>
                <span className="text-muted-foreground">{formatCost(m.cost)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By source */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">By Source</p>
          <div className="space-y-1">
            {usage.bySource.map((s) => (
              <div key={s.source} className="flex justify-between text-xs">
                <span className="capitalize">{s.source}</span>
                <span className="text-muted-foreground">{formatCost(s.cost)} ({s.count})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiTab() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await api.apiKeys.list();
      setKeys(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.apiKeys.update(id, { isActive });
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, isActive } : k))
      );
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await api.apiKeys.delete(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setDeleteConfirm(null);
      toast.success("API key deleted");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleMove = async (id: string, direction: "up" | "down") => {
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= keys.length) return;

    const newKeys = [...keys];
    [newKeys[idx], newKeys[newIdx]] = [newKeys[newIdx], newKeys[idx]];
    setKeys(newKeys);

    setReordering(true);
    try {
      await api.apiKeys.reorder(newKeys.map((k) => k.id));
    } catch (err: any) {
      toast.error(err.message);
      fetchKeys(); // revert on error
    } finally {
      setReordering(false);
    }
  };

  const totalCost = keys.reduce((sum, k) => sum + k.totalCost, 0);

  return (
    <div className="space-y-6">
      {/* API Keys Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                Manage your Anthropic API keys. Keys are used in priority order.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-1">No API keys configured</p>
              <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                Environment fallback active
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">
                Add a key above or the system will use the ANTHROPIC_API_KEY from .env
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map((key, idx) => (
                <div key={key.id}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                      key.lastError && "border-red-500/30 bg-red-500/5",
                      !key.isActive && "opacity-60"
                    )}
                  >
                    {/* Priority arrows */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMove(key.id, "up")}
                        disabled={idx === 0 || reordering}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleMove(key.id, "down")}
                        disabled={idx === keys.length - 1 || reordering}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Key info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{key.label}</span>
                        {idx === 0 && key.isActive && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Primary
                          </Badge>
                        )}
                        {key.lastError && (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <code className="text-xs text-muted-foreground font-mono">
                          {key.keyPrefix}
                        </code>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(key.lastUsedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Cost */}
                    <div className="text-right mr-2 hidden sm:block">
                      <p className="text-sm font-medium">{formatCost(key.totalCost)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatTokens(key.totalInputTokens + key.totalOutputTokens)} tokens
                      </p>
                    </div>

                    {/* Toggle */}
                    <Switch
                      checked={key.isActive}
                      onCheckedChange={(checked) => handleToggleActive(key.id, checked)}
                    />

                    {/* Expand */}
                    <button
                      onClick={() => setExpandedKey(expandedKey === key.id ? null : key.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          expandedKey === key.id && "rotate-90"
                        )}
                      />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteConfirm(key.id)}
                      className="text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Expanded usage detail */}
                  {expandedKey === key.id && <KeyUsageDetail keyId={key.id} />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Summary */}
      {keys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Usage Summary
            </CardTitle>
            <CardDescription>
              Total estimated spend across all keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground mb-1">Total Spend</p>
                <p className="text-2xl font-semibold">{formatCost(totalCost)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground mb-1">Active Keys</p>
                <p className="text-2xl font-semibold">{keys.filter((k) => k.isActive).length}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground mb-1">Total Requests</p>
                <p className="text-2xl font-semibold">
                  {keys.reduce((s, k) => s + k.usageCount, 0)}
                </p>
              </div>
            </div>

            {/* Per-key cost breakdown */}
            {keys.some((k) => k.totalCost > 0) && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Per-Key Breakdown</p>
                <div className="space-y-2">
                  {keys.filter((k) => k.totalCost > 0).map((key) => {
                    const pct = totalCost > 0 ? (key.totalCost / totalCost) * 100 : 0;
                    return (
                      <div key={key.id} className="flex items-center gap-3">
                        <span className="text-sm min-w-[100px] truncate">{key.label}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground min-w-[60px] text-right">
                          {formatCost(key.totalCost)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Budget Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Usage Budgets
          </CardTitle>
          <CardDescription>
            Maximum spend limits per operation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground mb-1">Scan Budget</p>
              <p className="text-2xl font-semibold">$2.00</p>
              <p className="text-xs text-muted-foreground mt-1">per scan</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground mb-1">Task Budget</p>
              <p className="text-2xl font-semibold">$10.00</p>
              <p className="text-xs text-muted-foreground mt-1">per task</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Key Dialog */}
      <AddApiKeyDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onKeyAdded={fetchKeys}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              This will permanently delete this API key and all its usage records. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-9 w-72" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const VALID_TABS = ["profile", "preferences", "api", "integrations"] as const;

export function SettingsPage() {
  const { loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => {
    const t = searchParams.get("tab");
    return VALID_TABS.includes(t as any) ? t! : "profile";
  }, [searchParams]);

  if (loading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Settings</h2>

      <Tabs
        value={tab}
        onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>

        <TabsContent value="api">
          <ApiTab />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
