import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  ChevronUp,
  ChevronDown,
  Trash2,
  Copy,
  Pause,
  Play,
  Download,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface TerminalLine {
  timestamp: number;
  stream: "stdout" | "stderr" | "stdin";
  data: string;
  sequence: number;
}

interface TerminalOutputProps {
  lines?: TerminalLine[];
  onLine?: (line: TerminalLine) => void;
  className?: string;
  maxLines?: number;
}

export function TerminalOutput({
  lines = [],
  onLine,
  className,
  maxLines = 10000,
}: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const pausedLinesRef = useRef<TerminalLine[]>([]);
  const lastSequenceRef = useRef<number>(0);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: false,
      cursorStyle: "underline",
      disableStdin: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      scrollback: maxLines,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#c9d1d9",
        cursorAccent: "#0d1117",
        selectionBackground: "#264f78",
        black: "#484f58",
        red: "#ff7b72",
        green: "#7ee787",
        yellow: "#e3b341",
        blue: "#79c0ff",
        magenta: "#d2a8ff",
        cyan: "#a5d6ff",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#a5d6ff",
        brightWhite: "#f0f6fc",
      },
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", handleResize);

    // Pause auto-scroll when user scrolls up
    terminal.onScroll(() => {
      const buffer = terminal.buffer.active;
      const isAtBottom =
        buffer.baseY + buffer.cursorY >= buffer.viewportY + terminal.rows - 1;
      if (!isAtBottom && !isPaused) {
        // User scrolled up, but don't auto-pause - let them control it
      }
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      terminal.dispose();
    };
  }, [maxLines]);

  // Write initial lines
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || lines.length === 0) return;

    // Clear and write all initial lines
    terminal.clear();
    lines.forEach((line) => {
      writeLine(terminal, line);
      lastSequenceRef.current = Math.max(lastSequenceRef.current, line.sequence);
    });
  }, []);

  // Handle new lines via callback - parent component is responsible for calling onLine
  // This effect ensures we're ready to handle lines when onLine is provided
  useEffect(() => {
    if (!onLine) return;
    // Parent component handles actual line subscription
  }, [onLine, isPaused]);

  // Write new lines from props
  const prevLinesLenRef = useRef(0);
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    // Detect full replacement (lines array shrunk or reset)
    if (lines.length < prevLinesLenRef.current || (lines.length > 0 && lines[0].sequence <= 1 && lastSequenceRef.current > 1)) {
      terminal.clear();
      lastSequenceRef.current = -1;
      pausedLinesRef.current = [];
    }
    prevLinesLenRef.current = lines.length;

    const newLines = lines.filter((line) => line.sequence > lastSequenceRef.current);
    if (newLines.length === 0) return;

    if (isPaused) {
      pausedLinesRef.current.push(...newLines);
    } else {
      newLines.forEach((line) => {
        writeLine(terminal, line);
        lastSequenceRef.current = line.sequence;
      });
    }
  }, [lines, isPaused]);

  // Resume paused lines
  useEffect(() => {
    if (!isPaused && pausedLinesRef.current.length > 0) {
      const terminal = terminalRef.current;
      if (terminal) {
        pausedLinesRef.current.forEach((line) => {
          writeLine(terminal, line);
          lastSequenceRef.current = Math.max(lastSequenceRef.current, line.sequence);
        });
        pausedLinesRef.current = [];
      }
    }
  }, [isPaused]);

  // Fit on container resize
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return;

    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  const writeLine = (terminal: Terminal, line: TerminalLine) => {
    const timestamp = new Date(line.timestamp).toLocaleTimeString();
    const prefix =
      line.stream === "stderr"
        ? "\x1b[31m[ERR]\x1b[0m"
        : line.stream === "stdin"
          ? "\x1b[33m[CMD]\x1b[0m"
          : "\x1b[90m[OUT]\x1b[0m";

    // Handle multi-line output
    const lines = line.data.split("\n");
    lines.forEach((text, index) => {
      if (index === 0) {
        terminal.writeln(`\x1b[90m${timestamp}\x1b[0m ${prefix} ${text}`);
      } else if (text.trim()) {
        terminal.writeln(`\x1b[90m${" ".repeat(timestamp.length)}\x1b[0m ${prefix} ${text}`);
      }
    });
  };

  const handleSearch = useCallback(
    (direction: "next" | "previous") => {
      if (!searchAddonRef.current || !searchQuery) return;

      if (direction === "next") {
        searchAddonRef.current.findNext(searchQuery);
      } else {
        searchAddonRef.current.findPrevious(searchQuery);
      }
    },
    [searchQuery]
  );

  const handleClear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const handleCopy = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const selection = terminal.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
      toast.success("Copied to clipboard");
    } else {
      // Copy all content
      const buffer = terminal.buffer.active;
      let content = "";
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          content += line.translateToString() + "\n";
        }
      }
      navigator.clipboard.writeText(content.trim());
      toast.success("Copied all output to clipboard");
    }
  }, []);

  const handleDownload = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const buffer = terminal.buffer.active;
    let content = "";
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        content += line.translateToString() + "\n";
      }
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terminal-output-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded terminal output");
  }, []);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          {isSearchOpen ? (
            <div className="flex items-center gap-1">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="h-7 w-48 text-sm bg-[#0d1117] border-[#30363d]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch(e.shiftKey ? "previous" : "next");
                  } else if (e.key === "Escape") {
                    setIsSearchOpen(false);
                    setSearchQuery("");
                  }
                }}
                autoFocus
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-[#8b949e] hover:text-[#c9d1d9]"
                      onClick={() => handleSearch("previous")}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous match</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-[#8b949e] hover:text-[#c9d1d9]"
                      onClick={() => handleSearch("next")}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next match</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#8b949e] hover:text-[#c9d1d9]"
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-[#8b949e] hover:text-[#c9d1d9]"
                    onClick={() => setIsSearchOpen(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search (Ctrl+F)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7",
                    isPaused
                      ? "text-yellow-500 hover:text-yellow-400"
                      : "text-[#8b949e] hover:text-[#c9d1d9]"
                  )}
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isPaused ? "Resume auto-scroll" : "Pause auto-scroll"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {isPaused && pausedLinesRef.current.length > 0 && (
            <span className="text-xs text-yellow-500 px-2">
              {pausedLinesRef.current.length} new lines
            </span>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[#8b949e] hover:text-[#c9d1d9]"
                  onClick={handleCopy}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy output</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[#8b949e] hover:text-[#c9d1d9]"
                  onClick={handleDownload}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download output</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[#8b949e] hover:text-[#c9d1d9]"
                  onClick={handleClear}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear output</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 bg-[#0d1117]"
        style={{ padding: "8px" }}
      />
    </div>
  );
}
