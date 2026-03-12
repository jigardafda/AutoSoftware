import { useState, useEffect, useCallback } from "react";
import { Mic, MicOff, X, Send, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { Button } from "@/components/ui/button";

interface VoiceInputProps {
  onTranscriptSubmit: (text: string) => void;
  onClose: () => void;
  placeholder?: string;
  className?: string;
}

export function VoiceInput({
  onTranscriptSubmit,
  onClose,
  placeholder = "Tap the microphone and speak...",
  className,
}: VoiceInputProps) {
  const [showSendButton, setShowSendButton] = useState(false);
  const { triggerLight, triggerSuccess, triggerError } = useHapticFeedback();

  const {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
    error,
    audioLevel,
  } = useVoiceInput({
    continuous: true,
    interimResults: true,
    onFinalTranscript: () => {
      setShowSendButton(true);
    },
    onError: () => {
      triggerError();
    },
  });

  // Show send button when there's a final transcript
  useEffect(() => {
    if (transcript) {
      setShowSendButton(true);
    }
  }, [transcript]);

  const handleMicClick = useCallback(() => {
    triggerLight();
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening, triggerLight]);

  const handleSend = useCallback(() => {
    if (transcript.trim()) {
      triggerSuccess();
      onTranscriptSubmit(transcript.trim());
      resetTranscript();
      onClose();
    }
  }, [transcript, onTranscriptSubmit, resetTranscript, onClose, triggerSuccess]);

  const handleClear = useCallback(() => {
    triggerLight();
    resetTranscript();
    setShowSendButton(false);
  }, [resetTranscript, triggerLight]);

  const handleClose = useCallback(() => {
    stopListening();
    onClose();
  }, [stopListening, onClose]);

  // Calculate pulse animation scale based on audio level
  const pulseScale = 1 + (audioLevel / 100) * 0.5;

  if (!isSupported) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
        <div className="mb-4 rounded-full bg-destructive/10 p-4">
          <MicOff className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Voice Input Not Supported</h3>
        <p className="text-sm text-muted-foreground">
          Your browser does not support the Web Speech API. Please try using Chrome, Edge, or Safari.
        </p>
        <Button variant="outline" onClick={onClose} className="mt-4">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-lg font-semibold">Voice Input</h3>
        <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        {/* Microphone button with pulse effect */}
        <div className="relative mb-8">
          {/* Pulse rings */}
          {isListening && (
            <>
              <div
                className="absolute inset-0 rounded-full bg-primary/20 transition-transform duration-100"
                style={{ transform: `scale(${pulseScale * 1.5})` }}
              />
              <div
                className="absolute inset-0 rounded-full bg-primary/10 transition-transform duration-100"
                style={{ transform: `scale(${pulseScale * 2})` }}
              />
            </>
          )}

          {/* Main button */}
          <button
            onClick={handleMicClick}
            className={cn(
              "relative z-10 flex h-24 w-24 items-center justify-center rounded-full transition-all duration-200",
              isListening
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {isListening ? (
              <Mic className="h-10 w-10 animate-pulse" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </button>
        </div>

        {/* Status text */}
        <div className="mb-4 text-center">
          {isListening ? (
            <div className="flex items-center gap-2 text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Listening...</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {transcript ? "Tap to add more" : placeholder}
            </span>
          )}
        </div>

        {/* Transcript display */}
        <div className="w-full max-w-md rounded-lg bg-muted/50 p-4 min-h-[100px]">
          {error ? (
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          ) : (
            <div className="space-y-2">
              {transcript && (
                <p className="text-foreground">{transcript}</p>
              )}
              {interimTranscript && (
                <p className="text-muted-foreground italic">{interimTranscript}</p>
              )}
              {!transcript && !interimTranscript && !isListening && (
                <p className="text-muted-foreground text-center text-sm">
                  Your transcription will appear here
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleClear}
          disabled={!transcript && !interimTranscript}
        >
          Clear
        </Button>
        {showSendButton && transcript && (
          <Button className="flex-1" onClick={handleSend}>
            <Send className="mr-2 h-4 w-4" />
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
