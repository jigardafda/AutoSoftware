import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface WorkspaceNotesProps {
  workspaceId: string;
  className?: string;
}

const STORAGE_KEY_PREFIX = "workspace-notes-";
const DEBOUNCE_MS = 800;
const SAVED_INDICATOR_MS = 1500;

export default function WorkspaceNotes({ workspaceId, className }: WorkspaceNotesProps) {
  const [content, setContent] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load notes from localStorage when workspaceId changes
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + workspaceId);
    setContent(stored ?? "");
    setShowSaved(false);
  }, [workspaceId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const saveToStorage = useCallback(
    (value: string) => {
      localStorage.setItem(STORAGE_KEY_PREFIX + workspaceId, value);
      setShowSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setShowSaved(false), SAVED_INDICATOR_MS);
    },
    [workspaceId]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setContent(value);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => saveToStorage(value), DEBOUNCE_MS);
    },
    [saveToStorage]
  );

  return (
    <div className={cn("relative flex flex-col h-full", className)}>
      <textarea
        value={content}
        onChange={handleChange}
        placeholder="Add notes for this workspace..."
        className="w-full h-full resize-none bg-transparent p-3 text-sm outline-none border border-border rounded-md focus:ring-1 focus:ring-ring"
      />
      {showSaved && (
        <span className="absolute top-2 right-3 text-xs text-muted-foreground animate-in fade-in fade-out">
          Saved
        </span>
      )}
    </div>
  );
}
