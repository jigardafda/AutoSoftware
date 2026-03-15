import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  persistKey: string;
  defaultExpanded?: boolean;
  actions?: React.ReactNode;
  badge?: string | number;
  children: React.ReactNode;
  className?: string;
  maxHeight?: string;
}

export function CollapsibleSection({
  title,
  icon,
  persistKey,
  defaultExpanded = true,
  actions,
  badge,
  children,
  className,
  maxHeight = "max-h-[max(50vh,400px)]",
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(`collapsible:${persistKey}`);
      if (stored !== null) return stored === "true";
    } catch {
      // localStorage unavailable
    }
    return defaultExpanded;
  });

  useEffect(() => {
    try {
      localStorage.setItem(`collapsible:${persistKey}`, String(expanded));
    } catch {
      // localStorage unavailable
    }
  }, [expanded, persistKey]);

  return (
    <div className={cn("border-b border-border", className)}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <span className="truncate">{title}</span>

        {badge != null && (
          <span className="ml-1 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold leading-none text-muted-foreground">
            {badge}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1">
          {actions && (
            <span
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1"
            >
              {actions}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              !expanded && "-rotate-90"
            )}
          />
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className={cn("overflow-auto", expanded && maxHeight)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
