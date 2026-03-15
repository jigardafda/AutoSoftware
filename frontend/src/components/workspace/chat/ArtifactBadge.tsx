import { Eye, Code, FileText, Globe, Image, Table, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "./ArtifactDetector";

interface ArtifactBadgeProps {
  artifacts: Artifact[];
  onSelect: (artifact: Artifact) => void;
  className?: string;
}

function getArtifactIcon(type: Artifact["type"]) {
  switch (type) {
    case "html":
      return Globe;
    case "react":
      return Code;
    case "svg":
      return Image;
    case "csv":
      return Table;
    case "markdown":
      return FileText;
    case "mermaid":
      return GitBranch;
    case "code":
      return Code;
    default:
      return FileText;
  }
}

function getArtifactLabel(artifact: Artifact): string {
  if (artifact.filename) return artifact.filename;
  return artifact.title;
}

export function ArtifactBadge({
  artifacts,
  onSelect,
  className,
}: ArtifactBadgeProps) {
  if (artifacts.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5 mt-2", className)}>
      {artifacts.map((artifact) => {
        const Icon = getArtifactIcon(artifact.type);
        const label = getArtifactLabel(artifact);

        return (
          <button
            key={artifact.id}
            onClick={() => onSelect(artifact)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
              "text-xs font-medium",
              "border border-border/60 bg-muted/40",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-muted hover:border-border",
              "transition-all duration-150 cursor-pointer",
              "group"
            )}
            title={`Preview: ${artifact.title}`}
          >
            <Eye className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
            <Icon className="h-3 w-3" />
            <span className="max-w-[160px] truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
