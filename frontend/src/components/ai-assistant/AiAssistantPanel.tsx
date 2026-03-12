/**
 * AI Assistant Panel
 *
 * World-class conversational AI interface with:
 * - Resizable panel with draggable divider
 * - Context selection (global, project, repository)
 * - Conversation history with search
 * - MCP tool transparency
 * - Voice input/output
 * - Artifacts with live preview
 * - Copy/download message actions
 */

import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Sparkles,
  Send,
  Loader2,
  X,
  History,
  Plus,
  Settings,
  Mic,
  MoreHorizontal,
  GripVertical,
  Paperclip,
  Image,
  FileText,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
// ScrollArea removed - using native scroll for better scroll tracking
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConversationList } from "./ConversationList";
import { ChatMessage } from "./ChatMessage";
import { VoiceInput } from "./VoiceInput";
import { ContextSelector } from "./ContextSelector";
import { McpServerDialog } from "./McpServerDialog";
import { TTSProvider, useTTSContext } from "./TTSContext";

interface ThinkingStep {
  text: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    output: unknown;
    duration: number;
    error?: string;
  }>;
}

interface ActionButton {
  id: string;
  label: string;
  action: string;
  variant?: "default" | "primary" | "secondary" | "destructive";
  data?: Record<string, unknown>;
}

interface Message {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: ThinkingStep[]; // Intermediate reasoning steps
  isStreaming?: boolean; // Whether we're still receiving content
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    output: unknown;
    duration: number;
    error?: string;
  }>;
  artifacts?: Array<{
    id: string;
    type: string;
    name: string;
    content: string;
    language?: string;
  }>;
  attachments?: Array<{
    id: string;
    type: string;
    name: string;
    url?: string;
    mimeType?: string;
  }>;
  actions?: ActionButton[]; // Interactive action buttons
  voiceInput?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  createdAt?: string;
}

// Helper types for accessing array element types
type ToolCallItem = NonNullable<Message["toolCalls"]>[number];
type ArtifactItem = NonNullable<Message["artifacts"]>[number];

interface PendingAttachment {
  id: string;
  type: "image" | "file";
  name: string;
  file: File;
  previewUrl?: string;
}

interface StreamChunk {
  type: "text" | "thinking" | "intermediate" | "tool_start" | "tool_end" | "artifact" | "actions" | "done" | "error";
  text?: string;
  toolCall?: Partial<ToolCallItem>;
  artifact?: ArtifactItem;
  actions?: ActionButton[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  error?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function AiAssistantPanel(props: Props) {
  return (
    <TTSProvider>
      <AiAssistantPanelInner {...props} />
    </TTSProvider>
  );
}

function AiAssistantPanelInner({
  isOpen,
  onClose,
  defaultWidth = 450,
  minWidth = 350,
  maxWidth = 800,
}: Props) {
  // TTS context for settings toggle
  const tts = useTTSContext();
  const queryClient = useQueryClient();
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMcpSettings, setShowMcpSettings] = useState(false);

  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [contextType, setContextType] = useState<"global" | "project" | "repository">("global");
  const [contextId, setContextId] = useState<string | undefined>();

  // Message state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<Partial<ToolCallItem> | null>(null);

  // Track when we've just finished streaming to prevent conversation sync from overwriting
  const justFinishedStreamingRef = useRef(false);

  // Voice state
  const [isVoiceMode, setIsVoiceMode] = useState(false);

  // Attachment state
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch conversation when selected
  const { data: conversation, isLoading: isLoadingConversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => (conversationId ? api.chat.getConversation(conversationId) : null),
    enabled: !!conversationId,
  });

