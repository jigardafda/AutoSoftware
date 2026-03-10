import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  AlertCircle,
  Unplug,
  Zap,
} from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ProviderIcon } from "./ProviderIcon";
import { ConnectIntegrationDialog } from "./ConnectIntegrationDialog";

interface ProviderMeta {
  type: string;
  name: string;
  category: string;
  authMethod: string;
  description: string;
  itemNoun: string;
  configFields?: any[];
}

interface IntegrationItem {
  id: string;
  provider: string;
  status: string;
  displayName: string;
  accountEmail: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  linkCount: number;
  createdAt: string;
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

export function IntegrationsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectProvider, setConnectProvider] = useState<ProviderMeta | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [provs, ints] = await Promise.all([
        api.integrations.providers(),
        api.integrations.list(),
      ]);
      setProviders(provs);
      setIntegrations(ints);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle OAuth callback params
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      toast.success(`${connected} connected successfully`);
      searchParams.delete("connected");
      setSearchParams(searchParams, { replace: true });
      fetchData();
    }
    if (error) {
      toast.error(`Connection failed: ${error}`);
      searchParams.delete("error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, fetchData]);

  const handleDisconnect = async (id: string) => {
    try {
      await api.integrations.disconnect(id);
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
      toast.success("Integration disconnected");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await api.integrations.test(id);
      toast.success(`Connection OK — ${result.projectCount} project(s) found`);
      fetchData();
    } catch (err: any) {
      toast.error(`Test failed: ${err.message}`);
      fetchData();
    } finally {
      setTesting(null);
    }
  };

  const getIntegration = (providerType: string) =>
    integrations.find((i) => i.provider === providerType);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const pmProviders = providers.filter((p) => p.category === "project_management");
  const monitoringProviders = providers.filter((p) => p.category === "monitoring");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            External Integrations
          </CardTitle>
          <CardDescription>
            Connect project management and monitoring tools to import issues and errors as tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Management */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Project Management</h3>
            <div className="space-y-2">
              {pmProviders.map((provider) => (
                <ProviderRow
                  key={provider.type}
                  provider={provider}
                  integration={getIntegration(provider.type)}
                  onConnect={() => setConnectProvider(provider)}
                  onDisconnect={handleDisconnect}
                  onTest={handleTest}
                  testing={testing}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Monitoring */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Monitoring</h3>
            <div className="space-y-2">
              {monitoringProviders.map((provider) => (
                <ProviderRow
                  key={provider.type}
                  provider={provider}
                  integration={getIntegration(provider.type)}
                  onConnect={() => setConnectProvider(provider)}
                  onDisconnect={handleDisconnect}
                  onTest={handleTest}
                  testing={testing}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <ConnectIntegrationDialog
        open={!!connectProvider}
        onOpenChange={(open) => !open && setConnectProvider(null)}
        provider={connectProvider}
        onConnected={fetchData}
      />
    </div>
  );
}

function ProviderRow({
  provider,
  integration,
  onConnect,
  onDisconnect,
  onTest,
  testing,
}: {
  provider: ProviderMeta;
  integration: IntegrationItem | undefined;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  onTest: (id: string) => void;
  testing: string | null;
}) {
  const connected = !!integration;
  const hasError = integration?.status === "error" || integration?.status === "expired";

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <ProviderIcon provider={provider.type} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{provider.name}</span>
          {connected && (
            <Badge
              variant="secondary"
              className={
                hasError
                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                  : "bg-green-500/10 text-green-500 border-green-500/20"
              }
            >
              {hasError ? (
                <>
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {integration.status === "expired" ? "Expired" : "Error"}
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Connected
                </>
              )}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{provider.description}</p>
        {connected && integration.lastSyncedAt && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Last synced: {timeAgo(integration.lastSyncedAt)}
          </p>
        )}
        {connected && integration.lastError && (
          <p className="text-[10px] text-red-500 mt-0.5 truncate">{integration.lastError}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {connected ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTest(integration.id)}
              disabled={testing === integration.id}
            >
              {testing === integration.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Test"
              )}
            </Button>
            <ConfirmDeleteDialog
              title={`Disconnect ${provider.name}`}
              description="This will remove the integration and unlink all connected projects. Imported tasks will not be deleted."
              onConfirm={() => onDisconnect(integration.id)}
              trigger={
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  <Unplug className="h-3.5 w-3.5" />
                </Button>
              }
            />
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={onConnect}>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
