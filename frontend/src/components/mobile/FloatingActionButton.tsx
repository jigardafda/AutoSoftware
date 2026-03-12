import { useState, useCallback, useEffect, useRef } from "react";
import { Plus, X, Mic, Camera, ClipboardList, Scan, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";

interface FABAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  color?: string;
  onClick: () => void;
}

interface FloatingActionButtonProps {
  onCreateTask?: () => void;
  onVoiceInput?: () => void;
  onUploadScreenshot?: () => void;
  onScanTrigger?: () => void;
  onQuickAI?: () => void;
  className?: string;
}

export function FloatingActionButton({
  onCreateTask,
  onVoiceInput,
  onUploadScreenshot,
  onScanTrigger,
  onQuickAI,
  className,
}: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { triggerLight, triggerSelection } = useHapticFeedback();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside as EventListener);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside as EventListener);
    };
  }, [isOpen]);

  // Close menu on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    triggerLight();
    setIsOpen((prev) => !prev);
  }, [triggerLight]);

  const handleActionClick = useCallback((action: FABAction) => {
    triggerSelection();
    action.onClick();
    setIsOpen(false);
  }, [triggerSelection]);

  // Build actions array based on provided callbacks
  const actions: FABAction[] = [];

  if (onCreateTask) {
    actions.push({
      id: "create-task",
      icon: <ClipboardList className="h-5 w-5" />,
      label: "New Task",
      color: "bg-blue-500 hover:bg-blue-600 text-white",
      onClick: onCreateTask,
    });
  }

  if (onVoiceInput) {
    actions.push({
      id: "voice-input",
      icon: <Mic className="h-5 w-5" />,
      label: "Voice Input",
      color: "bg-purple-500 hover:bg-purple-600 text-white",
      onClick: onVoiceInput,
    });
  }

  if (onUploadScreenshot) {
    actions.push({
      id: "upload-screenshot",
      icon: <Camera className="h-5 w-5" />,
      label: "Screenshot",
      color: "bg-green-500 hover:bg-green-600 text-white",
      onClick: onUploadScreenshot,
    });
  }

  if (onScanTrigger) {
    actions.push({
      id: "scan-trigger",
      icon: <Scan className="h-5 w-5" />,
      label: "Scan Repo",
      color: "bg-orange-500 hover:bg-orange-600 text-white",
      onClick: onScanTrigger,
    });
  }

  if (onQuickAI) {
    actions.push({
      id: "quick-ai",
      icon: <Sparkles className="h-5 w-5" />,
      label: "Ask AI",
      color: "bg-pink-500 hover:bg-pink-600 text-white",
      onClick: onQuickAI,
    });
  }

  return (
    <div
      ref={containerRef}
      className={cn("fixed bottom-20 right-4 z-40 lg:hidden", className)}
    >
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/50 backdrop-blur-sm z-[-1]"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Action buttons */}
      <div
        className={cn(
          "absolute bottom-16 right-0 flex flex-col-reverse items-end gap-3 transition-all duration-200",
          isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        {actions.map((action, index) => (
          <div
            key={action.id}
            className="flex items-center gap-3"
            style={{
              transitionDelay: isOpen ? `${index * 50}ms` : "0ms",
            }}
          >
            {/* Label */}
            <span
              className={cn(
                "rounded-full bg-card px-3 py-1.5 text-sm font-medium shadow-lg border border-border transition-all duration-200",
                isOpen ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
              )}
              style={{
                transitionDelay: isOpen ? `${index * 50 + 100}ms` : "0ms",
              }}
            >
              {action.label}
            </span>

            {/* Button */}
            <button
              onClick={() => handleActionClick(action)}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200",
                action.color || "bg-primary text-primary-foreground hover:bg-primary/90",
                isOpen ? "scale-100" : "scale-0"
              )}
              style={{
                transitionDelay: isOpen ? `${index * 50}ms` : "0ms",
              }}
            >
              {action.icon}
            </button>
          </div>
        ))}
      </div>

      {/* Main FAB */}
      <button
        onClick={handleToggle}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-all duration-200 hover:bg-primary/90 active:scale-95",
          isOpen && "rotate-45 bg-destructive hover:bg-destructive/90"
        )}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Plus className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}