  // Update messages when conversation loads (but not while streaming or just after)
  useEffect(() => {
    // Don't overwrite optimistic messages while streaming
    if (isStreaming) return;

    // Don't overwrite messages right after streaming finished (race condition prevention)
    if (justFinishedStreamingRef.current) {
      justFinishedStreamingRef.current = false;
      return;
    }

    // Only sync if we have messages from the server
    // For new conversations, conversation.messages will be empty - don't wipe local state
    if (conversation?.messages && conversation.messages.length > 0) {
      setMessages((prevMessages) => {
        // Build a map of existing actions by message ID to preserve them
        const existingActionsMap = new Map<string, ActionButton[]>();
        prevMessages.forEach((msg) => {
          if (msg.id && msg.actions && msg.actions.length > 0) {
            existingActionsMap.set(msg.id, msg.actions);
          }
        });

        return conversation.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          thinking: m.thinking || [],
          toolCalls: m.toolCalls || [],
          artifacts: m.artifacts || [],
          attachments: m.attachments || [],
          voiceInput: m.voiceInput,
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
          costUsd: m.costUsd,
          createdAt: m.createdAt,
          // Preserve actions from previous state (they're not stored in DB)
          actions: existingActionsMap.get(m.id) || [],
        }));
      });
    }
  }, [conversation, isStreaming]);

  // Create conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: () => {
      // Only include contextId if it's defined
      const body: { contextType: typeof contextType; contextId?: string } = { contextType };
      if (contextId) body.contextId = contextId;
      return api.chat.createConversation(body);
    },
    onSuccess: (data) => {
      setConversationId(data.id);
      // Don't clear messages here - we might have optimistic messages already
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  // Track if user has scrolled up (to disable auto-scroll)
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Handle scroll events to detect user scrolling up
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Check if user is near the bottom (within 100px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setUserHasScrolledUp(!isNearBottom);
  }, []);

  // Auto-scroll on new messages (only if user hasn't scrolled up)
  useEffect(() => {
    if (!userHasScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, userHasScrolledUp]);

  // Reset scroll tracking when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      setUserHasScrolledUp(false);
    }
  }, [isStreaming]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !isStreaming) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isStreaming]);

  // Handle resize dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.min(Math.max(newWidth, minWidth), maxWidth));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, minWidth, maxWidth]);

  // Create new conversation if none exists
  const ensureConversation = useCallback(async () => {
    if (!conversationId) {
      const result = await createConversationMutation.mutateAsync();
      return result.id;
    }
    return conversationId;
  }, [conversationId, createConversationMutation]);

  // Handle action button clicks from chat messages
  const handleActionClick = useCallback(
    async (action: ActionButton) => {
      if (isStreaming) return;

      // Handle different action types
      switch (action.action) {
        case "start_task":
          // Start the task and send a follow-up message
          if (action.data?.taskId) {
            setInput(`Start task ${action.data.taskId}`);
            // Auto-submit after a short delay
            setTimeout(() => {
              const form = document.querySelector("form");
              form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            }, 100);
          }
          break;

        case "view_task":
          // Navigate to task detail page
          if (action.data?.taskId) {
            window.location.href = `/tasks/${action.data.taskId}`;
          }
          break;

        case "confirm":
          // Send confirmation message
          setInput("Yes, please proceed");
          setTimeout(() => {
            const form = document.querySelector("form");
            form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          }, 100);
          break;

        case "cancel":
          // Send cancellation message
          setInput("No, cancel this");
          setTimeout(() => {
            const form = document.querySelector("form");
            form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          }, 100);
          break;

        default:
          // Generic action - send as message
          setInput(`${action.label}`);
          setTimeout(() => {
            const form = document.querySelector("form");
            form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          }, 100);
      }
    },
    [isStreaming]
  );

  // Handle send message
  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if ((!input.trim() && pendingAttachments.length === 0) || isStreaming) return;

      const userMsg = input.trim();
      const attachmentsToSend = [...pendingAttachments];
      setInput("");
      setPendingAttachments([]);

      // Set streaming EARLY to prevent conversation sync from overwriting optimistic messages
      // This must happen BEFORE ensureConversation() which triggers a query refetch
      setIsStreaming(true);
      abortControllerRef.current = new AbortController();

      // Ensure we have a conversation
      const convId = await ensureConversation();
      if (!convId) {
        setIsStreaming(false);
        abortControllerRef.current = null;
        // Restore attachments on failure
        setPendingAttachments(attachmentsToSend);
        return;
      }

      // Add user message optimistically with attachments
      const userMessage: Message = {
        role: "user",
        content: userMsg,
        attachments: attachmentsToSend.map((a) => ({
          id: a.id,
          type: a.type,
          name: a.name,
          url: a.previewUrl,
          mimeType: a.file.type,
        })),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Add empty assistant message for streaming
      const assistantMessage: Message = {
        role: "assistant",
        content: "",
        thinking: [],
        isStreaming: true,
        toolCalls: [],
        artifacts: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Track conversation segments chronologically
      // Each segment has: text (before tool), toolCall (if any), then we start a new segment
      // ALL text during tool usage goes into segments as "thinking" steps
      // Only the FINAL text segment (after all tools complete) becomes the main content
      interface Segment {
        text: string;
        toolCall?: ToolCallItem;
      }
      const segments: Segment[] = [];
      let currentSegmentText = "";     // Text accumulating in current segment
      let hasUsedAnyTools = false;     // Track if any tools have been used at all

      try {
        // Build FormData if we have attachments, otherwise use JSON
        let requestInit: RequestInit;

        if (attachmentsToSend.length > 0) {
          const formData = new FormData();
          formData.append("message", userMsg);
          formData.append("stream", "true");
          attachmentsToSend.forEach((attachment) => {
            formData.append("attachments", attachment.file, attachment.name);
          });
          requestInit = {
            method: "POST",
            credentials: "include",
            body: formData,
            signal: abortControllerRef.current.signal,
          };
        } else {
          requestInit = {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: userMsg,
              stream: true,
            }),
            signal: abortControllerRef.current.signal,
          };
        }

        const response = await fetch(api.chat.chatEndpoint(convId), requestInit);

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data: StreamChunk = JSON.parse(line.slice(6));

                // Helper to build thinking steps from segments
                const buildThinkingSteps = (): ThinkingStep[] => {
                  return segments
                    .filter(s => s.text.trim() || s.toolCall)
                    .map(s => ({
                      text: s.text.trim(),
                      toolCalls: s.toolCall ? [s.toolCall] : undefined,
                    }));
                };

                // Helper to update message state
                const updateMessage = (updates: Partial<Message>) => {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "assistant") {
                      updated[updated.length - 1] = { ...last, ...updates };
                    }
                    return updated;
                  });
                };

                // Handle thinking/intermediate chunks - accumulate in current segment
                if ((data.type === "thinking" || data.type === "intermediate") && data.text) {
                  currentSegmentText += data.text;
                  // Update UI to show current thinking
                  const thinkingSteps = buildThinkingSteps();
                  // Add current in-progress segment
                  if (currentSegmentText.trim()) {
                    thinkingSteps.push({ text: currentSegmentText });
                  }
                  updateMessage({
                    thinking: thinkingSteps.length > 0 ? thinkingSteps : undefined,
                    content: "", // Don't show content until streaming is done
                  });
                }

                // Handle text chunks - ALL text during streaming goes to current segment
                // We only separate final content from thinking at the END when "done" is received
                if (data.type === "text" && data.text) {
                  currentSegmentText += data.text;
                  const thinkingSteps = buildThinkingSteps();
                  // Add current in-progress segment
                  if (currentSegmentText.trim()) {
                    thinkingSteps.push({ text: currentSegmentText });
                  }
                  updateMessage({
                    thinking: thinkingSteps.length > 0 ? thinkingSteps : undefined,
                    content: "", // Don't show content until streaming is done
                  });
                }

                if (data.type === "tool_start" && data.toolCall) {
                  hasUsedAnyTools = true;
                  setCurrentToolCall(data.toolCall);
                  // Save current segment text (will be paired with tool when it completes)
                  // Don't finalize the segment yet - wait for tool_end
                }

                if (data.type === "tool_end" && data.toolCall) {
                  const toolCall = data.toolCall as ToolCallItem;
                  hasUsedAnyTools = true;
                  // Complete the current segment with this tool call
                  segments.push({
                    text: currentSegmentText,
                    toolCall: toolCall,
                  });
                  currentSegmentText = ""; // Reset for next segment

                  // Update UI with completed segments
                  const thinkingSteps = buildThinkingSteps();
                  updateMessage({
                    thinking: thinkingSteps,
                    toolCalls: segments.filter(s => s.toolCall).map(s => s.toolCall!),
                    content: "", // Don't show content until done
                  });
                  setCurrentToolCall(null);
                }

                if (data.type === "artifact" && data.artifact) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "assistant") {
                      const artifact = data.artifact as ArtifactItem;
                      updated[updated.length - 1] = {
                        ...last,
                        artifacts: [...(last.artifacts || []), artifact],
                      };
                    }
                    return updated;
                  });
                }

                // Handle interactive action buttons
                if (data.type === "actions" && data.actions) {
                  console.log("[ACTIONS DEBUG] Received actions chunk:", data.actions);
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    console.log("[ACTIONS DEBUG] Last message before update:", last?.role, last?.actions);
                    if (last && last.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        actions: [...(last.actions || []), ...data.actions!],
                      };
                      console.log("[ACTIONS DEBUG] Updated message actions:", updated[updated.length - 1].actions);
                    }
                    return updated;
                  });
                }

                if (data.type === "done" && data.usage) {
                  // Finalize the message - separate thinking from final content
                  let finalContent = "";
                  let finalThinking: ThinkingStep[] | undefined = undefined;

                  if (hasUsedAnyTools) {
                    // Tools were used:
                    // - All completed segments (with tools) become thinking steps
                    // - The current segment text (after the last tool) becomes the final content
                    const thinkingSteps = buildThinkingSteps();
                    finalThinking = thinkingSteps.length > 0 ? thinkingSteps : undefined;
                    finalContent = currentSegmentText.trim();
                  } else {
                    // No tools were used - all accumulated text is the final content
                    finalContent = currentSegmentText.trim();
                    finalThinking = undefined;
                  }

                  updateMessage({
                    id: data.messageId,
                    thinking: finalThinking,
                    content: finalContent,
                    toolCalls: segments.filter(s => s.toolCall).map(s => s.toolCall!),
                    isStreaming: false,
                    inputTokens: data.usage?.inputTokens,
                    outputTokens: data.usage?.outputTokens,
                    costUsd: data.usage?.costUsd,
                  });
                }

                if (data.type === "error") {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        content: `Error: ${data.error}`,
                      };
                    }
                    return updated;
                  });
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }

        // Refresh conversation list and mark specific conversation as stale for future loads
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant" && !last.content) {
              updated[updated.length - 1] = {
                ...last,
                content: "Sorry, I encountered an error. Please try again.",
              };
            }
            return updated;
          });
        }
      } finally {
        // Set flag to prevent conversation sync from overwriting streamed messages
        justFinishedStreamingRef.current = true;
        setIsStreaming(false);
        abortControllerRef.current = null;
        setCurrentToolCall(null);
      }
    },
    [input, isStreaming, pendingAttachments, ensureConversation, queryClient]
  );

  // Handle voice input
  const handleVoiceResult = useCallback(
    (transcript: string) => {
      setInput(transcript);
      setIsVoiceMode(false);
      // Auto-send after voice input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    },
    []
  );

  // Handle new conversation
  const handleNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
  }, []);

  // Handle context change
  const handleContextChange = useCallback(
    (type: "global" | "project" | "repository", id?: string) => {
      setContextType(type);
      setContextId(id);
      handleNewConversation();
    },
    [handleNewConversation]
  );

  // Handle file attachment from input
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: PendingAttachment[] = Array.from(files).map((file) => {
      const isImage = file.type.startsWith("image/");
      return {
        id: crypto.randomUUID(),
        type: isImage ? "image" : "file",
        name: file.name,
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      };
    });

    setPendingAttachments((prev) => [...prev, ...newAttachments]);
    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  // Handle paste event for screenshots
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const attachment: PendingAttachment = {
            id: crypto.randomUUID(),
            type: "image",
            name: `Screenshot ${new Date().toLocaleTimeString()}.png`,
            file,
            previewUrl: URL.createObjectURL(file),
          };
          setPendingAttachments((prev) => [...prev, attachment]);
        }
        break;
      }
    }
  }, []);

  // Remove pending attachment
  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      pendingAttachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, []);

  // Stop streaming
  const handleStopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Submit on Cmd/Ctrl + Enter
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && isOpen) {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, handleSend]);

  if (!isOpen) return null;

  return (
    <TooltipProvider>
      <>
        {/* Overlay for mobile only */}
        <div
          className={cn(
            "fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden",
            isDragging && "cursor-col-resize"
          )}
          onClick={onClose}
        />

        {/* Full-screen drag overlay when resizing */}
        {isDragging && (
          <div className="fixed inset-0 z-[60] cursor-col-resize" />
        )}

        {/* Panel - side-by-side on desktop, overlay on mobile */}
        <div
          ref={panelRef}
          className={cn(
            // Mobile: fixed overlay
            "fixed top-0 right-0 h-full z-50",
            // Desktop: part of flex layout, fills container height
            "lg:relative lg:z-auto lg:h-full",
            // Common styles
            "bg-background border-l flex flex-col shrink-0",
            isDragging && "select-none"
          )}
          style={{ width: panelWidth }}
        >
        {/* Resize handle - wider hitbox for easier grabbing */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-3 -ml-1.5 cursor-col-resize hover:bg-primary/20 transition-colors",
            "flex items-center justify-center group z-10",
            isDragging && "bg-primary/30"
          )}
          onMouseDown={handleMouseDown}
        >
          <GripVertical className="h-6 w-6 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity -ml-2" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-semibold">AI Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Conversation History</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewConversation}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Conversation</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {tts.isSupported && (
                  <DropdownMenuItem onClick={tts.toggleEnabled}>
                    {tts.settings.enabled ? (
                      <>
                        <VolumeX className="h-4 w-4 mr-2" />
                        Disable Text-to-Speech
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-4 w-4 mr-2" />
                        Enable Text-to-Speech
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowMcpSettings(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  MCP Servers
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Context Selector */}
        <div className="px-4 py-2 border-b shrink-0">
          <ContextSelector
            contextType={contextType}
            contextId={contextId}
            onChange={handleContextChange}
          />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Conversation history sidebar */}
          {showHistory && (
            <div className="w-64 border-r flex flex-col shrink-0">
              <ConversationList
                selectedId={conversationId}
                onSelect={(id) => {
                  setConversationId(id);
                  setShowHistory(false);
                }}
                onClose={() => setShowHistory(false)}
                contextType={contextType}
                contextId={contextId}
              />
            </div>
          )}

          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Messages - using native scroll for better scroll tracking */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden"
            >
              <div className="p-4 space-y-4">
                {isLoadingConversation && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!isLoadingConversation && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Sparkles className="h-12 w-12 text-primary/30 mb-4" />
                    <h3 className="font-medium text-lg mb-2">How can I help you?</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Ask about your codebase, create tasks, or get insights from your
                      repositories and scans.
                    </p>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <ChatMessage
                    key={msg.id || idx}
                    message={msg}
                    isStreaming={isStreaming && idx === messages.length - 1 && msg.role === "assistant"}
                    currentToolCall={
                      idx === messages.length - 1 && msg.role === "assistant"
                        ? currentToolCall
                        : null
                    }
                    onActionClick={handleActionClick}
                  />
                ))}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input area */}
            <div className="p-4 border-t shrink-0">
              {isVoiceMode ? (
                <VoiceInput
                  onResult={handleVoiceResult}
                  onCancel={() => setIsVoiceMode(false)}
                />
              ) : (
                <form onSubmit={handleSend} className="space-y-2">
                  {/* Pending Attachments Preview */}
                  {pendingAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-lg border border-dashed">
                      {pendingAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="relative group flex items-center gap-2 px-2 py-1.5 bg-background rounded-md border"
                        >
                          {attachment.type === "image" && attachment.previewUrl ? (
                            <img
                              src={attachment.previewUrl}
                              alt={attachment.name}
                              className="h-8 w-8 object-cover rounded"
                            />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-xs truncate max-w-[100px]">{attachment.name}</span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(attachment.id)}
                            className="p-0.5 hover:bg-destructive/20 rounded-full transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <textarea
                        ref={inputRef as any}
                        placeholder="Ask about your codebase... (Paste screenshots with Cmd+V)"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        disabled={isStreaming}
                        className={cn(
                          "w-full min-h-[80px] max-h-48 px-4 py-3 pr-28",
                          "bg-muted/50 rounded-xl border resize-none",
                          "focus:outline-none focus:ring-2 focus:ring-primary/20",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          "text-sm leading-relaxed"
                        )}
                        rows={3}
                      />
                      <div className="absolute right-3 bottom-2 flex items-center gap-1">
                        {/* Hidden file input */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.go,.rs,.java,.c,.cpp,.h,.css,.html"
                          className="hidden"
                          onChange={handleFileSelect}
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isStreaming}
                            >
                              <Paperclip className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Attach Files</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setIsVoiceMode(true)}
                              disabled={isStreaming}
                            >
                              <Mic className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Voice Input</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    {isStreaming ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={handleStopStreaming}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!input.trim() && pendingAttachments.length === 0}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Press <kbd className="px-1 py-0.5 rounded border bg-muted text-[10px] font-mono">Enter</kbd> to send,{" "}
                    <kbd className="px-1 py-0.5 rounded border bg-muted text-[10px] font-mono">Cmd+V</kbd> to paste screenshots
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

        {/* MCP Server Settings Dialog */}
        <McpServerDialog
          open={showMcpSettings}
          onOpenChange={setShowMcpSettings}
        />
      </>
    </TooltipProvider>
  );
}
