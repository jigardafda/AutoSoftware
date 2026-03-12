import { useState, useEffect, useCallback, useRef } from "react";

export interface UseVoiceOutputOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  onPause?: () => void;
  onResume?: () => void;
}

export interface UseVoiceOutputReturn {
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
  currentVoice: SpeechSynthesisVoice | null;
  setVoice: (voiceURI: string) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setPitch: (pitch: number) => void;
  progress: number;
  error: string | null;
}

/**
 * Custom hook for text-to-speech using Web Speech API
 */
export function useVoiceOutput(options: UseVoiceOutputOptions = {}): UseVoiceOutputReturn {
  const {
    voice: initialVoice,
    rate: initialRate = 1,
    pitch: initialPitch = 1,
    volume: initialVolume = 1,
    onStart,
    onEnd,
    onError,
    onPause,
    onResume,
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [currentVoice, setCurrentVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRateState] = useState(initialRate);
  const [pitch, setPitchState] = useState(initialPitch);
  const [volume, setVolumeState] = useState(initialVolume);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const textRef = useRef<string>("");
  const progressIntervalRef = useRef<number | null>(null);

  // Check if speech synthesis is supported
  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Load available voices
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      // Set initial voice
      if (availableVoices.length > 0) {
        if (initialVoice) {
          const voice = availableVoices.find((v) => v.voiceURI === initialVoice);
          if (voice) {
            setCurrentVoice(voice);
          }
        }

        // Default to first English voice if no voice is set
        if (!currentVoice) {
          const englishVoice = availableVoices.find(
            (v) => v.lang.startsWith("en") && v.default
          );
          setCurrentVoice(englishVoice || availableVoices[0]);
        }
      }
    };

    loadVoices();

    // Chrome loads voices asynchronously
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported, initialVoice, currentVoice]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isSupported]);

  const startProgressTracking = useCallback((text: string) => {
    const totalLength = text.length;
    let charIndex = 0;

    // Estimate progress based on speaking rate
    // Average speaking rate is about 150 words per minute
    // Assuming average word length of 5 characters
    const charsPerSecond = (150 * 5 * rate) / 60;
    const updateInterval = 100; // Update every 100ms
    const charsPerInterval = charsPerSecond * (updateInterval / 1000);

    progressIntervalRef.current = window.setInterval(() => {
      charIndex += charsPerInterval;
      const newProgress = Math.min(100, (charIndex / totalLength) * 100);
      setProgress(newProgress);

      if (newProgress >= 100 && progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }, updateInterval);
  }, [rate]);

  const stopProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) {
        const errorMsg = "Text-to-speech is not supported in this browser.";
        setError(errorMsg);
        onError?.(errorMsg);
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      stopProgressTracking();

      setError(null);
      textRef.current = text;
      setProgress(0);

      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      // Apply settings
      if (currentVoice) {
        utterance.voice = currentVoice;
      }
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
        startProgressTracking(text);
        onStart?.();
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        setProgress(100);
        stopProgressTracking();
        onEnd?.();
      };

      utterance.onerror = (event) => {
        // Ignore 'interrupted' errors as they occur when we cancel speech intentionally
        if (event.error === "interrupted" || event.error === "canceled") {
          setIsSpeaking(false);
          setIsPaused(false);
          stopProgressTracking();
          return;
        }

        const errorMsg = `Speech synthesis error: ${event.error}`;
        setError(errorMsg);
        setIsSpeaking(false);
        setIsPaused(false);
        stopProgressTracking();
        onError?.(errorMsg);
      };

      utterance.onpause = () => {
        setIsPaused(true);
        stopProgressTracking();
        onPause?.();
      };

      utterance.onresume = () => {
        setIsPaused(false);
        startProgressTracking(textRef.current);
        onResume?.();
      };

      // Work around Chrome bug where speech doesn't start
      // if synthesis was previously cancelled
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 10);
    },
    [
      isSupported,
      currentVoice,
      rate,
      pitch,
      volume,
      onStart,
      onEnd,
      onError,
      onPause,
      onResume,
      startProgressTracking,
      stopProgressTracking,
    ]
  );

  const stop = useCallback(() => {
    if (!isSupported) return;

    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setProgress(0);
    stopProgressTracking();
  }, [isSupported, stopProgressTracking]);

  const pause = useCallback(() => {
    if (!isSupported || !isSpeaking) return;

    window.speechSynthesis.pause();
    setIsPaused(true);
    stopProgressTracking();
    onPause?.();
  }, [isSupported, isSpeaking, onPause, stopProgressTracking]);

  const resume = useCallback(() => {
    if (!isSupported || !isPaused) return;

    window.speechSynthesis.resume();
    setIsPaused(false);
    startProgressTracking(textRef.current);
    onResume?.();
  }, [isSupported, isPaused, onResume, startProgressTracking]);

  const setVoice = useCallback(
    (voiceURI: string) => {
      const voice = voices.find((v) => v.voiceURI === voiceURI);
      if (voice) {
        setCurrentVoice(voice);
      }
    },
    [voices]
  );

  const setRate = useCallback((newRate: number) => {
    // Rate should be between 0.1 and 10
    const clampedRate = Math.max(0.1, Math.min(10, newRate));
    setRateState(clampedRate);
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    // Volume should be between 0 and 1
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);
  }, []);

  const setPitch = useCallback((newPitch: number) => {
    // Pitch should be between 0 and 2
    const clampedPitch = Math.max(0, Math.min(2, newPitch));
    setPitchState(clampedPitch);
  }, []);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    isSupported,
    voices,
    currentVoice,
    setVoice,
    setRate,
    setVolume,
    setPitch,
    progress,
    error,
  };
}

/**
 * Utility to get voices by language
 */
export function getVoicesByLanguage(
  voices: SpeechSynthesisVoice[],
  languageCode: string
): SpeechSynthesisVoice[] {
  return voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith(languageCode.toLowerCase())
  );
}

/**
 * Utility to group voices by language
 */
export function groupVoicesByLanguage(
  voices: SpeechSynthesisVoice[]
): Record<string, SpeechSynthesisVoice[]> {
  return voices.reduce(
    (acc, voice) => {
      const langCode = voice.lang.split("-")[0];
      if (!acc[langCode]) {
        acc[langCode] = [];
      }
      acc[langCode].push(voice);
      return acc;
    },
    {} as Record<string, SpeechSynthesisVoice[]>
  );
}
