/**
 * Feedback Buttons Component
 *
 * Provides thumbs up/down UI for user feedback on AI suggestions.
 * Part of Phase 5 Feedback Loops.
 *
 * Features:
 * - Thumbs up/down buttons with animation
 * - Optional note/reason input
 * - Learned patterns display
 * - Feedback history
 */

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Check,
  X,
  Loader2,
  Brain,
  History,
  ChevronDown,
  ChevronRight,
  Trash2,
  Sparkles,
  AlertCircle,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface FeedbackSignal {
  id: string;
  type: "thumbs_up" | "thumbs_down";
  rating: "positive" | "negative";
  suggestionType: string;
  context?: string;
  note?: string;
  createdAt: string;
}

interface LearnedPattern {
  id: string;
  pattern: string;
  category: string;
  confidence: number;
  usageCount: number;
  lastUsed: string;
}

interface RejectionMemory {
  id: string;
  rejectionReason: string;
  learnedAction: string;
  occurrences: number;
  lastOccurred: string;
}

interface FeedbackSummary {
  totalFeedback: number;
  positiveRate: number;
  topPatterns: LearnedPattern[];
  recentRejections: RejectionMemory[];
  improvementSuggestions: string[];
}

interface FeedbackButtonsProps {
  repositoryId: string;
  projectId?: string;
  taskId?: string;
  messageId?: string;
  suggestionType: string;
  context?: string;
  compact?: boolean;
  showStats?: boolean;
  onFeedbackSubmitted?: (type: "thumbs_up" | "thumbs_down") => void;
}

// ============================================================================
// API Functions
// ============================================================================

async function submitFeedback(data: {
  type: "thumbs_up" | "thumbs_down";
  repositoryId: string;
  projectId?: string;
  taskId?: string;
  messageId?: string;
  suggestionType: string;
  context?: string;
  note?: string;
}): Promise<FeedbackSignal> {
  const res = await fetch("/api/feedback/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || "Failed to submit feedback");
  }

  const result = await res.json();
  return result.data;
}

async function fetchLearnedPatterns(
  repositoryId: string,
  projectId?: string
): Promise<LearnedPattern[]> {
  const params = new URLSearchParams({ repositoryId });
  if (projectId) params.set("projectId", projectId);
  params.set("limit", "10");

  const res = await fetch(`/api/feedback/patterns?${params}`, {
    credentials: "include",
  });

  if (!res.ok) return [];

  const result = await res.json();
  return result.data;
}

async function fetchFeedbackSummary(
  repositoryId: string,
  projectId?: string
): Promise<FeedbackSummary | null> {
  const params = new URLSearchParams({ repositoryId });
  if (projectId) params.set("projectId", projectId);

  const res = await fetch(`/api/feedback/summary?${params}`, {
    credentials: "include",
  });

  if (!res.ok) return null;

  const result = await res.json();
  return result.data;
}

