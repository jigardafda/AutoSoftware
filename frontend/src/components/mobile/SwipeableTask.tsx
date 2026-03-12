import { useState, useRef, useCallback, useEffect } from "react";
import { CheckCircle2, Archive, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { Badge } from "@/components/ui/badge";

interface SwipeableTaskProps {
  id: string;
  title: string;
  description?: string;
  status: string;
  type?: string;
  priority?: string;
  createdAt?: string;
  onComplete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (id: string) => void;
  className?: string;
}

const SWIPE_THRESHOLD = 80;
const MAX_SWIPE = 120;

export function SwipeableTask({
  id,
  title,
  description,
  status,
  type,
  priority,
  createdAt,
  onComplete,
  onArchive,
  onDelete,
  onClick,
  className,
}: SwipeableTaskProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [actionTriggered, setActionTriggered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { triggerLight, triggerSuccess, triggerWarning } = useHapticFeedback();

  // Reset swipe offset after action
  useEffect(() => {
    if (actionTriggered) {
      const timer = setTimeout(() => {
        setSwipeOffset(0);
        setActionTriggered(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [actionTriggered]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;

    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;

    // Limit swipe distance with resistance
    const limitedDiff = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, diff));
    const resistance = Math.abs(limitedDiff) > SWIPE_THRESHOLD ? 0.5 : 1;
    const resistedDiff = limitedDiff * resistance;

    setSwipeOffset(resistedDiff);

    // Trigger haptic feedback when crossing threshold
    if (Math.abs(resistedDiff) >= SWIPE_THRESHOLD && Math.abs(swipeOffset) < SWIPE_THRESHOLD) {
      triggerLight();
    }
  }, [isDragging, startX, swipeOffset, triggerLight]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);

    if (Math.abs(swipeOffset) >= SWIPE_THRESHOLD) {
      setActionTriggered(true);

      if (swipeOffset > 0) {
        // Swipe right - complete
        triggerSuccess();
        onComplete?.(id);
      } else {
        // Swipe left - archive/delete
        triggerWarning();
        if (onDelete) {
          onDelete(id);
        } else if (onArchive) {
          onArchive(id);
        }
      }
    } else {
      // Spring back
      setSwipeOffset(0);
    }
  }, [swipeOffset, id, onComplete, onArchive, onDelete, triggerSuccess, triggerWarning]);

  const handleClick = useCallback(() => {
    if (Math.abs(swipeOffset) < 10) {
      onClick?.(id);
    }
  }, [swipeOffset, onClick, id]);

  // Status badge color
  const getStatusColor = (s: string) => {
    switch (s) {
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

  // Priority badge color
  const getPriorityColor = (p: string) => {
    switch (p) {
      case "critical":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "high":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "low":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden rounded-lg", className)}
    >
      {/* Left action (complete) */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex items-center justify-start pl-4 transition-opacity",
          swipeOffset > SWIPE_THRESHOLD / 2 ? "opacity-100" : "opacity-0"
        )}
        style={{ width: Math.max(0, swipeOffset) }}
      >
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
            swipeOffset >= SWIPE_THRESHOLD
              ? "bg-green-500 text-white"
              : "bg-green-500/20 text-green-500"
          )}
        >
          <CheckCircle2 className="h-6 w-6" />
        </div>
      </div>

      {/* Right action (archive/delete) */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex items-center justify-end pr-4 transition-opacity",
          swipeOffset < -SWIPE_THRESHOLD / 2 ? "opacity-100" : "opacity-0"
        )}
        style={{ width: Math.max(0, -swipeOffset) }}
      >
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
            swipeOffset <= -SWIPE_THRESHOLD
              ? "bg-destructive text-destructive-foreground"
              : "bg-destructive/20 text-destructive"
          )}
        >
          {onDelete ? (
            <Trash2 className="h-6 w-6" />
          ) : (
            <Archive className="h-6 w-6" />
          )}
        </div>
      </div>

      {/* Main content */}
      <div
        className={cn(
          "relative z-10 bg-card border border-border p-4 transition-transform touch-pan-y",
          isDragging ? "" : "transition-all duration-200"
        )}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
      >
        <div className="flex flex-col gap-2">
          {/* Title */}
          <h4 className="font-medium text-foreground line-clamp-2">{title}</h4>

          {/* Description */}
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", getStatusColor(status))}>
              {status.replace("_", " ")}
            </Badge>

            {type && (
              <Badge variant="outline" className="text-xs bg-muted">
                {type}
              </Badge>
            )}

            {priority && (
              <Badge variant="outline" className={cn("text-xs", getPriorityColor(priority))}>
                {priority}
              </Badge>
            )}

            {createdAt && (
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDate(createdAt)}
              </span>
            )}
          </div>
        </div>

        {/* Swipe hints */}
        {!isDragging && swipeOffset === 0 && (
          <div className="absolute inset-y-0 right-2 flex items-center opacity-30 pointer-events-none">
            <div className="text-xs text-muted-foreground">&larr; swipe</div>
          </div>
        )}
      </div>
    </div>
  );
}
