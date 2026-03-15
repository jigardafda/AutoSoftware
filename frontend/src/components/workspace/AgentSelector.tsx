import { useQuery } from "@tanstack/react-query";
import { Bot, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface Agent {
  id: string;
  name: string;
  icon?: string;
  available: boolean;
  protocol?: string;
  description?: string;
  models?: Array<{ id: string; name: string }>;
}

interface AgentSelectorProps {
  value?: string;
  onChange: (agentId: string) => void;
  className?: string;
}

export function AgentSelector({ value, onChange, className }: AgentSelectorProps) {
  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/agents", { credentials: "include" });
        const data = await res.json();
        return data.agents ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className={cn("h-10 rounded-lg border border-border/50 bg-muted/30 animate-pulse", className)} />
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder="Select an agent..." />
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => (
          <TooltipProvider key={agent.id} delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <SelectItem value={agent.id} disabled={!agent.available}>
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 shrink-0" />
                      <span>{agent.name}</span>
                      <span
                        className={cn(
                          "ml-auto h-2 w-2 rounded-full shrink-0",
                          agent.available ? "bg-green-500" : "bg-muted-foreground/40"
                        )}
                      />
                    </div>
                  </SelectItem>
                </div>
              </TooltipTrigger>
              {!agent.available && (
                <TooltipContent side="right">
                  <p>Not installed</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        ))}
      </SelectContent>
    </Select>
  );
}
