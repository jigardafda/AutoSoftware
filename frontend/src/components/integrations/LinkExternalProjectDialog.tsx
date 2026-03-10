import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProviderIcon } from "./ProviderIcon";

interface LinkExternalProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onLinked: () => void;
}

export function LinkExternalProjectDialog({
  open,
  onOpenChange,
  projectId,
  onLinked,
}: LinkExternalProjectDialogProps) {
  const [step, setStep] = useState<"choose-integration" | "choose-project">("choose-integration");
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null);
  const [externalProjects, setExternalProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("choose-integration");
      setSelectedIntegration(null);
      setExternalProjects([]);
      setSearch("");
      api.integrations.list().then(setIntegrations).catch(() => {});
    }
  }, [open]);

  const handleSelectIntegration = async (integration: any) => {
    setSelectedIntegration(integration);
    setStep("choose-project");
    setLoading(true);
    try {
      const projects = await api.integrations.listProjects(integration.id);
      setExternalProjects(projects);
    } catch (err: any) {
      toast.error(`Failed to load projects: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkProject = async (extProject: any) => {
    setLinking(true);
    try {
      await api.integrations.createLink(projectId, {
        integrationId: selectedIntegration.id,
        externalProjectId: extProject.id,
        externalProjectName: extProject.name,
        externalProjectKey: extProject.key,
        externalProjectUrl: extProject.url,
      });
      toast.success(`Linked ${extProject.name}`);
      onOpenChange(false);
      onLinked();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLinking(false);
    }
  };

  const filtered = externalProjects.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "choose-integration" ? "Link External Source" : `Select Project — ${selectedIntegration?.displayName}`}
          </DialogTitle>
          <DialogDescription>
            {step === "choose-integration"
              ? "Choose a connected integration to link."
              : "Select an external project to link to this project."}
          </DialogDescription>
        </DialogHeader>

        {step === "choose-integration" ? (
          <div className="space-y-2 py-2">
            {integrations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No integrations connected. Go to Settings to connect one.
              </p>
            ) : (
              integrations
                .filter((i) => i.status === "connected")
                .map((integration) => (
                  <button
                    key={integration.id}
                    onClick={() => handleSelectIntegration(integration)}
                    className="flex items-center gap-3 w-full rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <ProviderIcon provider={integration.provider} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{integration.displayName}</p>
                      {integration.accountEmail && (
                        <p className="text-xs text-muted-foreground">{integration.accountEmail}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {integration.linkCount} link(s)
                    </span>
                  </button>
                ))
            )}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="pl-9"
              />
            </div>

            <ScrollArea className="h-[300px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No projects found.
                </p>
              ) : (
                <div className="space-y-1">
                  {filtered.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleLinkProject(project)}
                      disabled={linking}
                      className="flex items-center gap-3 w-full rounded-md p-2 text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        {project.key && project.key !== project.name && (
                          <p className="text-xs text-muted-foreground">{project.key}</p>
                        )}
                      </div>
                      {project.description && (
                        <p className="text-xs text-muted-foreground max-w-[180px] truncate">
                          {project.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStep("choose-integration");
                setExternalProjects([]);
                setSearch("");
              }}
            >
              Back
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
