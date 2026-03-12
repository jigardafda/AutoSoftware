/**
 * TTS Context Provider
 *
 * Provides TTS functionality across the AI Assistant components
 * allowing shared state for speaking status across message components.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useTTS, type UseTTSReturn } from "@/hooks/useTTS";

const TTSContext = createContext<UseTTSReturn | null>(null);

export function TTSProvider({ children }: { children: ReactNode }) {
  const tts = useTTS();
  return <TTSContext.Provider value={tts}>{children}</TTSContext.Provider>;
}

export function useTTSContext(): UseTTSReturn {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error("useTTSContext must be used within a TTSProvider");
  }
  return context;
}

/**
 * Hook that returns null if not within TTSProvider (optional usage)
 */
export function useTTSContextOptional(): UseTTSReturn | null {
  return useContext(TTSContext);
}
