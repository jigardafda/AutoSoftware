import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Check,
  Loader2,
  DollarSign,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PersonalizationSettings } from "@/components/settings/PersonalizationSettings";
import { AgentModelSettings } from "@/components/settings/AgentModelSettings";
import { IntegrationsTab } from "@/components/integrations/IntegrationsTab";
import { RefreshButton } from "@/components/RefreshButton";
import { toast } from "sonner";

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
  const { user, refetch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Handle URL params for connection status
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      toast.success(`Successfully connected ${connected}`);
      refetch();
      // Clear the param
      searchParams.delete("connected");
      setSearchParams(searchParams, { replace: true });
    }

    if (error) {
      const errorMessages: Record<string, string> = {
        user_not_found: "User not found. Please log in again.",
        account_linked_to_other_user: "This account is already linked to another user.",
        auth_failed: "Authentication failed. Please try again.",
      };
      toast.error(errorMessages[error] || `Connection error: ${error}`);
      searchParams.delete("error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, refetch]);

  const handleDisconnect = async (provider: string) => {
    setDisconnecting(provider);
    try {
      await api.auth.disconnect(provider);
      toast.success(`Disconnected ${provider}`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || `Failed to disconnect ${provider}`);
    } finally {
      setDisconnecting(null);
    }
  };

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
            Manage your connected source code providers. Connect a provider to access your repositories.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {["github", "gitlab", "bitbucket"].map((provider) => {
              const connected = user?.providers.includes(provider);
              const isDisconnecting = disconnecting === provider;
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
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="bg-green-500/10 text-green-500 border-green-500/20"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => handleDisconnect(provider)}
                        disabled={isDisconnecting}
                      >
                        {isDisconnecting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Disconnect"
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/auth/connect/${provider}`}>Connect</a>
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
  const queryClient = useQueryClient();

  const { data: analyticsSettings } = useQuery({
    queryKey: ['analytics', 'settings'],
    queryFn: api.analytics.getSettings,
    staleTime: Infinity,
  });

  const [hourlyRate, setHourlyRate] = useState<number | null>(null);

  useEffect(() => {
    if (analyticsSettings && hourlyRate === null) {
      setHourlyRate(analyticsSettings.hourlyRate);
    }
  }, [analyticsSettings, hourlyRate]);

  const saveRateMutation = useMutation({
    mutationFn: (rate: number) => api.analytics.updateSettings({ hourlyRate: rate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'roi'] });
      toast.success('Engineer hourly rate saved');
    },
  });

  const displayRate = hourlyRate ?? analyticsSettings?.hourlyRate ?? 75;
  const isDirty = analyticsSettings && displayRate !== analyticsSettings.hourlyRate;

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

      <Card>
        <CardHeader>
          <CardTitle>ROI Settings</CardTitle>
          <CardDescription>
            Set your engineering hourly rate for ROI calculations across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <DollarSign size={17} className="text-emerald-500" />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">Engineer Hourly Rate</label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">$</span>
                <input
                  type="number"
                  value={displayRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  min={0}
                  max={500}
                  className={cn(
                    "h-9 w-24 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm font-medium",
                    "transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                  )}
                />
                <span className="text-xs text-muted-foreground">/ hour</span>
                <Button
                  size="sm"
                  variant={isDirty ? "default" : "outline"}
                  className="ml-2 h-9"
                  disabled={!isDirty || saveRateMutation.isPending}
                  onClick={() => saveRateMutation.mutate(displayRate)}
                >
                  {saveRateMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Used in ROI Calculator, Efficiency Metrics, and Analytics overview.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
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

const VALID_TABS = ["profile", "preferences", "personalization", "agents", "integrations"] as const;

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
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Settings</h2>
        <RefreshButton queryKeys={["api-keys", "integrations"]} />
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="personalization">Personalization</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>

        <TabsContent value="personalization">
          <PersonalizationSettings />
        </TabsContent>

        <TabsContent value="agents">
          <AgentModelSettings />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
