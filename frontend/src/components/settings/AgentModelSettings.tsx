import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  X,
  Loader2,
  Play,
  Cpu,
  Plus,
  Star,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ModelInfo {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface AgentConfig {
  id: string;
  name: string;
  command: string;
  protocol: string;
  available: boolean;
  icon: string;
  description: string;
  models: ModelInfo[];
  defaultModel: string;
  modelFlag: string;
}

interface TestResult {
  success: boolean;
  message: string;
  durationMs: number;
}

export function AgentModelSettings() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [customModelName, setCustomModelName] = useState("");
  const [testModelId, setTestModelId] = useState("");
  // Per-agent test results so one failure doesn't bleed into others
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingAgent, setTestingAgent] = useState<string | null>(null);
  const [installingAgent, setInstallingAgent] = useState<string | null>(null);

  const { data: agents = [], isLoading } = useQuery<AgentConfig[]>({
    queryKey: ["agents-full"],
    queryFn: async () => {
      const res = await fetch("/api/agents", { credentials: "include" });
      const data = await res.json();
      return data.agents;
    },
    staleTime: 30_000,
  });

  const { data: settings } = useQuery<{
    defaultAgent: string;
    agentModels?: Record<string, string>;
  }>({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
    staleTime: 30_000,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (body: { defaultAgent?: string; agentModels?: Record<string, string> }) =>
      api.settings.update(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => {
      toast.error("Failed to save settings");
    },
  });

  const detectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/agents/detect", {
        method: "POST",
        credentials: "include",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents-full"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent detection complete");
    },
  });

  const handleTest = async (agentId: string, modelId?: string) => {
    setTestingAgent(agentId);
    try {
      const res = await fetch("/api/agents/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, modelId }),
      });
      const result: TestResult = await res.json();
      setTestResults((prev) => ({ ...prev, [agentId]: result }));
      if (result.success) {
        toast.success(`Test passed in ${(result.durationMs / 1000).toFixed(1)}s`);
      } else {
        toast.error(`Test failed: ${result.message}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Test error";
      setTestResults((prev) => ({
        ...prev,
        [agentId]: { success: false, message, durationMs: 0 },
      }));
      toast.error(`Test error: ${message}`);
    } finally {
      setTestingAgent(null);
    }
  };

  const handleInstall = async (agentId: string) => {
    setInstallingAgent(agentId);
    try {
      const res = await fetch("/api/agents/install", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(result.message);
        queryClient.invalidateQueries({ queryKey: ["agents-full"] });
        queryClient.invalidateQueries({ queryKey: ["agents"] });
      } else {
        toast.error(result.error || result.message || "Install failed");
      }
    } catch {
      toast.error("Failed to install agent");
    } finally {
      setInstallingAgent(null);
    }
  };

  const currentAgent = agents.find((a) => a.id === selectedAgent);
  const defaultAgent = settings?.defaultAgent || "claude-code";
  const currentTestResult = currentAgent ? testResults[currentAgent.id] : undefined;

  return (
    <div className="space-y-4">
      {/* Two-column layout: Agents list + Model details */}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 min-h-[calc(100vh-280px)]">
        {/* LEFT column — Agent list */}
        <div className="rounded-lg border border-border/50 bg-card flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div>
              <p className="text-sm font-medium">Agents</p>
              <p className="text-xs text-muted-foreground">
                {agents.filter((a) => a.available).length} of {agents.length} installed
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => detectMutation.mutate()}
              disabled={detectMutation.isPending}
              className="h-7 px-2 text-xs"
            >
              {detectMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Bot className="h-3 w-3 mr-1" />
              )}
              Re-detect
            </Button>
          </div>

          {/* Scrollable agent list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[calc(100vh-340px)]">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : (
              agents.map((agent) => {
                const isDefault = defaultAgent === agent.id;
                const isNpxAgent = agent.command === "npx";
                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors cursor-pointer group",
                      selectedAgent === agent.id
                        ? "border border-primary bg-primary/5"
                        : "border border-transparent hover:bg-muted/50"
                    )}
                    onClick={() => {
                      setSelectedAgent(agent.id);
                      // Load saved model preference, fall back to agent default
                      const savedModel = settings?.agentModels?.[agent.id];
                      setTestModelId(savedModel || agent.defaultModel || "");
                    }}
                  >
                    {/* Star for default */}
                    <button
                      type="button"
                      title={isDefault ? "Default agent" : "Set as default"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDefault) {
                          updateSettingsMutation.mutate(
                            { defaultAgent: agent.id },
                            { onSuccess: () => toast.success("Default agent updated") }
                          );
                        }
                      }}
                      className={cn(
                        "shrink-0 transition-colors",
                        isDefault
                          ? "text-yellow-500"
                          : "text-muted-foreground/30 hover:text-yellow-500/70"
                      )}
                    >
                      <Star
                        className="h-4 w-4"
                        fill={isDefault ? "currentColor" : "none"}
                      />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">
                          {agent.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {agent.available ? (
                          <Badge variant="default" className="text-[10px] h-4 px-1.5">
                            Installed
                          </Badge>
                        ) : isNpxAgent ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInstall(agent.id);
                            }}
                            disabled={installingAgent === agent.id}
                            className="inline-flex items-center gap-1 text-[10px] h-4 px-1.5 rounded-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            {installingAgent === agent.id ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <Download className="h-2.5 w-2.5" />
                            )}
                            Install
                          </button>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            Not found
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {agent.protocol}
                        </Badge>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                      {agent.models.length > 0 ? `${agent.models.length}` : "—"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT column — Model details */}
        <div className="rounded-lg border border-border/50 bg-card flex flex-col overflow-hidden">
          {currentAgent ? (
            <>
              {/* Panel header */}
              <div className="px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{currentAgent.name} — Models</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentAgent.models.length > 0
                    ? `${currentAgent.models.length} built-in models. Default: ${currentAgent.defaultModel || "none"}`
                    : "No built-in models. Specify a custom model name below."}
                </p>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-340px)]">
                {/* Active model indicator */}
                {testModelId && (
                  <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-muted-foreground">Active:</span>
                    <span className="font-mono text-primary font-medium truncate">{testModelId}</span>
                    <div className="flex items-center gap-1 ml-auto shrink-0">
                      {!currentAgent.models.some((m) => m.id === testModelId) && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          custom
                        </Badge>
                      )}
                      {settings?.agentModels?.[currentAgent.id] === testModelId ? (
                        <Badge className="text-[10px] h-4 px-1.5 bg-green-500/20 text-green-500 border-green-500/30">
                          saved
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 opacity-50">
                          unsaved
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Built-in models */}
                {currentAgent.models.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Available Models
                    </label>
                    <div className="grid gap-1">
                      {currentAgent.models.map((model) => (
                        <div
                          key={model.id}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-2 text-sm border transition-colors cursor-pointer",
                            testModelId === model.id
                              ? "border-primary bg-primary/5"
                              : "border-transparent hover:bg-muted/50"
                          )}
                          onClick={() => {
                            setTestModelId(model.id);
                            // Save model preference for this agent
                            updateSettingsMutation.mutate(
                              { agentModels: { [currentAgent.id]: model.id } },
                              { onSuccess: () => toast.success(`Model set to ${model.name}`) }
                            );
                          }}
                        >
                          {testModelId === model.id ? (
                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                          ) : (
                            <div className="w-3.5" />
                          )}
                          <span className="flex-1">{model.name}</span>
                          <span className="text-xs font-mono text-muted-foreground">
                            {model.id}
                          </span>
                          {model.isDefault && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-4 px-1.5"
                            >
                              default
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom model input */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Custom Model
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. claude-opus-4-5, gpt-5.4-fast..."
                      value={customModelName}
                      onChange={(e) => setCustomModelName(e.target.value)}
                      className="text-sm"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!customModelName.trim()}
                      onClick={() => {
                        const modelName = customModelName.trim();
                        setTestModelId(modelName);
                        setCustomModelName("");
                        // Save custom model preference
                        updateSettingsMutation.mutate(
                          { agentModels: { [currentAgent.id]: modelName } },
                          { onSuccess: () => toast.success(`Model set to ${modelName}`) }
                        );
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Select
                    </Button>
                  </div>
                </div>

                {/* Test button */}
                <div className="flex items-center gap-3 pt-2 border-t border-border/50">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      Test:{" "}
                      <span className="font-mono text-primary">
                        {currentAgent.name}
                      </span>
                      {testModelId && (
                        <>
                          {" + "}
                          <span className="font-mono text-primary">
                            {testModelId}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sends a test prompt to verify the agent
                      {testModelId ? " and model" : ""} work correctly
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      handleTest(currentAgent.id, testModelId || undefined)
                    }
                    disabled={
                      !currentAgent.available ||
                      testingAgent === currentAgent.id
                    }
                    size="sm"
                    className="gap-1.5"
                  >
                    {testingAgent === currentAgent.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Test
                  </Button>
                </div>

                {/* Test result — scoped to current agent */}
                {currentTestResult && (
                  <div
                    className={cn(
                      "rounded-lg border p-3 text-sm",
                      currentTestResult.success
                        ? "border-green-500/30 bg-green-500/5 text-green-400"
                        : "border-red-500/30 bg-red-500/5 text-red-400"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {currentTestResult.success ? (
                        <Check className="h-4 w-4 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 shrink-0" />
                      )}
                      <span className="font-medium">
                        {currentTestResult.success
                          ? "Test Passed"
                          : "Test Failed"}
                      </span>
                      <span className="text-xs opacity-70 ml-auto">
                        {(currentTestResult.durationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <p className="text-xs mt-1 opacity-80 whitespace-pre-wrap">
                      {currentTestResult.message}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Placeholder when no agent selected */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Cpu className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  Select an agent to view model configuration
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
