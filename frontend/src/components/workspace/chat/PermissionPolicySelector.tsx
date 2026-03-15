import {
  FastForward,
  Hand,
  ListChecks,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PermissionPolicy } from "./types";

interface PermissionPolicySelectorProps {
  value: PermissionPolicy;
  onChange: (policy: PermissionPolicy) => void;
  className?: string;
  disabled?: boolean;
}

const policyConfig: Record<
  PermissionPolicy,
  { label: string; icon: typeof FastForward; description: string }
> = {
  auto: {
    label: "Auto-approve",
    icon: FastForward,
    description: "Tool calls execute immediately without prompts",
  },
  supervised: {
    label: "Ask first",
    icon: Hand,
    description: "Shows approval for each tool call",
  },
  plan: {
    label: "Show plan",
    icon: ListChecks,
    description: "Approve plan first, then auto-execute",
  },
};

export function PermissionPolicySelector({
  value,
  onChange,
  className,
  disabled,
}: PermissionPolicySelectorProps) {
  const current = policyConfig[value];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2",
            className
          )}
          disabled={disabled}
        >
          <CurrentIcon className="h-3 w-3" />
          <span className="hidden sm:inline">{current.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {(Object.keys(policyConfig) as PermissionPolicy[]).map((policy) => {
          const config = policyConfig[policy];
          const Icon = config.icon;
          return (
            <DropdownMenuItem
              key={policy}
              onClick={() => onChange(policy)}
              className={cn(
                "flex items-start gap-2 py-2",
                value === policy && "bg-primary/5"
              )}
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">{config.label}</div>
                <div className="text-xs text-muted-foreground">
                  {config.description}
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
