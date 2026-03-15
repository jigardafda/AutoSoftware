import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Cpu, Check, Sparkles } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ModelInfo {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface AgentWithModels {
  id: string;
  name: string;
  models: ModelInfo[];
  defaultModel: string;
}

interface ModelSelectorProps {
  agentId: string;
  value?: string;
  onChange: (modelId: string) => void;
  className?: string;
  disabled?: boolean;
}

export function ModelSelector({
  agentId,
  value,
  onChange,
  className,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: agent } = useQuery<AgentWithModels>({
    queryKey: ["agent-models", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${agentId}`, { credentials: "include" });
      const data = await res.json();
      return data.agent;
    },
    staleTime: 60_000,
    enabled: !!agentId,
  });

  const models = agent?.models ?? [];
  const defaultModel = agent?.defaultModel ?? "";
  const selectedId = value || defaultModel;

  const filteredModels = useMemo(() => {
    if (!search) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    );
  }, [models, search]);

  const selectedModel = models.find((m) => m.id === selectedId);
  const displayName = selectedModel?.name || selectedId || "Default";

  // If no models available for this agent, don't render
  if (models.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2",
            className
          )}
          disabled={disabled}
        >
          <Cpu className="h-3 w-3" />
          <span className="hidden sm:inline max-w-[120px] truncate">{displayName}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" sideOffset={8}>
        {models.length > 5 && (
          <div className="p-2 border-b border-border/50">
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs"
              autoFocus
            />
          </div>
        )}
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filteredModels.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onChange(model.id);
                setOpen(false);
                setSearch("");
              }}
              className={cn(
                "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors",
                "hover:bg-muted/80",
                selectedId === model.id && "bg-primary/10 text-primary"
              )}
            >
              {selectedId === model.id ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : (
                <div className="w-3" />
              )}
              <span className="flex-1 text-left truncate">{model.name}</span>
              {model.isDefault && (
                <Sparkles className="h-3 w-3 text-yellow-500 shrink-0" />
              )}
            </button>
          ))}
          {filteredModels.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No models found
            </div>
          )}
        </div>
        {/* Custom model input */}
        <div className="border-t border-border/50 p-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (search.trim()) {
                onChange(search.trim());
                setOpen(false);
                setSearch("");
              }
            }}
          >
            <div className="flex gap-1">
              <Input
                placeholder="Custom model ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 text-xs flex-1"
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                className="h-7 text-xs px-2"
                disabled={!search.trim()}
              >
                Use
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
