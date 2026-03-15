import { useState, useRef } from "react";
import { Zap, Check, Send, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionChoice, SelectionMode } from "./types";

interface ActionButtonsEntryProps {
  question?: string;
  choices: ActionChoice[];
  selectionMode: SelectionMode;
  onAction: (prompt: string) => void;
  className?: string;
}

export function ActionButtonsEntry({
  question,
  choices,
  selectionMode: initialMode,
  onAction,
  className,
}: ActionButtonsEntryProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [customText, setCustomText] = useState("");
  // Allow user to toggle between single and multi
  const [mode, setMode] = useState<SelectionMode>(initialMode);
  const inputRef = useRef<HTMLInputElement>(null);

  if (choices.length === 0) return null;

  const handleSubmit = () => {
    if (customText.trim()) {
      setSubmitted(true);
      onAction(customText.trim());
      return;
    }
    if (selectedIds.size === 0) return;

    const selected = choices.filter((c) => selectedIds.has(c.id));
    if (mode === "multi") {
      const prompt = selected.map((c) => c.prompt).join("\n");
      setSubmitted(true);
      onAction(prompt);
    } else {
      setSubmitted(true);
      onAction(selected[0].prompt);
    }
  };

  const handleButtonClick = (choice: ActionChoice) => {
    if (submitted) return;
    setSubmitted(true);
    onAction(choice.prompt);
    setSelectedIds(new Set([choice.id]));
  };

  const handleToggle = (choiceId: string) => {
    if (submitted) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (mode === "single") {
        next.clear();
        next.add(choiceId);
      } else {
        if (next.has(choiceId)) next.delete(choiceId);
        else next.add(choiceId);
      }
      return next;
    });
    setCustomText("");
  };

  const handleModeSwitch = () => {
    if (submitted) return;
    const newMode = mode === "single" ? "multi" : "single";
    setMode(newMode);
    // When switching to single and multiple are selected, keep only the first
    if (newMode === "single" && selectedIds.size > 1) {
      const first = selectedIds.values().next().value;
      setSelectedIds(new Set(first ? [first] : []));
    }
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && customText.trim()) {
      e.preventDefault();
      setSubmitted(true);
      onAction(customText.trim());
    }
  };

  // Button mode — simple row of clickable buttons
  if (mode === "button") {
    return (
      <div className={cn("flex items-start gap-2 px-1 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300", className)}>
        <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-1" />
        <div className="space-y-2 flex-1">
          {question && (
            <p className="text-xs text-muted-foreground">{question}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {choices.map((choice) => {
              const isSelected = selectedIds.has(choice.id);
              return (
                <Button
                  key={choice.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-7 text-xs transition-all",
                    submitted && !isSelected && "opacity-40 pointer-events-none",
                    submitted && isSelected && "ring-2 ring-primary/30",
                  )}
                  disabled={submitted}
                  onClick={() => handleButtonClick(choice)}
                >
                  {submitted && isSelected && <Check className="h-3 w-3 mr-1" />}
                  {choice.label}
                </Button>
              );
            })}
          </div>
          {!submitted && (
            <div className="flex items-center gap-1.5 mt-1">
              <input
                ref={inputRef}
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={handleCustomKeyDown}
                placeholder="Or type your own answer..."
                className="flex-1 h-7 rounded-md border border-border/50 bg-background/50 px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              {customText.trim() && (
                <Button
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    setSubmitted(true);
                    onAction(customText.trim());
                  }}
                >
                  <Send className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Radio / Checkbox mode
  const isMulti = mode === "multi";

  return (
    <div className={cn("flex items-start gap-2 px-1 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300", className)}>
      <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-1" />
      <div className="space-y-2 flex-1 min-w-0">
        {/* Header: question + multi-select toggle */}
        <div className="flex items-center justify-between gap-2">
          {question && (
            <p className="text-xs text-muted-foreground font-medium flex-1">{question}</p>
          )}
          {!submitted && (
            <button
              onClick={handleModeSwitch}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors shrink-0"
              title={isMulti ? "Switch to single select" : "Switch to multi select"}
            >
              {isMulti ? (
                <ToggleRight className="h-3.5 w-3.5 text-primary" />
              ) : (
                <ToggleLeft className="h-3.5 w-3.5" />
              )}
              <span>{isMulti ? "Multi" : "Single"}</span>
            </button>
          )}
        </div>

        <div className="space-y-1">
          {choices.map((choice) => {
            const isSelected = selectedIds.has(choice.id);
            return (
              <button
                key={choice.id}
                onClick={() => handleToggle(choice.id)}
                disabled={submitted}
                className={cn(
                  "flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-xs text-left transition-all",
                  isSelected
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border/40 bg-background/50 text-muted-foreground hover:border-border hover:bg-muted/30",
                  submitted && !isSelected && "opacity-40 pointer-events-none",
                  submitted && isSelected && "ring-1 ring-primary/20",
                  !submitted && "cursor-pointer",
                )}
              >
                {/* Radio or checkbox indicator */}
                <span
                  className={cn(
                    "shrink-0 flex items-center justify-center border transition-all",
                    isMulti
                      ? "h-3.5 w-3.5 rounded-[3px]"
                      : "h-3.5 w-3.5 rounded-full",
                    isSelected
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40",
                  )}
                >
                  {isSelected && (
                    isMulti ? (
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    )
                  )}
                </span>
                <span className="flex-1 break-words">{choice.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom answer input */}
        {!submitted && (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                if (e.target.value) setSelectedIds(new Set());
              }}
              onKeyDown={handleCustomKeyDown}
              placeholder="Or type your own answer..."
              className="flex-1 h-7 rounded-md border border-border/50 bg-background/50 px-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        )}

        {/* Submit button */}
        {!submitted && (
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={selectedIds.size === 0 && !customText.trim()}
            onClick={handleSubmit}
          >
            <Send className="h-3 w-3 mr-1" />
            {customText.trim()
              ? "Send"
              : isMulti
                ? `Submit (${selectedIds.size} selected)`
                : "Submit"}
          </Button>
        )}

        {/* Submitted confirmation */}
        {submitted && (
          <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
            <Check className="h-3 w-3 text-green-500" />
            {customText.trim() ? "Custom answer sent" : "Selection submitted"}
          </p>
        )}
      </div>
    </div>
  );
}
