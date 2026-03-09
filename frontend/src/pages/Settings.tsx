import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
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
      {/* User Info */}
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

      {/* Connected Providers */}
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

function ApiTab() {
  return (
    <div className="space-y-6">
      {/* API Key Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Anthropic API Key
          </CardTitle>
          <CardDescription>
            Used for AI-powered scanning and task execution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className="bg-green-500/10 text-green-500 border-green-500/20"
            >
              Configured via environment
            </Badge>
          </div>
        </CardContent>
      </Card>

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

export function SettingsPage() {
  const { loading } = useAuth();

  if (loading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Settings</h2>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
