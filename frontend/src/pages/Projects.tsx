import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FolderKanban, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Pagination, paginate } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function Projects() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(0);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const pagedProjects = useMemo(() => paginate(projects, page), [projects, page]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
        <h2 className="text-2xl font-bold">Projects</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Project</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-md border">
          <div className="border-b px-4 py-3">
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20 ml-auto" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project to group repos and add context documents"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Project
            </Button>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-16 text-center">Repos</TableHead>
                  <TableHead className="w-16 text-center">Docs</TableHead>
                  <TableHead className="w-20 text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedProjects.map((project: any) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{project.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[300px] truncate">
                      {project.description || "--"}
                    </TableCell>
                    <TableCell className="text-center text-sm">{project.repoCount}</TableCell>
                    <TableCell className="text-center text-sm">{project.docCount}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {relativeTime(project.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} total={projects.length} onPageChange={setPage} />
        </>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
