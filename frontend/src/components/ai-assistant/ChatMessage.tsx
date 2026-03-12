/**
 * Chat Message Component
 *
 * Displays a single chat message with:
 * - Markdown rendering
 * - Tool call transparency (expandable)
 * - Artifacts with live preview
 * - Copy and download buttons
 * - Feedback buttons
 */

import { useState, useCallback, memo } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Sparkles,
  User,
  Copy,
  Download,
  Check,
  ChevronDown,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Wrench,
  Clock,
  AlertCircle,
  ExternalLink,
  FileCode,
  Image as ImageIcon,
  FileText,
  Volume2,
  VolumeX,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import { ArtifactPreview } from "./ArtifactPreview";
import { useTTSContextOptional } from "./TTSContext";
import { stripMarkdownForTTS } from "@/hooks/useTTS";

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  duration: number;
  error?: string;
}

interface Artifact {
  id: string;
  type: string;
  name: string;
  content: string;
  language?: string;
}

interface Attachment {
  id: string;
  type: string;
  name: string;
  url?: string;
  mimeType?: string;
}

interface ThinkingStep {
  text: string;
  toolCalls?: ToolCall[];
}

interface ActionButton {
  id: string;
  label: string;
  action: string; // e.g., "start_task", "view_task", "cancel"
  variant?: "default" | "primary" | "secondary" | "destructive";
  data?: Record<string, unknown>; // Additional data like taskId
}

interface Message {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: ThinkingStep[];
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  artifacts?: Artifact[];
  attachments?: Attachment[];
  voiceInput?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  createdAt?: string;
  feedback?: string;
  actions?: ActionButton[]; // Interactive action buttons
}

interface Props {
  message: Message;
  isStreaming?: boolean;
  currentToolCall?: Partial<ToolCall> | null;
  onActionClick?: (action: ActionButton) => void;
}

// Regex to match artifact markers in content: [Artifact: filename]
const ARTIFACT_MARKER_REGEX = /\[Artifact:\s*([^\]]+)\]/g;

