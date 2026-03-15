import { X, Crosshair, FileCode } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ElementRef {
  tagName: string;
  id: string | null;
  className: string;
  textContent: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  // React component source info
  component?: string | null;
  file?: string | null;
  line?: number | null;
  column?: number | null;
  framework?: string | null;
  stack?: Array<{ name: string; file: string | null }>;
  htmlPreview?: string;
}

interface ElementRefBadgeProps {
  element: ElementRef;
  onRemove: () => void;
}

export function ElementRefBadge({ element, onRemove }: ElementRefBadgeProps) {
  const hasSourceInfo = !!element.file;
  const dims = `${Math.round(element.rect.width)}x${Math.round(element.rect.height)}`;

  // Short file name for badge display
  const shortFile = element.file?.split("/").pop() || null;

  // Badge label: prefer "Component.tsx:31" over raw CSS selector
  const badgeLabel = hasSourceInfo
    ? element.line
      ? `${shortFile}:${element.line}`
      : shortFile!
    : element.tagName +
      (element.id ? `#${element.id}` : "") +
      (element.className
        ? `.${element.className.split(" ").slice(0, 2).join(".")}`
        : "");

  // Stack breadcrumb: <Button/> ← <Dialog/> ← <Page/>
  const stackBreadcrumb = element.stack
    ?.filter((s) => s.file)
    .map((s) => `<${s.name}/>`)
    .join(" ← ");

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 max-w-[320px]">
            {hasSourceInfo ? (
              <FileCode className="h-3 w-3 shrink-0 text-indigo-400" />
            ) : (
              <Crosshair className="h-3 w-3 shrink-0 text-indigo-400" />
            )}
            <span className="truncate font-mono">{badgeLabel}</span>
            <span className="text-indigo-400/60 shrink-0">({dims})</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="shrink-0 p-0.5 rounded hover:bg-indigo-500/20 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[400px]">
          <div className="space-y-1 text-xs">
            {element.component && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Component:</span>
                <span className="font-medium">&lt;{element.component}/&gt;</span>
                {element.framework && (
                  <span className="text-muted-foreground/60">({element.framework})</span>
                )}
              </div>
            )}
            {element.file && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">File:</span>
                <span className="font-mono text-indigo-300">
                  {element.file}
                  {element.line ? `:${element.line}` : ""}
                  {element.column ? `:${element.column}` : ""}
                </span>
              </div>
            )}
            {stackBreadcrumb && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Stack:</span>
                <span className="font-mono text-muted-foreground/80 truncate">{stackBreadcrumb}</span>
              </div>
            )}
            {!hasSourceInfo && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Selector:</span>
                <span className="font-mono truncate">{element.selector}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