async function deletePattern(patternId: string): Promise<void> {
  const res = await fetch(`/api/feedback/patterns/${patternId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to delete pattern");
  }
}

// ============================================================================
// Sub-components
// ============================================================================

function FeedbackButton({
  type,
  selected,
  disabled,
  onClick,
  compact,
}: {
  type: "up" | "down";
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = type === "up" ? ThumbsUp : ThumbsDown;
  const color = type === "up" ? "text-green-500" : "text-red-500";
  const bgColor = type === "up" ? "bg-green-500/10" : "bg-red-500/10";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={compact ? "icon" : "sm"}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "transition-all duration-200",
              selected && bgColor,
              selected && color,
              !selected && "hover:bg-muted"
            )}
          >
            <Icon
              size={compact ? 14 : 16}
              className={cn(
                "transition-transform",
                selected && "scale-110",
                selected && type === "up" && "animate-bounce"
              )}
            />
            {!compact && (
              <span className="ml-1 text-xs">
                {type === "up" ? "Helpful" : "Not helpful"}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{type === "up" ? "This was helpful" : "This was not helpful"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function NoteInput({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (note: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [note, setNote] = useState("");

  const handleSubmit = () => {
    onSubmit(note);
  };

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Tell us more about your feedback (optional)..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="text-sm"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          <X size={14} className="mr-1" />
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 size={14} className="mr-1 animate-spin" />
          ) : (
            <Check size={14} className="mr-1" />
          )}
          Submit
        </Button>
      </div>
    </div>
  );
}

function PatternCard({
  pattern,
  onDelete,
}: {
  pattern: LearnedPattern;
  onDelete: () => void;
}) {
  const confidenceColor =
    pattern.confidence >= 0.8
      ? "text-green-500"
      : pattern.confidence >= 0.5
        ? "text-yellow-500"
        : "text-red-500";

  return (
    <div className="group rounded-lg border border-border/50 bg-card p-3 transition-colors hover:bg-accent/5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px]">
              {pattern.category.replace("_", " ")}
            </Badge>
            <span className={cn("text-[10px]", confidenceColor)}>
              {Math.round(pattern.confidence * 100)}% confident
            </span>
          </div>
          <p className="text-sm truncate">{pattern.pattern}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Used {pattern.usageCount} time{pattern.usageCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  );
}

function FeedbackStats({ summary }: { summary: FeedbackSummary }) {
  const [patternsOpen, setPatternsOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: deletePattern,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-summary"] });
    },
  });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Brain size={14} className="text-primary" />
          Learning Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{summary.totalFeedback}</div>
            <div className="text-xs text-muted-foreground">Total Feedback</div>
          </div>
          <div className="text-center">
            <div
              className={cn(
                "text-2xl font-bold",
                summary.positiveRate >= 0.7
                  ? "text-green-500"
                  : summary.positiveRate >= 0.5
                    ? "text-yellow-500"
                    : "text-red-500"
              )}
            >
              {Math.round(summary.positiveRate * 100)}%
            </div>
            <div className="text-xs text-muted-foreground">Positive Rate</div>
          </div>
        </div>

        {/* Learned patterns */}
        {summary.topPatterns.length > 0 && (
          <Collapsible open={patternsOpen} onOpenChange={setPatternsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Sparkles size={14} />
                  Learned Patterns ({summary.topPatterns.length})
                </span>
                {patternsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {summary.topPatterns.map((pattern) => (
                    <PatternCard
                      key={pattern.id}
                      pattern={pattern}
                      onDelete={() => deleteMutation.mutate(pattern.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Improvement suggestions */}
        {summary.improvementSuggestions.length > 0 && (
          <div className="rounded-lg bg-primary/5 p-3">
            <h4 className="text-xs font-medium mb-2 flex items-center gap-2">
              <TrendingUp size={12} />
              Suggestions
            </h4>
            <ul className="space-y-1">
              {summary.improvementSuggestions.map((suggestion, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-primary">-</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Rejection warnings */}
        {summary.recentRejections.length > 0 && (
          <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
            <h4 className="text-xs font-medium mb-2 flex items-center gap-2 text-red-500">
              <AlertCircle size={12} />
              Recent Rejection Patterns ({summary.recentRejections.length})
            </h4>
            <ul className="space-y-2">
              {summary.recentRejections.slice(0, 3).map((rejection) => (
                <li key={rejection.id} className="text-xs">
                  <p className="text-muted-foreground line-clamp-2">
                    {rejection.rejectionReason}
                  </p>
                  {rejection.learnedAction && (
                    <p className="text-green-600 dark:text-green-400 mt-1">
                      Instead: {rejection.learnedAction}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FeedbackButtons({
  repositoryId,
  projectId,
  taskId,
  messageId,
  suggestionType,
  context,
  compact = false,
  showStats = false,
  onFeedbackSubmitted,
}: FeedbackButtonsProps) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<"thumbs_up" | "thumbs_down" | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch feedback summary
  const { data: summary } = useQuery({
    queryKey: ["feedback-summary", repositoryId, projectId],
    queryFn: () => fetchFeedbackSummary(repositoryId, projectId),
    enabled: showStats,
    staleTime: 60000,
  });

  // Submit feedback mutation
  const mutation = useMutation({
    mutationFn: submitFeedback,
    onSuccess: (data) => {
      setSubmitted(true);
      setShowNoteInput(false);
      queryClient.invalidateQueries({ queryKey: ["feedback-summary"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-patterns"] });
      onFeedbackSubmitted?.(data.type);
    },
  });

  const handleFeedback = useCallback(
    (type: "thumbs_up" | "thumbs_down") => {
      setSelectedType(type);

      // For negative feedback, prompt for reason
      if (type === "thumbs_down") {
        setShowNoteInput(true);
      } else {
        // Submit positive feedback immediately
        mutation.mutate({
          type,
          repositoryId,
          projectId,
          taskId,
          messageId,
          suggestionType,
          context,
        });
      }
    },
    [repositoryId, projectId, taskId, messageId, suggestionType, context, mutation]
  );

  const handleNoteSubmit = useCallback(
    (note: string) => {
      if (!selectedType) return;

      mutation.mutate({
        type: selectedType,
        repositoryId,
        projectId,
        taskId,
        messageId,
        suggestionType,
        context,
        note: note || undefined,
      });
    },
    [selectedType, repositoryId, projectId, taskId, messageId, suggestionType, context, mutation]
  );

  const handleNoteCancel = useCallback(() => {
    setShowNoteInput(false);
    setSelectedType(null);
  }, []);

  // Submitted state
  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check size={14} className="text-green-500" />
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  // Note input state
  if (showNoteInput) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <ThumbsDown size={14} className="text-red-500" />
          <span>What could be improved?</span>
        </div>
        <NoteInput
          onSubmit={handleNoteSubmit}
          onCancel={handleNoteCancel}
          isSubmitting={mutation.isPending}
        />
      </div>
    );
  }

  // Default state with buttons
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <FeedbackButton
          type="up"
          selected={selectedType === "thumbs_up"}
          disabled={mutation.isPending}
          onClick={() => handleFeedback("thumbs_up")}
          compact={compact}
        />
        <FeedbackButton
          type="down"
          selected={selectedType === "thumbs_down"}
          disabled={mutation.isPending}
          onClick={() => handleFeedback("thumbs_down")}
          compact={compact}
        />

        {/* Stats popover */}
        {showStats && summary && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size={compact ? "icon" : "sm"} className="ml-2">
                <BarChart3 size={compact ? 14 : 16} />
                {!compact && <span className="ml-1 text-xs">Insights</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <FeedbackStats summary={summary} />
            </PopoverContent>
          </Popover>
        )}

        {mutation.isPending && (
          <Loader2 size={14} className="ml-2 animate-spin text-muted-foreground" />
        )}
      </div>

      {mutation.isError && (
        <p className="text-xs text-red-500">
          Failed to submit feedback. Please try again.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Inline Feedback Widget
// ============================================================================

interface InlineFeedbackProps {
  repositoryId: string;
  projectId?: string;
  taskId?: string;
  messageId?: string;
  suggestionType: string;
  context?: string;
}

/**
 * Compact inline feedback widget for use in message bubbles
 */
export function InlineFeedback({
  repositoryId,
  projectId,
  taskId,
  messageId,
  suggestionType,
  context,
}: InlineFeedbackProps) {
  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <FeedbackButtons
        repositoryId={repositoryId}
        projectId={projectId}
        taskId={taskId}
        messageId={messageId}
        suggestionType={suggestionType}
        context={context}
        compact
      />
    </div>
  );
}

// ============================================================================
// Feedback Panel
// ============================================================================

interface FeedbackPanelProps {
  repositoryId: string;
  projectId?: string;
}

/**
 * Full feedback panel with history and patterns
 */
export function FeedbackPanel({ repositoryId, projectId }: FeedbackPanelProps) {
  const { data: summary, isLoading } = useQuery({
    queryKey: ["feedback-summary", repositoryId, projectId],
    queryFn: () => fetchFeedbackSummary(repositoryId, projectId),
    staleTime: 30000,
  });

  const { data: patterns = [] } = useQuery({
    queryKey: ["feedback-patterns", repositoryId, projectId],
    queryFn: () => fetchLearnedPatterns(repositoryId, projectId),
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Brain size={32} className="mx-auto text-muted-foreground mb-2" />
          <h3 className="font-medium">No Feedback Yet</h3>
          <p className="text-sm text-muted-foreground">
            Start providing feedback to help the AI learn your preferences.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <FeedbackStats summary={summary} />;
}

// ============================================================================
// Approach Feedback
// ============================================================================

interface ApproachFeedbackProps {
  taskId: string;
  repositoryId: string;
  projectId?: string;
  approachIndex: number;
  approachDetails: {
    name: string;
    description: string;
    complexity: string;
  };
  selected: boolean;
  onFeedback?: () => void;
}

/**
 * Feedback component for approach selection
 */
export function ApproachFeedback({
  taskId,
  repositoryId,
  projectId,
  approachIndex,
  approachDetails,
  selected,
  onFeedback,
}: ApproachFeedbackProps) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: {
      selected: boolean;
      reason?: string;
    }) => {
      const res = await fetch("/api/feedback/approach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          taskId,
          repositoryId,
          projectId,
          approachIndex,
          selected: data.selected,
          reason: data.reason,
          approachDetails,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit feedback");
      }

      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["feedback-patterns"] });
      onFeedback?.();
    },
  });

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check size={12} className="text-green-500" />
        <span>Preference recorded</span>
      </div>
    );
  }

  if (showReason && !selected) {
    return (
      <div className="space-y-2">
        <Textarea
          placeholder="Why didn't you choose this approach? (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="text-xs"
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReason(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate({ selected: false, reason })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              "Submit"
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Auto-submit for selected approach
  if (selected && !submitted) {
    mutation.mutate({ selected: true });
    return null;
  }

  // Show button for rejected approach
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setShowReason(true)}
      className="text-xs text-muted-foreground"
    >
      <MessageSquare size={12} className="mr-1" />
      Tell us why
    </Button>
  );
}

export default FeedbackButtons;
