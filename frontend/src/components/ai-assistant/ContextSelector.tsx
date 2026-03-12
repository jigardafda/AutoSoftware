/**
 * Context Selector Component
 *
 * Dropdown to scope conversations to global, project, or repository.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Globe,
  FolderKanban,
  GitBranch,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";

interface Props {
  contextType: "global" | "project" | "repository";
  contextId?: string;
  onChange: (type: "global" | "project" | "repository", id?: string) => void;
}

export function ContextSelector({ contextType, contextId, onChange }: Props) {
  // Fetch projects
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });

  // Fetch repositories
  const { data: repos } = useQuery({
    queryKey: ["repos"],
    queryFn: () => api.repos.list(),
  });

  // Current value
  const value =
    contextType === "global"
      ? "global"
      : contextType === "project"
        ? `project:${contextId}`
        : `repo:${contextId}`;

  // Handle change
  const handleChange = (val: string) => {
    if (val === "global") {
      onChange("global");
    } else if (val.startsWith("project:")) {
      onChange("project", val.replace("project:", ""));
    } else if (val.startsWith("repo:")) {
      onChange("repository", val.replace("repo:", ""));
    }
  };

  // Get current label
  const getLabel = () => {
    if (contextType === "global") {
      return "All Projects";
    }
    if (contextType === "project" && contextId) {
      const project = projects?.find((p: any) => p.id === contextId);
      return project?.name || "Project";
    }
    if (contextType === "repository" && contextId) {
      const repo = repos?.find((r: any) => r.id === contextId);
      return repo?.fullName || "Repository";
    }
    return "Select context";
  };

  const getIcon = () => {
    if (contextType === "project") return <FolderKanban className="h-4 w-4" />;
    if (contextType === "repository") return <GitBranch className="h-4 w-4" />;
    return <Globe className="h-4 w-4" />;
  };

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="h-8 text-sm">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="truncate">{getLabel()}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="global">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span>All Projects</span>
          </div>
        </SelectItem>

        {projects && projects.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2 text-xs">
              <FolderKanban className="h-3 w-3" />
              Projects
            </SelectLabel>
            {projects.map((project: any) => (
              <SelectItem key={project.id} value={`project:${project.id}`}>
                <span className="truncate">{project.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {repos && repos.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2 text-xs">
              <GitBranch className="h-3 w-3" />
              Repositories
            </SelectLabel>
            {repos.slice(0, 10).map((repo: any) => (
              <SelectItem key={repo.id} value={`repo:${repo.id}`}>
                <span className="truncate">{repo.fullName}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
