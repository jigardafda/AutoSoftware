import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

interface Props {
  projectId: string;
  document: {
    id: string;
    title: string;
    content: string;
    sortOrder: number;
  };
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export function DocumentEditor({ projectId, document, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateMutation = useMutation({
    mutationFn: (body: { title?: string; content?: string }) =>
      api.projects.documents.update(projectId, document.id, body),
    onSuccess: () => {
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err: Error) => {
      setSaveStatus("unsaved");
      toast.error(err.message || "Failed to save document");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.projects.documents.delete(projectId, document.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("Document deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete document");
    },
  });

  const debounceSave = useCallback(
    (newTitle: string, newContent: string) => {
      setSaveStatus("unsaved");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSaveStatus("saving");
        updateMutation.mutate({ title: newTitle, content: newContent });
      }, 1000);
    },
    [updateMutation]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    debounceSave(val, content);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    debounceSave(title, val);
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onMoveUp}
            disabled={!canMoveUp}
          >
            <span className="text-xs">▲</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onMoveDown}
            disabled={!canMoveDown}
          >
            <span className="text-xs">▼</span>
          </Button>
        </div>
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Document title"
          className="font-medium"
        />
        <div className="flex items-center gap-1 shrink-0">
          <span className={cn(
            "text-xs",
            saveStatus === "saved" ? "text-green-500" : saveStatus === "saving" ? "text-muted-foreground" : "text-yellow-500"
          )}>
            {saveStatus === "saved" && <Check className="h-3 w-3 inline" />}
            {saveStatus === "saving" && <Loader2 className="h-3 w-3 inline animate-spin" />}
            {saveStatus === "saved" ? " Saved" : saveStatus === "saving" ? " Saving..." : " Unsaved"}
          </span>
          <ConfirmDeleteDialog
            title="Delete document"
            description="This will permanently delete this document. This action cannot be undone."
            onConfirm={() => deleteMutation.mutate()}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
          />
        </div>
      </div>
      <Textarea
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder="Write your context document in markdown..."
        rows={6}
        className="font-mono text-sm"
      />
    </div>
  );
}
