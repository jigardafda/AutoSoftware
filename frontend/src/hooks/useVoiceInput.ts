import { useState, useEffect, useCallback, useRef } from "react";
import "../types/speech-recognition.d";

export interface UseVoiceInputOptions {
  onTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export interface UseVoiceInputReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  resetTranscript: () => void;
  error: string | null;
  audioLevel: number;
}

/**
 * Custom hook for voice input using Web Speech API
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const {
    onTranscript,
    onFinalTranscript,
    onError,
    language = "en-US",
    continuous = false,
    interimResults = true,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check if speech recognition is supported
  const isSupported =
    typeof window !== "undefined" &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);

  // Audio level monitoring
  const startAudioLevelMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(100, (average / 128) * 100);
        setAudioLevel(normalizedLevel);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.error("Failed to start audio level monitoring:", err);
    }
  }, []);

  const stopAudioLevelMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    recognitionRef.current = new SpeechRecognitionAPI();

    const recognition = recognitionRef.current;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcriptText = result[0].transcript;

        if (result.isFinal) {
          final += transcriptText;
        } else {
          interim += transcriptText;
        }
      }

      if (interim) {
        setInterimTranscript(interim);
        onTranscript?.(interim);
      }

      if (final) {
        setTranscript((prev) => {
          const newTranscript = prev + (prev ? " " : "") + final;
          return newTranscript;
        });
        setInterimTranscript("");
        onFinalTranscript?.(final);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      let errorMessage = "Speech recognition error";

      switch (event.error) {
        case "not-allowed":
          errorMessage = "Microphone access denied. Please allow microphone permissions.";
          break;
        case "no-speech":
          errorMessage = "No speech detected. Please try again.";
          break;
        case "audio-capture":
          errorMessage = "No microphone found. Please check your audio input device.";
          break;
        case "network":
          errorMessage = "Network error occurred. Please check your connection.";
          break;
        case "aborted":
          errorMessage = "Speech recognition was aborted.";
          break;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }

      setError(errorMessage);
      onError?.(errorMessage);
      setIsListening(false);
      stopAudioLevelMonitoring();
    };

    recognition.onend = () => {
      // If continuous mode and still listening, restart
      if (continuous && isListening) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
          stopAudioLevelMonitoring();
        }
      } else {
        setIsListening(false);
        stopAudioLevelMonitoring();
      }
    };

    return () => {
      recognition.abort();
      stopAudioLevelMonitoring();
    };
  }, [
    isSupported,
    language,
    continuous,
    interimResults,
    onTranscript,
    onFinalTranscript,
    onError,
    isListening,
    stopAudioLevelMonitoring,
  ]);

  // Update recognition settings when options change
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.continuous = continuous;
      recognitionRef.current.interimResults = interimResults;
      recognitionRef.current.lang = language;
    }
  }, [continuous, interimResults, language]);

  const startListening = useCallback(async () => {
    if (!isSupported || !recognitionRef.current) {
      setError("Speech recognition is not supported in this browser.");
      onError?.("Speech recognition is not supported in this browser.");
      return;
    }

    setError(null);
    setInterimTranscript("");

    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      recognitionRef.current.start();
      setIsListening(true);
      await startAudioLevelMonitoring();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start speech recognition";
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [isSupported, onError, startAudioLevelMonitoring]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      stopAudioLevelMonitoring();
    }
  }, [isListening, stopAudioLevelMonitoring]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
    error,
    audioLevel,
  };
}
