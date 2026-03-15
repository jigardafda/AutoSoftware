import { useState } from "react";
import { GitBranch, Copy, ExternalLink, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GitPanelProps {
  repoName?: string;
  baseBranch?: string;
  workingBranch?: string;
  className?: string;
}

export function GitPanel({
  repoName,
  baseBranch,
  workingBranch,
  className,
}: GitPanelProps) {
  const [copied, setCopied] = useState(false);

  const displayName = repoName || "Local Repository";

  function handleCopyBranch() {
    if (!workingBranch) return;
    navigator.clipboard.writeText(workingBranch).then(() => {
      setCopied(true);
      toast.success("Branch name copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={cn("flex flex-col gap-4 rounded-lg border bg-card p-4", className)}>
      {/* Repository name */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Repository
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground" title={displayName}>
          {displayName}
        </p>
      </div>

      {/* Branches */}
      <div className="flex flex-col gap-3">
        {/* Base branch */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Base branch
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{baseBranch || "main"}</span>
          </div>
        </div>

        {/* Working branch */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Working branch
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{workingBranch || "—"}</span>
            {workingBranch && (
              <button
                type="button"
                onClick={handleCopyBranch}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Copy branch name"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-auto flex flex-col gap-2 border-t pt-4">
        <Button variant="outline" size="sm" disabled title="Coming soon" className="w-full">
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          Open pull request
        </Button>
        <Button variant="outline" size="sm" disabled className="w-full">
          Push changes
        </Button>
      </div>
    </div>
  );
}
