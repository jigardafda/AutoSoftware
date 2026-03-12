import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useWebSocket } from "./websocket";

// Types for the chat system
export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  previewUrl?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  status: "pending" | "running" | "completed" | "error";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  durationMs?: number;
}

export interface Artifact {
  id: string;
  type: "code" | "html" | "mermaid" | "svg" | "markdown" | "json";
  title: string;
  content: string;
  language?: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: ChatAttachment[];
  toolCalls?: ToolCall[];
  artifacts?: Artifact[];
  feedback?: "positive" | "negative" | null;
  createdAt: string;
  updatedAt?: string;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  contextType: "global" | "project" | "repository";
  contextId?: string;
  contextName?: string;
  messageCount: number;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatContext {
  type: "global" | "project" | "repository";
  id?: string;
  name?: string;
}

interface ChatContextType {
  // Panel state
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  panelWidth: number;
  setPanelWidth: (width: number) => void;
  isMinimized: boolean;
  setIsMinimized: (minimized: boolean) => void;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;

  // Context selection
  context: ChatContext;
  setContext: (context: ChatContext) => void;

  // Conversations
  conversations: Conversation[];
  currentConversation: Conversation | null;
  loadConversations: () => Promise<void>;
  createConversation: () => Promise<Conversation>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  // Messages
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (content: string, attachments?: File[]) => Promise<void>;
  regenerateMessage: (messageId: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  provideFeedback: (messageId: string, type: "positive" | "negative") => Promise<void>;
  stopGeneration: () => void;

  // Connection state
  isConnected: boolean;
}

const ChatContextReact = createContext<ChatContextType | null>(null);

export function useChatContext() {
  const context = useContext(ChatContextReact);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

interface ChatProviderProps {
  children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  // Panel state
  const [isOpen, setIsOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(420);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Context selection
  const [context, setContext] = useState<ChatContext>({ type: "global" });

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Refs for streaming
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  // WebSocket for real-time updates
  const { isConnected, addMessageHandler, subscribe, unsubscribe } = useWebSocket();

  // Keyboard shortcut: Cmd+Shift+A to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "a") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      // Also support Cmd+J for compatibility
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Listen for external open events
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener("open-ai-chat", handler);
    return () => window.removeEventListener("open-ai-chat", handler);
  }, []);

  // Subscribe to conversation updates via WebSocket
  useEffect(() => {
    if (currentConversation) {
      subscribe(`conversation:${currentConversation.id}`);
      return () => unsubscribe(`conversation:${currentConversation.id}`);
    }
  }, [currentConversation, subscribe, unsubscribe]);

  // Handle real-time message updates
  useEffect(() => {
    const removeHandler = addMessageHandler("chat:message", (payload) => {
      if (payload.conversationId === currentConversation?.id) {
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === payload.id);
          if (existing) {
            return prev.map((m) => (m.id === payload.id ? { ...m, ...payload } : m));
          }
          return [...prev, payload];
        });
      }
    });
    return removeHandler;
  }, [addMessageHandler, currentConversation?.id]);

  // Handle streaming chunks
  useEffect(() => {
    const removeHandler = addMessageHandler("chat:chunk", (payload) => {
      if (payload.messageId === streamingMessageIdRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? { ...m, content: m.content + payload.content }
              : m
          )
        );
      }
    });
    return removeHandler;
  }, [addMessageHandler]);

  // Handle tool calls
  useEffect(() => {
    const removeHandler = addMessageHandler("chat:toolCall", (payload) => {
      if (payload.messageId === streamingMessageIdRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? {
                  ...m,
                  toolCalls: m.toolCalls
                    ? [...m.toolCalls.filter((t) => t.id !== payload.toolCall.id), payload.toolCall]
                    : [payload.toolCall],
                }
              : m
          )
        );
      }
    });
    return removeHandler;
  }, [addMessageHandler]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (context.type !== "global") {
        params.set("contextType", context.type);
        if (context.id) params.set("contextId", context.id);
      }
      const res = await fetch(`/api/chat/conversations?${params}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }, [context]);

  // Create new conversation
  const createConversation = useCallback(async (): Promise<Conversation> => {
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contextType: context.type,
        contextId: context.id,
      }),
    });
    if (!res.ok) {
      throw new Error("Failed to create conversation");
    }
    const data = await res.json();
    const conversation = data.data as Conversation;
    setConversations((prev) => [conversation, ...prev]);
    setCurrentConversation(conversation);
    setMessages([]);
    return conversation;
  }, [context]);

  // Select conversation
  const selectConversation = useCallback(async (id: string) => {
    const conversation = conversations.find((c) => c.id === id);
    if (!conversation) return;

    setCurrentConversation(conversation);

    // Load messages
    try {
      const res = await fetch(`/api/chat/conversations/${id}/messages`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }, [conversations]);

  // Delete conversation
  const deleteConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/chat/conversations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  }, [currentConversation]);

  // Send message
  const sendMessage = useCallback(
    async (content: string, attachments?: File[]) => {
      if (isStreaming) return;

      // Create conversation if needed
      let convId = currentConversation?.id;
      if (!convId) {
        const newConv = await createConversation();
        convId = newConv.id;
      }

      // Add user message optimistically
      const userMessage: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        conversationId: convId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Add assistant placeholder
      const assistantId = `temp-assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        conversationId: convId,
        role: "assistant",
        content: "",
        isStreaming: true,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      streamingMessageIdRef.current = assistantId;
      setIsStreaming(true);

      // Create abort controller
      abortControllerRef.current = new AbortController();

      try {
        // Prepare form data for attachments
        const formData = new FormData();
        formData.append("content", content);
        if (attachments) {
          attachments.forEach((file) => formData.append("attachments", file));
        }

        const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
          method: "POST",
          credentials: "include",
          body: formData,
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let realMessageId: string | null = null;
        let toolCalls: ToolCall[] = [];
        let artifacts: Artifact[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;

            try {
              const data = JSON.parse(line.slice(6));

              // Handle different event types
              if (data.type === "message_start") {
                realMessageId = data.messageId;
                // Update user message with real ID
                if (data.userMessageId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === userMessage.id ? { ...m, id: data.userMessageId } : m
                    )
                  );
                }
              } else if (data.type === "content_delta") {
                accumulatedContent += data.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: accumulatedContent, id: realMessageId || m.id }
                      : m
                  )
                );
              } else if (data.type === "tool_call_start") {
                const newToolCall: ToolCall = {
                  id: data.toolCallId,
                  name: data.name,
                  input: data.input || {},
                  status: "running",
                  startedAt: new Date().toISOString(),
                };
                toolCalls = [...toolCalls, newToolCall];
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId || m.id === realMessageId
                      ? { ...m, toolCalls }
                      : m
                  )
                );
              } else if (data.type === "tool_call_complete") {
                toolCalls = toolCalls.map((tc) =>
                  tc.id === data.toolCallId
                    ? {
                        ...tc,
                        output: data.output,
                        status: "completed",
                        completedAt: new Date().toISOString(),
                        durationMs: data.durationMs,
                      }
                    : tc
                );
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId || m.id === realMessageId
                      ? { ...m, toolCalls }
                      : m
                  )
                );
              } else if (data.type === "tool_call_error") {
                toolCalls = toolCalls.map((tc) =>
                  tc.id === data.toolCallId
                    ? {
                        ...tc,
                        error: data.error,
                        status: "error",
                        completedAt: new Date().toISOString(),
                      }
                    : tc
                );
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId || m.id === realMessageId
                      ? { ...m, toolCalls }
                      : m
                  )
                );
              } else if (data.type === "artifact") {
                const newArtifact: Artifact = {
                  id: data.id,
                  type: data.artifactType,
                  title: data.title,
                  content: data.content,
                  language: data.language,
                  createdAt: new Date().toISOString(),
                };
                artifacts = [...artifacts, newArtifact];
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId || m.id === realMessageId
                      ? { ...m, artifacts }
                      : m
                  )
                );
              } else if (data.type === "message_complete") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          id: realMessageId || m.id,
                          isStreaming: false,
                          updatedAt: new Date().toISOString(),
                        }
                      : m
                  )
                );
              } else if (data.type === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: `Error: ${data.error}`,
                          isStreaming: false,
                        }
                      : m
                  )
                );
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // User stopped generation
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false, content: m.content || "[Generation stopped]" }
                : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: "Sorry, I encountered an error. Please try again.",
                    isStreaming: false,
                  }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        streamingMessageIdRef.current = null;
        abortControllerRef.current = null;
      }
    },
    [isStreaming, currentConversation, createConversation]
  );

  // Stop generation
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Regenerate message
  const regenerateMessage = useCallback(
    async (messageId: string) => {
      if (isStreaming || !currentConversation) return;

      // Find the message to regenerate
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      // Remove this message and all following
      const messagesToKeep = messages.slice(0, messageIndex);
      setMessages(messagesToKeep);

      // Find the last user message
      const lastUserMessage = [...messagesToKeep]
        .reverse()
        .find((m) => m.role === "user");

      if (lastUserMessage) {
        await sendMessage(lastUserMessage.content);
      }
    },
    [isStreaming, currentConversation, messages, sendMessage]
  );

  // Edit message
  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (isStreaming || !currentConversation) return;

      // Find the message to edit
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      // Remove this message and all following
      const messagesToKeep = messages.slice(0, messageIndex);
      setMessages(messagesToKeep);

      // Send the edited message
      await sendMessage(content);
    },
    [isStreaming, currentConversation, messages, sendMessage]
  );

  // Provide feedback
  const provideFeedback = useCallback(
    async (messageId: string, type: "positive" | "negative") => {
      try {
        await fetch(`/api/chat/messages/${messageId}/feedback`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, feedback: type } : m))
        );
      } catch (err) {
        console.error("Failed to provide feedback:", err);
      }
    },
    []
  );

  // Load conversations when context changes
  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen, context, loadConversations]);

  const value: ChatContextType = {
    isOpen,
    setIsOpen,
    panelWidth,
    setPanelWidth,
    isMinimized,
    setIsMinimized,
    showHistory,
    setShowHistory,
    context,
    setContext,
    conversations,
    currentConversation,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    messages,
    isStreaming,
    sendMessage,
    regenerateMessage,
    editMessage,
    provideFeedback,
    stopGeneration,
    isConnected,
  };

  return (
    <ChatContextReact.Provider value={value}>
      {children}
    </ChatContextReact.Provider>
  );
}
