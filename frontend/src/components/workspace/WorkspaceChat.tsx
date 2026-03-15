import { useState, useCallback, useEffect, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Send, Bot, User, Loader2, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/websocket/WebSocketProvider";
import { ApprovalCard } from "./ApprovalCard";

interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: string;
  approval?: {
    id: string;
    title: string;
    description: string;
    details?: string;
    type: "file_edit" | "command" | "action";
    status: "pending" | "approved" | "rejected";
  };
}

interface WorkspaceChatProps {
  workspaceId: string;
  className?: string;
}

export function WorkspaceChat({ workspaceId, className }: WorkspaceChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();

  // Subscribe to workspace WebSocket events
  useEffect(() => {
    subscribe(`workspace:${workspaceId}`);

    const removeChat = addMessageHandler("workspace:chat", (payload: any) => {
      if (payload.workspaceId !== workspaceId) return;
      const msg: ChatMessage = {
        id: payload.id || crypto.randomUUID(),
        role: payload.role,
        content: payload.content,
        timestamp: payload.timestamp || new Date().toISOString(),
        approval: payload.approval,
      };
      setMessages((prev) => [...prev, msg]);
      setIsAgentTyping(false);
    });

    const removeTyping = addMessageHandler("workspace:typing", (payload: any) => {
      if (payload.workspaceId !== workspaceId) return;
      setIsAgentTyping(payload.isTyping);
    });

    const removeApproval = addMessageHandler("workspace:approval_update", (payload: any) => {
      if (payload.workspaceId !== workspaceId) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.approval?.id === payload.approvalId
            ? { ...msg, approval: { ...msg.approval!, status: payload.status } }
            : msg
        )
      );
    });

    return () => {
      unsubscribe(`workspace:${workspaceId}`);
      removeChat();
      removeTyping();
      removeApproval();
    };
  }, [workspaceId, subscribe, unsubscribe, addMessageHandler]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, msg]);
    setInput("");
    setIsAgentTyping(true);

    // Focus the input again
    inputRef.current?.focus();

    // In a real implementation, this would send via WebSocket or API
    // The response would come back through the WebSocket handler above
  }, [input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleApprove = useCallback((approvalId: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.approval?.id === approvalId
          ? { ...msg, approval: { ...msg.approval!, status: "approved" as const } }
          : msg
      )
    );
    // POST approval to API
  }, []);

  const handleReject = useCallback((approvalId: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.approval?.id === approvalId
          ? { ...msg, approval: { ...msg.approval!, status: "rejected" as const } }
          : msg
      )
    );
    // POST rejection to API
  }, []);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setShowScrollDown(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      behavior: "smooth",
    });
  }, [messages.length]);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Messages */}
      <div className="relative flex-1 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-sm font-semibold mb-1">Start a conversation</h3>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Send a message to the agent to begin working on your task.
            </p>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            followOutput="smooth"
            atBottomStateChange={handleAtBottomStateChange}
            className="h-full"
            itemContent={(_, message) => (
              <div
                key={message.id}
                className={cn(
                  "px-4 py-2",
                  message.role === "user" && "flex justify-end"
                )}
              >
                {message.approval ? (
                  <div className="max-w-[90%]">
                    <ApprovalCard
                      id={message.approval.id}
                      title={message.approval.title}
                      description={message.approval.description}
                      details={message.approval.details}
                      type={message.approval.type}
                      status={message.approval.status}
                      onApprove={handleApprove}
                      onReject={handleReject}
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground ml-auto"
                        : "bg-muted/60 border border-border/30",
                      message.role === "system" && "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs italic"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {message.role === "agent" && (
                        <Bot className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        <span className="block text-[10px] mt-1 opacity-50">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          />
        )}

        {/* Scroll to bottom FAB */}
        {showScrollDown && messages.length > 0 && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute bottom-2 right-4 h-8 w-8 rounded-full shadow-lg"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Typing indicator */}
      {isAgentTyping && (
        <div className="px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Agent is typing...</span>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border/50 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-lg border border-border/50 bg-background/50 px-3 py-2.5 text-sm",
              "placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
              "min-h-[40px] max-h-[120px] transition-all duration-200"
            )}
            style={{
              height: "auto",
              minHeight: "40px",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim()}
            className="h-10 w-10 shrink-0 rounded-lg"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-1.5 px-1">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
