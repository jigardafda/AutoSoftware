/**
 * Voice Input Component
 *
 * Voice recording using Web Speech API with:
 * - Push-to-talk or continuous mode
 * - Real-time transcript display
 * - Cancel/confirm actions
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "@/types/speech-recognition.d";

interface Props {
  onResult: (transcript: string) => void;
  onCancel: () => void;
  pushToTalk?: boolean;
  language?: string;
}

export function VoiceInput({
  onResult,
  onCancel,
  pushToTalk = true,
  language = "en-US",
}: Props) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check browser support
  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSupported) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = !pushToTalk;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      setTranscript(finalTranscript || interimTranscript);

      // Auto-submit on final result if continuous mode
      if (finalTranscript && !pushToTalk) {
        // Reset timeout for silence detection
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          handleConfirm();
        }, 2000);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied");
      } else if (event.error === "no-speech") {
        setError("No speech detected");
      } else {
        setError(`Error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isSupported, pushToTalk, language]);

  // Start listening
  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;

    setError(null);
    setTranscript("");
    setIsListening(true);

    try {
      recognitionRef.current.start();
    } catch {
      // Already started
    }
  }, []);

  // Stop listening
  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.stop();
    } catch {
      // Already stopped
    }
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    stopListening();
    if (transcript.trim()) {
      onResult(transcript.trim());
    } else {
      onCancel();
    }
  }, [stopListening, transcript, onResult, onCancel]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    stopListening();
    onCancel();
  }, [stopListening, onCancel]);

  // Auto-start on mount
  useEffect(() => {
    startListening();
  }, [startListening]);

  if (!isSupported) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        <p>Speech recognition is not supported in your browser.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Visual feedback */}
      <div className="flex flex-col items-center py-4">
        <div
          className={cn(
            "relative flex items-center justify-center w-20 h-20 rounded-full transition-all",
            isListening
              ? "bg-primary/20 animate-pulse"
              : error
                ? "bg-destructive/20"
                : "bg-muted"
          )}
        >
          {isListening ? (
            <Mic className="h-8 w-8 text-primary" />
          ) : error ? (
            <MicOff className="h-8 w-8 text-destructive" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          )}

          {/* Pulse rings when listening */}
          {isListening && (
            <>
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-primary/10 animate-ping animation-delay-150" />
            </>
          )}
        </div>

        <p className="mt-4 text-sm font-medium">
          {isListening
            ? "Listening..."
            : error
              ? error
              : "Initializing..."}
        </p>
      </div>

      {/* Transcript */}
      {transcript && (
        <div className="p-3 rounded-lg bg-muted/50 border">
          <p className="text-sm text-center italic">"{transcript}"</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={handleCancel}
          className="gap-2"
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>

        {pushToTalk && (
          <Button
            variant="default"
            size="lg"
            onClick={handleConfirm}
            disabled={!transcript.trim()}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Send
          </Button>
        )}
      </div>

      {/* Hint */}
      <p className="text-xs text-center text-muted-foreground">
        {pushToTalk
          ? "Click 'Send' when done speaking"
          : "Stop speaking for 2 seconds to auto-send"}
      </p>
    </div>
  );
}

