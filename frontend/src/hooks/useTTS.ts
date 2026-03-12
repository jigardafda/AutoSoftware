/**
 * TTS (Text-to-Speech) Hook
 *
 * Provides TTS functionality with:
 * - Persistent settings stored in localStorage
 * - Global enable/disable toggle
 * - Auto-play option for AI responses
 * - Speaking state management
 */

import { useState, useEffect, useCallback } from "react";
import { useVoiceOutput } from "./useVoiceOutput";

const TTS_SETTINGS_KEY = "ai-assistant-tts-settings";

export interface TTSSettings {
  enabled: boolean;
  autoPlay: boolean;
  rate: number;
  pitch: number;
  volume: number;
  voiceURI?: string;
}

const DEFAULT_SETTINGS: TTSSettings = {
  enabled: true,
  autoPlay: false,
  rate: 1,
  pitch: 1,
  volume: 1,
};

/**
 * Load TTS settings from localStorage
 */
function loadSettings(): TTSSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(TTS_SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save TTS settings to localStorage
 */
function saveSettings(settings: TTSSettings): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export interface UseTTSReturn {
  // Speak text
  speak: (text: string) => void;
  // Stop speaking
  stop: () => void;
  // Pause speaking
  pause: () => void;
  // Resume speaking
  resume: () => void;
  // Current speaking state
  isSpeaking: boolean;
  // Is currently paused
  isPaused: boolean;
  // ID of the message currently being spoken
  speakingMessageId: string | null;
  // Speak a specific message by ID
  speakMessage: (messageId: string, text: string) => void;
  // Stop speaking a specific message
  stopMessage: (messageId: string) => void;
  // Check if a specific message is being spoken
  isMessageSpeaking: (messageId: string) => boolean;
  // TTS is supported
  isSupported: boolean;
  // Settings
  settings: TTSSettings;
  // Update settings
  updateSettings: (updates: Partial<TTSSettings>) => void;
  // Toggle enabled
  toggleEnabled: () => void;
  // Toggle auto-play
  toggleAutoPlay: () => void;
  // Available voices
  voices: SpeechSynthesisVoice[];
  // Current voice
  currentVoice: SpeechSynthesisVoice | null;
  // Set voice by URI
  setVoice: (voiceURI: string) => void;
  // Speaking progress (0-100)
  progress: number;
  // Error message if any
  error: string | null;
}

/**
 * Custom hook for TTS with persistent settings
 */
export function useTTS(): UseTTSReturn {
  const [settings, setSettings] = useState<TTSSettings>(loadSettings);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const voiceOutput = useVoiceOutput({
    rate: settings.rate,
    pitch: settings.pitch,
    volume: settings.volume,
    voice: settings.voiceURI,
    onEnd: () => {
      setSpeakingMessageId(null);
    },
    onError: () => {
      setSpeakingMessageId(null);
    },
  });

  // Sync settings changes to localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Update settings
  const updateSettings = useCallback((updates: Partial<TTSSettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };

      // Apply rate/pitch/volume changes to voice output
      if (updates.rate !== undefined) {
        voiceOutput.setRate(updates.rate);
      }
      if (updates.pitch !== undefined) {
        voiceOutput.setPitch(updates.pitch);
      }
      if (updates.volume !== undefined) {
        voiceOutput.setVolume(updates.volume);
      }
      if (updates.voiceURI !== undefined) {
        voiceOutput.setVoice(updates.voiceURI);
      }

      return newSettings;
    });
  }, [voiceOutput]);

  // Toggle enabled
  const toggleEnabled = useCallback(() => {
    setSettings((prev) => {
      const newSettings = { ...prev, enabled: !prev.enabled };
      // Stop any current speech when disabling
      if (!newSettings.enabled) {
        voiceOutput.stop();
        setSpeakingMessageId(null);
      }
      return newSettings;
    });
  }, [voiceOutput]);

  // Toggle auto-play
  const toggleAutoPlay = useCallback(() => {
    setSettings((prev) => ({ ...prev, autoPlay: !prev.autoPlay }));
  }, []);

  // Speak text
  const speak = useCallback(
    (text: string) => {
      if (!settings.enabled) return;
      voiceOutput.speak(text);
    },
    [settings.enabled, voiceOutput]
  );

  // Stop speaking
  const stop = useCallback(() => {
    voiceOutput.stop();
    setSpeakingMessageId(null);
  }, [voiceOutput]);

  // Speak a specific message
  const speakMessage = useCallback(
    (messageId: string, text: string) => {
      if (!settings.enabled) return;

      // If already speaking this message, stop it
      if (speakingMessageId === messageId) {
        stop();
        return;
      }

      // Stop any current speech and start new
      setSpeakingMessageId(messageId);
      voiceOutput.speak(text);
    },
    [settings.enabled, speakingMessageId, voiceOutput, stop]
  );

  // Stop speaking a specific message
  const stopMessage = useCallback(
    (messageId: string) => {
      if (speakingMessageId === messageId) {
        stop();
      }
    },
    [speakingMessageId, stop]
  );

  // Check if a specific message is being spoken
  const isMessageSpeaking = useCallback(
    (messageId: string) => {
      return speakingMessageId === messageId && voiceOutput.isSpeaking;
    },
    [speakingMessageId, voiceOutput.isSpeaking]
  );

  // Set voice
  const setVoice = useCallback(
    (voiceURI: string) => {
      updateSettings({ voiceURI });
    },
    [updateSettings]
  );

  return {
    speak,
    stop,
    pause: voiceOutput.pause,
    resume: voiceOutput.resume,
    isSpeaking: voiceOutput.isSpeaking,
    isPaused: voiceOutput.isPaused,
    speakingMessageId,
    speakMessage,
    stopMessage,
    isMessageSpeaking,
    isSupported: voiceOutput.isSupported,
    settings,
    updateSettings,
    toggleEnabled,
    toggleAutoPlay,
    voices: voiceOutput.voices,
    currentVoice: voiceOutput.currentVoice,
    setVoice,
    progress: voiceOutput.progress,
    error: voiceOutput.error,
  };
}

/**
 * Strip markdown and code blocks from text for cleaner TTS
 */
export function stripMarkdownForTTS(text: string): string {
  return text
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    // Remove inline code
    .replace(/`[^`]+`/g, "")
    // Remove headers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "Image: $1")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, "")
    // Remove blockquotes markers
    .replace(/^>\s*/gm, "")
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Clean up extra whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
