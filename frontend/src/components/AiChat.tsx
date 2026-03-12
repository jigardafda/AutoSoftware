/**
 * AI Chat Component
 *
 * Main wrapper that integrates the AI Assistant Panel with the app.
 * Handles keyboard shortcuts and global state.
 */

import { useState, useEffect, useCallback } from "react";
import { AiAssistantPanel } from "./ai-assistant";

export function AiChat() {
  const [open, setOpen] = useState(false);

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
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-ai-chat", handler);
    return () => window.removeEventListener("open-ai-chat", handler);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <AiAssistantPanel
      isOpen={open}
      onClose={handleClose}
      defaultWidth={450}
      minWidth={350}
      maxWidth={800}
    />
  );
}