// Component that renders content with clickable artifact links
function ContentWithArtifacts({
  content,
  artifacts,
  onArtifactClick,
}: {
  content: string;
  artifacts?: Artifact[];
  onArtifactClick: (artifact: Artifact) => void;
}) {
  // Parse content and replace artifact markers with clickable buttons
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  // Reset regex
  ARTIFACT_MARKER_REGEX.lastIndex = 0;

  while ((match = ARTIFACT_MARKER_REGEX.exec(content)) !== null) {
    const [fullMatch, artifactName] = match;
    const startIndex = match.index;

    // Add text before the marker
    if (startIndex > lastIndex) {
      const textBefore = content.slice(lastIndex, startIndex);
      parts.push(
        <Markdown key={`text-${keyIndex++}`}>{textBefore}</Markdown>
      );
    }

    // Find matching artifact
    const trimmedName = artifactName.trim();
    const matchingArtifact = artifacts?.find(
      (a) => a.name === trimmedName || a.name.includes(trimmedName) || trimmedName.includes(a.name)
    );

    if (matchingArtifact) {
      // Render as clickable button
      parts.push(
        <button
          key={`artifact-${keyIndex++}`}
          onClick={() => onArtifactClick(matchingArtifact)}
          className="inline-flex items-center gap-1.5 px-2 py-1 my-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors cursor-pointer border border-primary/20"
        >
          <FileCode className="h-3.5 w-3.5" />
          <span>{matchingArtifact.name}</span>
          <ExternalLink className="h-3 w-3 opacity-60" />
        </button>
      );
    } else {
      // No matching artifact found - render as styled text (orphan reference)
      parts.push(
        <span
          key={`orphan-${keyIndex++}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 my-1 rounded-md bg-muted text-muted-foreground text-sm"
        >
          <FileCode className="h-3.5 w-3.5" />
          <span>{trimmedName}</span>
        </span>
      );
    }

    lastIndex = startIndex + fullMatch.length;
  }

  // Add remaining text after last marker
  if (lastIndex < content.length) {
    const remainingText = content.slice(lastIndex);
    parts.push(
      <Markdown key={`text-${keyIndex++}`}>{remainingText}</Markdown>
    );
  }

  // If no markers found, just render as markdown
  if (parts.length === 0) {
    return <Markdown>{content}</Markdown>;
  }

  return <>{parts}</>;
}

// Action Buttons Component for interactive chat actions
function ActionButtons({
  actions,
  onActionClick,
  disabled = false,
}: {
  actions: ActionButton[];
  onActionClick?: (action: ActionButton) => void;
  disabled?: boolean;
}) {
  if (!actions || actions.length === 0) return null;

  const getButtonVariant = (variant?: string) => {
    switch (variant) {
      case "primary":
        return "default";
      case "destructive":
        return "destructive";
      case "secondary":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
      {actions.map((action) => (
        <Button
          key={action.id}
          variant={getButtonVariant(action.variant)}
          size="sm"
          onClick={() => onActionClick?.(action)}
          disabled={disabled}
          className="gap-1.5"
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming,
  currentToolCall,
  onActionClick,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [artifactPreview, setArtifactPreview] = useState<Artifact | null>(null);
  const [localFeedback, setLocalFeedback] = useState<"positive" | "negative" | null>(
    message.feedback as "positive" | "negative" | null
  );

  // TTS context (optional - works without provider too)
  const tts = useTTSContextOptional();
  const messageId = message.id || `temp-${Date.now()}`;
  const isSpeakingThisMessage = tts?.isMessageSpeaking(messageId) ?? false;

  // Feedback mutation with optimistic update
  const feedbackMutation = useMutation({
    mutationFn: (feedback: "positive" | "negative") =>
      api.chat.addFeedback(message.id!, feedback),
    onMutate: (feedback) => {
      // Optimistically update UI
      setLocalFeedback(feedback);
    },
    onError: (err: Error, feedback) => {
      console.error("Failed to record feedback:", err);
      // Revert on error
      setLocalFeedback(null);
    },
  });

  // Handle TTS speak/stop
  const handleTTSToggle = useCallback(() => {
    if (!tts || !message.content) return;

    if (isSpeakingThisMessage) {
      tts.stopMessage(messageId);
    } else {
      // Strip markdown for cleaner speech
      const cleanText = stripMarkdownForTTS(message.content);
      tts.speakMessage(messageId, cleanText);
    }
  }, [tts, message.content, messageId, isSpeakingThisMessage]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  // Download as markdown
  const handleDownload = useCallback(() => {
    const blob = new Blob([message.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `message-${message.id || Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [message.content, message.id]);

  // Handle feedback
  const handleFeedback = useCallback(
    (feedback: "positive" | "negative") => {
      if (!message.id) return;
      feedbackMutation.mutate(feedback);
    },
    [message.id, feedbackMutation]
  );

  const isUser = message.role === "user";
  const hasToolCalls = (message.toolCalls?.length ?? 0) > 0 || currentToolCall;
  const hasArtifacts = (message.artifacts?.length ?? 0) > 0;
  const hasThinking = (message.thinking?.length ?? 0) > 0;

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className="shrink-0 mt-1">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            isUser ? "bg-primary text-primary-foreground" : "bg-primary/10"
          )}
        >
          {isUser ? (
            <User className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4 text-primary" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className={cn("flex-1 min-w-0", isUser ? "text-right" : "text-left")}>
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn("flex flex-wrap gap-2 mb-2", isUser && "justify-end")}>
            {message.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm"
              >
                {att.type === "image" ? (
                  <ImageIcon className="h-4 w-4" />
                ) : att.type === "code" ? (
                  <FileCode className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span className="truncate max-w-[150px]">{att.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Voice input indicator */}
        {message.voiceInput && (
          <Badge variant="outline" className="mb-2 text-xs">
            Voice input
          </Badge>
        )}

        {/* Streaming indicator - show when AI is working, even without thinking steps */}
        {isStreaming && !isUser && !message.content && (
          <div className="mb-2 rounded-lg bg-muted/30 border border-dashed border-muted-foreground/30 p-3 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>
                {currentToolCall
                  ? `Using ${currentToolCall.name?.replace(/_/g, " ")}...`
                  : hasToolCalls
                    ? `Executed ${message.toolCalls?.length || 0} tool${(message.toolCalls?.length || 0) !== 1 ? "s" : ""}, generating response...`
                    : "Working on your request..."}
              </span>
            </div>
            {/* Show thinking steps if we have them */}
            {message.thinking?.map((step, idx) => (
              <div key={idx} className="space-y-2">
                {step.text && (
                  <p className="text-sm text-muted-foreground italic whitespace-pre-wrap break-words">
                    {step.text}
                  </p>
                )}
                {step.toolCalls && step.toolCalls.length > 0 && (
                  <div className="space-y-1">
                    {step.toolCalls.map((tool) => (
                      <ToolCallCard key={tool.id} tool={tool} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* Show completed tools so far */}
            {hasToolCalls && !hasThinking && (
              <div className="space-y-1">
                {message.toolCalls?.map((tool) => (
                  <ToolCallCard key={tool.id} tool={tool} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Thinking process - shown after streaming completes */}
        {hasThinking && !isUser && !isStreaming && (
          <Collapsible
            open={thinkingExpanded}
            onOpenChange={setThinkingExpanded}
            className="mb-2"
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {thinkingExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <Wrench className="h-3 w-3" />
                {message.thinking?.length} step{message.thinking?.length !== 1 ? "s" : ""}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <span className="text-muted-foreground">
                    ({message.toolCalls.length} tool{message.toolCalls.length !== 1 ? "s" : ""})
                  </span>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-3 pl-2 border-l-2 border-muted">
                {message.thinking?.map((step, idx) => (
                  <div key={idx} className="space-y-2">
                    {step.text && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        {step.text}
                      </p>
                    )}
                    {step.toolCalls && step.toolCalls.length > 0 && (
                      <div className="space-y-1">
                        {step.toolCalls.map((tool) => (
                          <ToolCallCard key={tool.id} tool={tool} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Message bubble - only show when there's content */}
        {(isUser || message.content) && (
          <div
            className={cn(
              "rounded-xl px-4 py-3 inline-block max-w-full overflow-hidden",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 border"
            )}
          >
            {/* Message content with artifact link support */}
            {message.content && (
              <div className={cn("text-sm break-words", isUser ? "" : "prose prose-sm dark:prose-invert max-w-none [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:break-words [&_p]:break-words")}>
                {isUser ? (
                  <span className="whitespace-pre-wrap break-words">{message.content}</span>
                ) : (
                  <ContentWithArtifacts
                    content={message.content}
                    artifacts={message.artifacts}
                    onArtifactClick={setArtifactPreview}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Tool calls (expandable) - show after streaming when no thinking steps */}
        {hasToolCalls && !isUser && !hasThinking && !isStreaming && (
          <Collapsible
            open={toolsExpanded}
            onOpenChange={setToolsExpanded}
            className="mt-2"
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
              >
                {toolsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <Wrench className="h-3 w-3" />
                {message.toolCalls?.length || 0} tool call
                {(message.toolCalls?.length || 0) !== 1 ? "s" : ""}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-2">
                {message.toolCalls?.map((tool) => (
                  <ToolCallCard key={tool.id} tool={tool} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Artifacts */}
        {hasArtifacts && !isUser && (
          <div className="mt-3 space-y-2">
            {message.artifacts?.map((artifact) => (
              <div
                key={artifact.id}
                className="flex items-center gap-2 p-2 rounded-lg border bg-card cursor-pointer hover:bg-accent transition-colors"
                onClick={() => setArtifactPreview(artifact)}
              >
                <FileCode className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium flex-1 truncate">
                  {artifact.name}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {artifact.type}
                </Badge>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}

        {/* Interactive Action Buttons */}
        {(() => {
          // Debug logging for action buttons rendering
          if (!isUser && message.role === "assistant") {
            console.log("[RENDER DEBUG] ActionButtons check:", {
              hasActions: !!message.actions,
              actionsLength: message.actions?.length ?? 0,
              isStreamingProp: isStreaming,
              shouldRender: !isUser && message.actions && message.actions.length > 0 && !isStreaming,
              actions: message.actions,
            });
          }
          return null;
        })()}
        {!isUser && message.actions && message.actions.length > 0 && !isStreaming && (
          <ActionButtons
            actions={message.actions}
            onActionClick={onActionClick}
            disabled={isStreaming}
          />
        )}

        {/* Actions (assistant messages only) */}
        {!isUser && message.content && (
          <div className="flex items-center gap-1 mt-2">
            {/* TTS Speaker Button */}
            {tts?.isSupported && tts?.settings.enabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 relative",
                      isSpeakingThisMessage && "text-primary"
                    )}
                    onClick={handleTTSToggle}
                    disabled={isStreaming}
                  >
                    {isSpeakingThisMessage ? (
                      <>
                        {/* Pulsing animation when speaking */}
                        <span className="absolute inset-0 rounded-md bg-primary/20 animate-pulse" />
                        <Square className="h-3.5 w-3.5 relative z-10" />
                      </>
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isSpeakingThisMessage ? "Stop Speaking" : "Listen"}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleDownload}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>

            {message.id && (
              <>
                <div className="w-px h-4 bg-border mx-1" />
                {localFeedback ? (
                  // Show confirmation after feedback
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Check className="h-3 w-3 text-green-500" />
                    Thanks!
                  </span>
                ) : (
                  // Show feedback buttons
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleFeedback("positive")}
                          disabled={feedbackMutation.isPending}
                        >
                          {feedbackMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ThumbsUp className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Helpful</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleFeedback("negative")}
                          disabled={feedbackMutation.isPending}
                        >
                          {feedbackMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ThumbsDown className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Not helpful</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </>
            )}

            {/* Token/cost info */}
            {message.inputTokens && message.outputTokens && (
              <span className="text-[10px] text-muted-foreground ml-2">
                {message.inputTokens + message.outputTokens} tokens
                {message.costUsd && ` · $${message.costUsd.toFixed(4)}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Artifact preview modal */}
      {artifactPreview && (
        <ArtifactPreview
          artifact={artifactPreview}
          onClose={() => setArtifactPreview(null)}
        />
      )}
    </div>
  );
});

// Tool call card component
function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card text-sm">
      <button
        className="w-full flex items-center gap-2 p-2 hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="font-mono text-xs">{tool.name}</span>
        <div className="flex-1" />
        {tool.error ? (
          <AlertCircle className="h-3 w-3 text-destructive" />
        ) : (
          <Check className="h-3 w-3 text-green-500" />
        )}
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {tool.duration}ms
        </span>
      </button>

      {expanded && (
        <div className="border-t p-2 space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Input:</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] px-1"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(JSON.stringify(tool.input, null, 2));
                }}
              >
                <Copy className="h-2.5 w-2.5 mr-1" />
                Copy
              </Button>
            </div>
            <pre className="mt-1 p-2 rounded bg-muted text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {tool.error ? "Error:" : "Output:"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] px-1"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(tool.error || JSON.stringify(tool.output, null, 2));
                }}
              >
                <Copy className="h-2.5 w-2.5 mr-1" />
                Copy
              </Button>
            </div>
            <pre
              className={cn(
                "mt-1 p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-60 overflow-y-auto",
                tool.error ? "bg-destructive/10 text-destructive" : "bg-muted"
              )}
            >
              {tool.error || JSON.stringify(tool.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
