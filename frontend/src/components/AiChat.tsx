import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { Sparkles, Send, Loader2, User } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * Render basic markdown: **bold**, `code`, and line breaks.
 */
function renderMessageContent(content: string) {
  if (!content) return null;

  // Split on line breaks first
  const lines = content.split("\n");

  return lines.map((line, lineIdx) => {
    // Split into segments for bold and code
    const parts: (string | { type: "bold" | "code"; text: string })[] = [];
    let remaining = line;

    while (remaining.length > 0) {
      // Check for bold **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Check for inline code `text`
      const codeMatch = remaining.match(/`(.+?)`/);

      // Find the earliest match
      let earliest: { type: "bold" | "code"; match: RegExpMatchArray } | null =
        null;

      if (boldMatch && boldMatch.index !== undefined) {
        earliest = { type: "bold", match: boldMatch };
      }
      if (
        codeMatch &&
        codeMatch.index !== undefined &&
        (!earliest || codeMatch.index < (earliest.match.index ?? Infinity))
      ) {
        earliest = { type: "code", match: codeMatch };
      }

      if (!earliest || earliest.match.index === undefined) {
        parts.push(remaining);
        break;
      }

      // Add text before the match
      if (earliest.match.index > 0) {
        parts.push(remaining.slice(0, earliest.match.index));
      }

      parts.push({
        type: earliest.type,
        text: earliest.match[1],
      });

      remaining = remaining.slice(
        earliest.match.index + earliest.match[0].length
      );
    }

    return (
      <span key={lineIdx}>
        {lineIdx > 0 && <br />}
        {parts.map((part, partIdx) => {
          if (typeof part === "string") {
            return <span key={partIdx}>{part}</span>;
          }
          if (part.type === "bold") {
            return (
              <strong key={partIdx} className="font-semibold">
                {part.text}
              </strong>
            );
          }
          return (
            <code
              key={partIdx}
              className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
            >
              {part.text}
            </code>
          );
        })}
      </span>
    );
  });
}

export function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const location = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when sheet opens
  useEffect(() => {
    if (open) {
      // Small delay to allow animation
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Keyboard shortcut: Cmd+J / Ctrl+J
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Expose open setter for external triggers (Header button)
  // Use a custom event to decouple from prop drilling
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-ai-chat", handler);
    return () => window.removeEventListener("open-ai-chat", handler);
  }, []);

  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!input.trim() || isStreaming) return;

      const userMsg = input.trim();
      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setIsStreaming(true);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMsg,
            context: { page: location.pathname },
          }),
        });

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        content: last.content + data.text,
                      };
                    }
                    return updated;
                  });
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }
        }
      } catch (err) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant" && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content:
                "Sorry, I encountered an error. Please try again later.",
            };
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [input, isStreaming, location.pathname]
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-full sm:w-[400px] flex flex-col p-0"
      >
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ai" />
            AI Assistant
          </SheetTitle>
        </SheetHeader>

        {/* Messages area */}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Sparkles className="h-8 w-8 text-ai/40 mb-3" />
                <p className="text-sm font-medium">
                  How can I help you today?
                </p>
                <p className="text-xs mt-1">
                  Ask about your codebase, tasks, or repositories.
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="flex gap-2 max-w-[85%]">
                    <div className="shrink-0 mt-1">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ai/20">
                        <Sparkles className="h-3 w-3 text-ai" />
                      </div>
                    </div>
                    <div className="rounded-lg bg-ai/10 border border-ai/20 p-3 text-sm">
                      {msg.content ? (
                        renderMessageContent(msg.content)
                      ) : isStreaming &&
                        idx === messages.length - 1 ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin text-ai" />
                          <span className="text-muted-foreground text-xs">
                            Thinking...
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {msg.role === "user" && (
                  <div className="flex gap-2 max-w-[85%]">
                    <div className="rounded-lg bg-primary text-primary-foreground p-3 text-sm">
                      {msg.content}
                    </div>
                    <div className="shrink-0 mt-1">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                        <User className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="border-t p-4">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Ask about your codebase..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isStreaming}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isStreaming || !input.trim()}
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Press{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
              {"\u2318"}J
            </kbd>{" "}
            to toggle
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
