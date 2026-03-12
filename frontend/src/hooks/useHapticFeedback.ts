import { useCallback, useMemo } from "react";

export type HapticFeedbackType = "light" | "medium" | "heavy" | "selection" | "success" | "warning" | "error";

export interface UseHapticFeedbackReturn {
  isSupported: boolean;
  trigger: (type?: HapticFeedbackType) => void;
  triggerLight: () => void;
  triggerMedium: () => void;
  triggerHeavy: () => void;
  triggerSelection: () => void;
  triggerSuccess: () => void;
  triggerWarning: () => void;
  triggerError: () => void;
}

/**
 * Custom hook for haptic feedback using the Vibration API
 * Provides fallback for unsupported browsers
 */
export function useHapticFeedback(): UseHapticFeedbackReturn {
  // Check if vibration API is supported
  const isSupported = useMemo(() => {
    return typeof window !== "undefined" && "vibrate" in navigator;
  }, []);

  // Vibration patterns for different feedback types (in milliseconds)
  const patterns: Record<HapticFeedbackType, number | number[]> = useMemo(() => ({
    light: 10,
    medium: 25,
    heavy: 50,
    selection: 15,
    success: [25, 50, 25],
    warning: [30, 30, 30],
    error: [50, 50, 50, 50],
  }), []);

  const trigger = useCallback((type: HapticFeedbackType = "medium") => {
    if (!isSupported) {
      return;
    }

    try {
      const pattern = patterns[type];
      navigator.vibrate(pattern);
    } catch {
      // Silently fail if vibration fails
    }
  }, [isSupported, patterns]);

  const triggerLight = useCallback(() => trigger("light"), [trigger]);
  const triggerMedium = useCallback(() => trigger("medium"), [trigger]);
  const triggerHeavy = useCallback(() => trigger("heavy"), [trigger]);
  const triggerSelection = useCallback(() => trigger("selection"), [trigger]);
  const triggerSuccess = useCallback(() => trigger("success"), [trigger]);
  const triggerWarning = useCallback(() => trigger("warning"), [trigger]);
  const triggerError = useCallback(() => trigger("error"), [trigger]);

  return {
    isSupported,
    trigger,
    triggerLight,
    triggerMedium,
    triggerHeavy,
    triggerSelection,
    triggerSuccess,
    triggerWarning,
    triggerError,
  };
}
