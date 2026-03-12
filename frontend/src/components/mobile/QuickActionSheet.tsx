import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Mic,
  Camera,
  Plus,
  Clock,
  ChevronRight,
  X,
  Upload,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { VoiceInput } from "./VoiceInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface QuickActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTask?: (description?: string) => void;
  onTaskClick?: (taskId: string) => void;
  onUploadScreenshot?: (file: File) => void;
}

type SheetView = "main" | "voice" | "upload";

export function QuickActionSheet({
  open,
  onOpenChange,
  onCreateTask,
  onTaskClick,
  onUploadScreenshot,
}: QuickActionSheetProps) {
  const [currentView, setCurrentView] = useState<SheetView>("main");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { triggerLight, triggerSuccess, triggerError } = useHapticFeedback();

  // Fetch recent tasks
  const { data: recentTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", { limit: "5" }],
    queryFn: () => api.tasks.list({ limit: "5" }),
    enabled: open,
  });

  // Handle voice input submit
  const handleVoiceSubmit = useCallback((text: string) => {
    triggerSuccess();
    onCreateTask?.(text);
    setCurrentView("main");
    onOpenChange(false);
  }, [onCreateTask, onOpenChange, triggerSuccess]);

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      triggerError();
      setUploadError("Please select an image file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      triggerError();
      setUploadError("File size must be less than 10MB");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      if (onUploadScreenshot) {
        await onUploadScreenshot(file);
        triggerSuccess();
        setCurrentView("main");
        onOpenChange(false);
      }
    } catch (err) {
      triggerError();
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [onUploadScreenshot, onOpenChange, triggerSuccess, triggerError]);

  // Handle quick actions
  const handleQuickAction = useCallback((action: "voice" | "upload" | "create") => {
    triggerLight();
    if (action === "voice") {
      setCurrentView("voice");
    } else if (action === "upload") {
      setCurrentView("upload");
    } else if (action === "create") {
      onCreateTask?.();
      onOpenChange(false);
    }
  }, [triggerLight, onCreateTask, onOpenChange]);

  // Handle task click
  const handleTaskClick = useCallback((taskId: string) => {
    triggerLight();
    onTaskClick?.(taskId);
    onOpenChange(false);
  }, [triggerLight, onTaskClick, onOpenChange]);

  // Reset view when sheet closes
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      setCurrentView("main");
      setUploadError(null);
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "in_progress":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "failed":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "pending":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-hidden">
        {currentView === "voice" ? (
          <VoiceInput
            onTranscriptSubmit={handleVoiceSubmit}
            onClose={() => setCurrentView("main")}
            placeholder="Describe your task..."
            className="h-full"
          />
        ) : currentView === "upload" ? (
          <div className="flex flex-col h-full">
            <SheetHeader className="pb-4">
              <div className="flex items-center justify-between">
                <SheetTitle>Upload Screenshot</SheetTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentView("main")}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <SheetDescription>
                Upload a screenshot to create a task or get AI assistance
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 flex flex-col items-center justify-center py-8">
              {isUploading ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </div>
              ) : (
                <label
                  htmlFor="screenshot-upload"
                  className={cn(
                    "flex flex-col items-center justify-center w-full max-w-sm aspect-video",
                    "border-2 border-dashed border-border rounded-lg cursor-pointer",
                    "hover:border-primary/50 hover:bg-muted/50 transition-colors",
                    uploadError && "border-destructive"
                  )}
                >
                  <div className="flex flex-col items-center justify-center p-6 text-center">
                    <div className="mb-4 rounded-full bg-muted p-4">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="mb-2 text-sm font-medium">Tap to upload screenshot</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
                  </div>
                  <input
                    id="screenshot-upload"
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </label>
              )}

              {uploadError && (
                <p className="mt-4 text-sm text-destructive">{uploadError}</p>
              )}
            </div>

            <div className="flex gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCurrentView("main")}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <Camera className="mr-2 h-4 w-4" />
                Take Photo
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Drag handle */}
            <div className="flex justify-center pb-2">
              <div className="h-1.5 w-12 rounded-full bg-muted" />
            </div>

            <SheetHeader className="pb-4">
              <SheetTitle>Quick Actions</SheetTitle>
            </SheetHeader>

            {/* Quick action buttons */}
            <div className="grid grid-cols-3 gap-3 pb-6">
              <button
                onClick={() => handleQuickAction("voice")}
                className="flex flex-col items-center gap-2 rounded-xl bg-purple-500/10 p-4 transition-colors hover:bg-purple-500/20 active:scale-95"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500 text-white">
                  <Mic className="h-6 w-6" />
                </div>
                <span className="text-xs font-medium text-purple-500">Voice</span>
              </button>

              <button
                onClick={() => handleQuickAction("upload")}
                className="flex flex-col items-center gap-2 rounded-xl bg-green-500/10 p-4 transition-colors hover:bg-green-500/20 active:scale-95"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white">
                  <Camera className="h-6 w-6" />
                </div>
                <span className="text-xs font-medium text-green-500">Screenshot</span>
              </button>

              <button
                onClick={() => handleQuickAction("create")}
                className="flex flex-col items-center gap-2 rounded-xl bg-blue-500/10 p-4 transition-colors hover:bg-blue-500/20 active:scale-95"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white">
                  <Plus className="h-6 w-6" />
                </div>
                <span className="text-xs font-medium text-blue-500">New Task</span>
              </button>
            </div>

            {/* Recent tasks */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Recent Tasks</span>
              </div>

              {tasksLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-lg bg-muted"
                    />
                  ))}
                </div>
              ) : recentTasks.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No recent tasks
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {recentTasks.slice(0, 5).map((task: any) => (
                    <button
                      key={task.id}
                      onClick={() => handleTaskClick(task.id)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.98]"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] px-1.5 py-0", getStatusColor(task.status))}
                          >
                            {task.status.replace("_", " ")}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(task.createdAt)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
