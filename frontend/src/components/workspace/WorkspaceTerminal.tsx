import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

interface WorkspaceTerminalProps {
  workspaceId: string;
  className?: string;
}

export function WorkspaceTerminal({ workspaceId, className }: WorkspaceTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  // Connect WebSocket and start PTY
  const connectTerminal = useCallback(() => {
    if (!containerRef.current) return;

    const terminal = terminalRef.current;
    if (!terminal) return;

    const fitAddon = fitAddonRef.current;
    const cols = terminal.cols;
    const rows = terminal.rows;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(`${WS_URL}/ws/workspace/${workspaceId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Request PTY session
      ws.send(JSON.stringify({
        type: "terminal:start",
        cols,
        rows,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "terminal:ready") {
          setConnected(true);
          terminal.focus();
        }

        if (msg.type === "terminal:output") {
          terminal.write(msg.data);
        }

        if (msg.type === "terminal:exit") {
          terminal.write(`\r\n\x1b[90m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`);
          setConnected(false);
        }

        if (msg.type === "terminal:error") {
          terminal.write(`\r\n\x1b[31m[Error: ${msg.data}]\x1b[0m\r\n`);
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setConnected(false);
    };
  }, [workspaceId]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      disableStdin: false,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      scrollback: 10000,
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

    // Forward user input to PTY via WebSocket
    terminal.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "terminal:input", data }));
      }
    });

    // Handle terminal resize → notify backend PTY
    terminal.onResize(({ cols, rows }) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "terminal:resize", cols, rows }));
      }
    });

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Connect to PTY when workspace changes
  useEffect(() => {
    // Small delay to ensure terminal is initialized and sized
    const timer = setTimeout(connectTerminal, 100);
    return () => {
      clearTimeout(timer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectTerminal]);

  // Fit on container resize
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return;

    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-xs text-[#8b949e] font-mono ml-2">Terminal</span>
        <span
          className={cn(
            "ml-auto h-2 w-2 rounded-full",
            connected ? "bg-green-500" : "bg-muted-foreground/40"
          )}
          title={connected ? "Connected" : "Disconnected"}
        />
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 bg-[#0d1117]"
        style={{ padding: "8px" }}
      />
    </div>
  );
}
