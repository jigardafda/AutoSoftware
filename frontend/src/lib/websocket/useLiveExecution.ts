import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "./WebSocketProvider";
import { api } from "@/lib/api";

export interface TerminalLine {
  timestamp: number;
  stream: "stdout" | "stderr";
  data: string;
  sequence: number;
}

export interface FileChange {
  timestamp: number;
  operation: "create" | "modify" | "delete";
  filePath: string;
  oldContent?: string;
  newContent?: string;
  diff?: string;
  language?: string;
}

interface LiveExecutionState {
  isConnected: boolean;
  isHistorical: boolean;
  isLoading: boolean;
  terminalLines: TerminalLine[];
  fileChanges: FileChange[];
  lastSequence: number;
}

interface UseLiveExecutionOptions {
  enabled?: boolean;
  maxTerminalLines?: number;
  maxFileChanges?: number;
}

export function useLiveExecution(
  taskId: string | null,
  options: UseLiveExecutionOptions = {}
) {
  const {
    enabled = true,
    maxTerminalLines = 5000,
    maxFileChanges = 100,
  } = options;

  const { subscribe, unsubscribe, addMessageHandler, isConnected: wsConnected } = useWebSocket();
  const [state, setState] = useState<LiveExecutionState>({
    isConnected: false,
    isHistorical: false,
    isLoading: true,
    terminalLines: [],
    fileChanges: [],
    lastSequence: 0,
  });
  // Load persisted execution logs when taskId changes
  useEffect(() => {
    if (!taskId) {
      setState({
        isConnected: false,
        isHistorical: false,
        isLoading: false,
        terminalLines: [],
        fileChanges: [],
        lastSequence: 0,
      });
      return;
    }

    // Reset state and load persisted data for new task
    setState({
      isConnected: false,
      isHistorical: false,
      isLoading: true,
      terminalLines: [],
      fileChanges: [],
      lastSequence: 0,
    });

    let cancelled = false;

    api.tasks
      .executionLogs(taskId)
      .then((data) => {
        if (cancelled) return;
        if (data.terminalLines?.length > 0 || data.fileChanges?.length > 0) {
          setState((prev) => ({
            ...prev,
            terminalLines: data.terminalLines || [],
            fileChanges: data.fileChanges || [],
            lastSequence: data.lastSequence || 0,
            isHistorical: true,
            isLoading: false,
          }));
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Subscribe to live execution events
  useEffect(() => {
    if (!taskId || !enabled || !wsConnected) {
      setState((prev) => ({ ...prev, isConnected: false }));
      return;
    }

    const resource = `task:${taskId}:live`;

    // Subscribe to the resource
    subscribe(resource);

    // Handle buffered output (for late joiners)
    const cleanupBuffered = addMessageHandler("live:buffered", (payload: any) => {
      if (payload.taskId !== taskId) return;

      setState((prev) => {
        // Merge with existing, avoiding duplicates
        const existingSeqs = new Set(prev.terminalLines.map((l) => l.sequence));
        const newTerminalLines = [
          ...prev.terminalLines,
          ...(payload.terminalLines || []).filter(
            (l: TerminalLine) => !existingSeqs.has(l.sequence)
          ),
        ].slice(-maxTerminalLines);

        const existingKeys = new Set(prev.fileChanges.map((c) => `${c.timestamp}:${c.filePath}`));
        const newFileChanges = [
          ...prev.fileChanges,
          ...(payload.fileChanges || []).filter(
            (c: FileChange) => !existingKeys.has(`${c.timestamp}:${c.filePath}`)
          ),
        ].slice(-maxFileChanges);

        return {
          ...prev,
          isConnected: true,
          terminalLines: newTerminalLines,
          fileChanges: newFileChanges,
          lastSequence: Math.max(payload.lastSequence || 0, prev.lastSequence),
        };
      });
    });

    // Handle real-time terminal output
    const cleanupTerminal = addMessageHandler("terminal:output", (payload: any) => {
      if (payload.taskId !== taskId) return;

      setState((prev) => {
        // Skip if we already have this sequence
        if (prev.terminalLines.some((l) => l.sequence === payload.sequence)) {
          return prev;
        }

        const newLine: TerminalLine = {
          timestamp: payload.timestamp,
          stream: payload.stream,
          data: payload.data,
          sequence: payload.sequence,
        };

        const newTerminalLines = [...prev.terminalLines, newLine].slice(-maxTerminalLines);

        return {
          ...prev,
          terminalLines: newTerminalLines,
          lastSequence: Math.max(payload.sequence, prev.lastSequence),
        };
      });
    });

    // Handle real-time file changes
    const cleanupFile = addMessageHandler("file:change", (payload: any) => {
      if (payload.taskId !== taskId) return;

      setState((prev) => {
        const newChange: FileChange = {
          timestamp: payload.timestamp,
          operation: payload.operation,
          filePath: payload.filePath,
          oldContent: payload.oldContent,
          newContent: payload.newContent,
          diff: payload.diff,
          language: payload.language,
        };

        const newFileChanges = [...prev.fileChanges, newChange].slice(-maxFileChanges);

        return {
          ...prev,
          fileChanges: newFileChanges,
        };
      });
    });

    // Mark as connected
    setState((prev) => ({ ...prev, isConnected: true }));

    return () => {
      cleanupBuffered();
      cleanupTerminal();
      cleanupFile();
      unsubscribe(resource);
      setState((prev) => ({ ...prev, isConnected: false }));
    };
  }, [
    taskId,
    enabled,
    wsConnected,
    subscribe,
    unsubscribe,
    addMessageHandler,
    maxTerminalLines,
    maxFileChanges,
  ]);

  // Helper to clear output
  const clearOutput = useCallback(() => {
    setState((prev) => ({
      ...prev,
      terminalLines: [],
      fileChanges: [],
      lastSequence: 0,
      isHistorical: false,
    }));
  }, []);

  return {
    isConnected: state.isConnected && wsConnected,
    isHistorical: state.isHistorical,
    isLoading: state.isLoading,
    terminalLines: state.terminalLines,
    fileChanges: state.fileChanges,
    lastSequence: state.lastSequence,
    clearOutput,
  };
}
