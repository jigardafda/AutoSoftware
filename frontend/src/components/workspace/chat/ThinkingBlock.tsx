import { useState } from "react";
import { MessageCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  content: string;
  className?: string;
  defaultExpanded?: boolean;
}

export function ThinkingBlock({
  content,
  className,
  defaultExpanded = false,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Show a short preview if collapsed
  const preview =
    content.length > 80 ? content.slice(0, 80) + "..." : content;

  return (
    <div
      className={cn(
        "flex items-start gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground/80 transition-colors",
        className
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <MessageCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {expanded ? (
          <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
            {content}
          </div>
        ) : (
          <span className="text-xs truncate block">{preview}</span>
        )}
      </div>
      <ChevronDown
        className={cn(
          "h-3 w-3 shrink-0 mt-0.5 transition-transform text-muted-foreground/50",
          expanded && "rotate-180"
        )}
      />
    </div>
  );
}

/**
 * Collapsed group of thinking blocks from previous turns
 */
interface CollapsedThinkingProps {
  entries: string[];
  className?: string;
}

export function CollapsedThinking({
  entries,
  className,
}: CollapsedThinkingProps) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 text-xs text-muted-foreground/70 cursor-pointer hover:text-muted-foreground transition-colors",
        className
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <MessageCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {expanded ? (
          <div className="space-y-2">
            {entries.map((text, i) => (
              <p key={i} className="whitespace-pre-wrap break-words leading-relaxed">
                {text}
              </p>
            ))}
          </div>
        ) : (
          <span>Thinking ({entries.length} blocks)</span>
        )}
      </div>
      <ChevronDown
        className={cn(
          "h-3 w-3 shrink-0 mt-0.5 transition-transform",
          expanded && "rotate-180"
        )}
      />
    </div>
  );
}
