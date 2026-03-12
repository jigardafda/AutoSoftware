/**
 * MCP Server Management Dialog
 *
 * Manage custom MCP servers with:
 * - Add new servers with validation
 * - Test existing servers
 * - Enable/disable servers
 * - View server capabilities
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Server,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Wrench,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function McpServerDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch servers
  const { data: servers, isLoading } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: () => api.chat.listMcpServers(),
    enabled: open,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.chat.deleteMcpServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      toast.success("Server deleted");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete server");
    },
  });

  // Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.chat.updateMcpServer(id, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
    },
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: (id: string) => api.chat.testMcpServer(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      if (data.success) {
        toast.success("Server connection successful");
      } else {
        toast.error(data.error || "Server test failed");
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to test server");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Custom MCP Servers
          </DialogTitle>
          <DialogDescription>
            Add custom MCP servers to extend the AI Assistant's capabilities.
            Only HTTP Streamable servers are supported.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-4">
            {/* Add server form */}
            {showAddForm ? (
              <AddServerForm
                onCancel={() => setShowAddForm(false)}
                onSuccess={() => {
                  setShowAddForm(false);
                  queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
                }}
              />
            ) : (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-4 w-4" />
                Add MCP Server
              </Button>
            )}

            {/* Server list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : servers?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No custom servers added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {servers?.map((server: any) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    onToggle={(isEnabled) =>
                      toggleMutation.mutate({ id: server.id, isEnabled })
                    }
                    onTest={() => testMutation.mutate(server.id)}
                    onDelete={() => deleteMutation.mutate(server.id)}
                    isTesting={testMutation.isPending && testMutation.variables === server.id}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add server form
function AddServerForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [authType, setAuthType] = useState<"none" | "bearer" | "api_key">("none");
  const [authToken, setAuthToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
    serverInfo?: any;
    capabilities?: any;
  } | null>(null);

  // Add mutation
  const addMutation = useMutation({
    mutationFn: () =>
      api.chat.addMcpServer({
        name,
        url,
        description: description || undefined,
        authType: authType !== "none" ? authType : undefined,
        authToken: authToken || undefined,
      }),
    onSuccess: () => {
      toast.success("Server added successfully");
      onSuccess();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to add server");
    },
  });

  // Validate URL
  const handleValidate = useCallback(async () => {
    if (!url) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await api.chat.validateMcpServer(url, authToken || undefined);
      setValidationResult(result);
    } catch (err: any) {
      setValidationResult({ valid: false, error: err.message });
    } finally {
      setIsValidating(false);
    }
  }, [url, authToken]);

  // Handle submit
  const handleSubmit = () => {
    if (!name || !url) return;
    addMutation.mutate();
  };

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Add New Server</h4>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="My MCP Server"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="url">Server URL</Label>
          <div className="flex gap-2">
            <Input
              id="url"
              placeholder="https://mcp.example.com/api"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setValidationResult(null);
              }}
            />
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={!url || isValidating}
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Validate"
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Only HTTP Streamable MCP servers are supported
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="auth">Authentication</Label>
          <Select
            value={authType}
            onValueChange={(v) => setAuthType(v as any)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="api_key">API Key</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {authType !== "none" && (
          <div className="grid gap-2">
            <Label htmlFor="token">
              {authType === "bearer" ? "Bearer Token" : "API Key"}
            </Label>
            <Input
              id="token"
              type="password"
              placeholder="Enter token..."
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
            />
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Input
            id="description"
            placeholder="A brief description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Validation result */}
        {validationResult && (
          <div
            className={cn(
              "rounded-lg p-3 text-sm",
              validationResult.valid
                ? "bg-green-500/10 border border-green-500/20"
                : "bg-destructive/10 border border-destructive/20"
            )}
          >
            {validationResult.valid ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  <span className="font-medium">Server validated successfully</span>
                </div>
                {validationResult.serverInfo && (
                  <div className="text-xs text-muted-foreground">
                    {validationResult.serverInfo.name} v{validationResult.serverInfo.version}
                  </div>
                )}
                {validationResult.capabilities?.tools?.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <Wrench className="h-3 w-3" />
                    {validationResult.capabilities.tools.length} tools available
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{validationResult.error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!name || !url || !validationResult?.valid || addMutation.isPending}
        >
          {addMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Add Server
        </Button>
      </div>
    </div>
  );
}

// Server card
function ServerCard({
  server,
  onToggle,
  onTest,
  onDelete,
  isTesting,
}: {
  server: any;
  onToggle: (isEnabled: boolean) => void;
  onTest: () => void;
  onDelete: () => void;
  isTesting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const getStatusColor = () => {
    switch (server.status) {
      case "active":
        return "bg-green-500";
      case "error":
        return "bg-destructive";
      case "disabled":
        return "bg-muted-foreground";
      default:
        return "bg-yellow-500";
    }
  };

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="rounded-lg border">
        <div className="flex items-center gap-3 p-3">
          <div className={cn("w-2 h-2 rounded-full", getStatusColor())} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{server.name}</span>
              <Badge variant="outline" className="text-xs">
                {server.toolCount} tools
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {server.url}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={server.isEnabled}
              onCheckedChange={onToggle}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={onTest}
              disabled={isTesting}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon">
                {expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t p-3 space-y-3">
            {server.description && (
              <p className="text-sm text-muted-foreground">
                {server.description}
              </p>
            )}

            {server.lastError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {server.lastError}
              </div>
            )}

            {server.capabilities?.tools?.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Available Tools:
                </span>
                <div className="flex flex-wrap gap-1">
                  {server.capabilities.tools.slice(0, 10).map((tool: any) => (
                    <Badge key={tool.name} variant="secondary" className="text-xs">
                      {tool.name}
                    </Badge>
                  ))}
                  {server.capabilities.tools.length > 10 && (
                    <Badge variant="outline" className="text-xs">
                      +{server.capabilities.tools.length - 10} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
