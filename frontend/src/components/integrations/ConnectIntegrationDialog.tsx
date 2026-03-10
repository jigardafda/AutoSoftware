import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderIcon } from "./ProviderIcon";

interface ConnectIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: any | null;
  onConnected: () => void;
}

export function ConnectIntegrationDialog({
  open,
  onOpenChange,
  provider,
  onConnected,
}: ConnectIntegrationDialogProps) {
  const [token, setToken] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [connecting, setConnecting] = useState(false);

  if (!provider) return null;

  const isOAuth = provider.authMethod === "oauth2";

  const handleOAuthConnect = () => {
    window.location.href = `/api/integrations/connect/${provider.type}`;
  };

  const handleTokenConnect = async () => {
    setConnecting(true);
    try {
      await api.integrations.connectToken({
        provider: provider.type,
        token,
        config: configValues,
        displayName: displayName || undefined,
      });
      toast.success(`${provider.name} connected successfully`);
      setToken("");
      setConfigValues({});
      setDisplayName("");
      onOpenChange(false);
      onConnected();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ProviderIcon provider={provider.type} />
            Connect {provider.name}
          </DialogTitle>
          <DialogDescription>{provider.description}</DialogDescription>
        </DialogHeader>

        {isOAuth ? (
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              You will be redirected to {provider.name} to authorize access.
            </p>
            <Button onClick={handleOAuthConnect} className="w-full">
              Connect with {provider.name}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name (optional)</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={provider.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-token">API Token</Label>
              <Input
                id="api-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your API token"
              />
            </div>
            {provider.configFields?.map((field: any) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <Input
                  id={field.key}
                  value={configValues[field.key] || ""}
                  onChange={(e) =>
                    setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>
        )}

        {!isOAuth && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTokenConnect}
              disabled={connecting || !token}
            >
              {connecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Validate & Connect
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
