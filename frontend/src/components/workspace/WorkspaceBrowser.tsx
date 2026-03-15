import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Crosshair,
  Monitor,
  Tablet,
  Smartphone,
  Play,
  Square,
  Loader2,
  Settings2,
  ExternalLink,
  Copy,
  X,
  Terminal,
} from "lucide-react";
import { useDevServer } from "@/hooks/useDevServer";
import { DevServerScriptDialog } from "./DevServerScriptDialog";

const API = import.meta.env.VITE_API_URL || "";

interface ElementRef {
  tagName: string;
  id: string | null;
  className: string;
  textContent: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  // React component source info
  component?: string | null;
  file?: string | null;
  line?: number | null;
  column?: number | null;
  framework?: string | null;
  stack?: Array<{ name: string; file: string | null }>;
  htmlPreview?: string;
}

interface WorkspaceBrowserProps {
  workspaceId: string;
  repositoryId?: string | null;
  devServerScript?: string | null;
  onElementSelected?: (element: ElementRef) => void;
  onDevServerChanged?: () => void;
}

const DEVICE_PRESETS = [
  { name: "Desktop", icon: Monitor, width: "100%", height: "100%" },
  { name: "Tablet", icon: Tablet, width: "768px", height: "1024px" },
  { name: "Mobile", icon: Smartphone, width: "375px", height: "812px" },
] as const;

export function WorkspaceBrowser({
  workspaceId,
  repositoryId,
  devServerScript,
  onElementSelected,
  onDevServerChanged,
}: WorkspaceBrowserProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [inspectActive, setInspectActive] = useState(false);
  const [devicePreset, setDevicePreset] = useState(0);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [devToolsActive, setDevToolsActive] = useState(false);
  const devToolsActiveRef = useRef(false);
  const [erudaReady, setErudaReady] = useState(false);

  const {
    logs,
    detectedUrl,
    isStarting,
    isStopping,
    isServerRunning,
    failedProcess,
    start,
    stop,
    refetch,
  } = useDevServer(workspaceId);

  const proxyBaseUrl = `${API}/api/preview/${workspaceId}`;
  const onElementSelectedRef = useRef(onElementSelected);
  onElementSelectedRef.current = onElementSelected;

  // Inject the bridge script into the iframe's document directly (same-origin access).
  // This is more reliable than depending on proxy injection + postMessage.
  const injectBridge = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow as any;
      if (!doc || !win) return;

      // Already injected in this document
      if (win.__as_bridge) {
        setBridgeReady(true);
        return;
      }

      win.__as_bridge = true;

      // --- Element Inspector Bridge ---
      let inspectMode = false;
      let overlay: HTMLDivElement | null = null;
      let infoBox: HTMLDivElement | null = null;
      let currentEl: Element | null = null;

      function createOverlay() {
        overlay = doc!.createElement("div");
        overlay.id = "__as_inspect_overlay";
        overlay.style.cssText =
          "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #6366f1;background:rgba(99,102,241,0.1);transition:all 0.1s ease;display:none;";
        doc!.body.appendChild(overlay);

        infoBox = doc!.createElement("div");
        infoBox.id = "__as_inspect_info";
        infoBox.style.cssText =
          "position:fixed;z-index:2147483647;background:#1e1b4b;color:#e0e7ff;padding:6px 10px;border-radius:6px;font:12px/1.4 monospace;pointer-events:none;display:none;max-width:500px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 12px rgba(0,0,0,0.3);";
        doc!.body.appendChild(infoBox);
      }

      function getSelector(el: Element): string {
        if (el.id) return "#" + el.id;
        const path: string[] = [];
        let cur: Element | null = el;
        while (cur && cur.nodeType === 1) {
          let sel = cur.tagName.toLowerCase();
          if (cur.id) {
            path.unshift("#" + cur.id);
            break;
          }
          if (cur.className && typeof cur.className === "string") {
            const cls = cur.className
              .trim()
              .split(/\s+/)
              .filter((c) => !c.startsWith("__as_"))
              .slice(0, 2);
            if (cls.length) sel += "." + cls.join(".");
          }
          const parent = cur.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (c) => c.tagName === cur!.tagName,
            );
            if (siblings.length > 1)
              sel += ":nth-of-type(" + (siblings.indexOf(cur) + 1) + ")";
          }
          path.unshift(sel);
          cur = parent;
          if (path.length > 4) break;
        }
        return path.join(" > ");
      }

      // React component detection — uses bippy (injected by proxy in <head>) when available,
      // falls back to manual fiber traversal with _debugSource
      function getReactComponentInfo(el: Element): any {
        const ReactBippy = (win as any).ReactBippy;

        // --- bippy path (preferred): uses React DevTools hook ---
        if (
          ReactBippy &&
          typeof ReactBippy.isInstrumentationActive === "function" &&
          ReactBippy.isInstrumentationActive()
        ) {
          const fiber = ReactBippy.getFiberFromHostInstance(el);
          if (fiber) {
            // Get nearest component name
            let component: string | null = null;
            let cur = fiber.return;
            while (cur) {
              if (ReactBippy.isCompositeFiber(cur)) {
                const n = ReactBippy.getDisplayName(cur.type);
                if (n && n.length > 1 && n.charAt(0) !== "_") {
                  component = n;
                  break;
                }
              }
              cur = cur.return;
            }
            // Collect component names from fiber tree
            const names: string[] = [];
            ReactBippy.traverseFiber(
              fiber,
              (f: any) => {
                if (names.length >= 5) return true;
                if (ReactBippy.isCompositeFiber(f)) {
                  const name = ReactBippy.getDisplayName(f.type);
                  if (name && name.length > 1 && name.charAt(0) !== "_")
                    names.push(name);
                }
                return false;
              },
              true,
            );
            if (!component && names.length) component = names[0];

            return {
              component,
              file: null,
              line: null,
              column: null,
              stack: names.map((n: string) => ({ name: n, file: null })),
              framework: "react",
              _fiber: fiber, // keep reference for async owner stack resolution on click
            };
          }
        }

        // --- Fallback: manual fiber traversal with _debugSource ---
        const keys = Object.keys(el);
        let fiber: any = null;
        for (const k of keys) {
          if (
            k.startsWith("__reactFiber$") ||
            k.startsWith("__reactInternalInstance$")
          ) {
            fiber = (el as any)[k];
            break;
          }
        }
        if (!fiber) return null;

        const result: any = {
          component: null,
          file: null,
          line: null,
          column: null,
          stack: [],
          framework: "react",
        };
        let current = fiber;
        let depth = 30;
        while (current && depth-- > 0) {
          const type = current.type;
          const name =
            type && typeof type !== "string"
              ? type.displayName || type.name || null
              : null;
          const source =
            current._debugSource || current._debugInfo?.[0]?.source;
          if (
            source?.fileName &&
            !/node_modules|\/chunk-|vendor/.test(source.fileName) &&
            /\.(jsx?|tsx?|vue|svelte)$/.test(source.fileName)
          ) {
            const normFile = source.fileName
              .replace(/^(webpack:\/\/|file:\/\/\/|\.\/|rsc:\/\/)/, "")
              .split("?")[0];
            if (!result.file) {
              result.file = normFile;
              result.line = source.lineNumber || null;
              result.column = source.columnNumber || null;
              result.component = name || result.component;
            }
            if (name)
              result.stack.push({
                name,
                file:
                  normFile + (source.lineNumber ? ":" + source.lineNumber : ""),
              });
          } else if (name) {
            result.stack.push({ name, file: null });
            if (!result.component) result.component = name;
          }
          current = current.return;
        }
        result.stack = result.stack.filter((s: any) => s.file).slice(0, 5);
        return result.file || result.component ? result : null;
      }

      // Resolve owner stack from bippy (async) to get source file info
      async function resolveOwnerStack(ci: any): Promise<any> {
        if (!ci?._fiber) return ci;
        const ReactBippy = (win as any).ReactBippy;
        if (!ReactBippy?.getOwnerStack) return ci;
        try {
          const stack = await ReactBippy.getOwnerStack(ci._fiber);
          delete ci._fiber;
          if (!stack) return ci;
          const resolvedStack: Array<{ name: string; file: string | null }> =
            [];
          for (const frame of stack) {
            if (frame.fileName && ReactBippy.isSourceFile(frame.fileName)) {
              const file = ReactBippy.normalizeFileName(frame.fileName);
              const name =
                frame.functionName && frame.functionName.length > 1
                  ? frame.functionName
                  : "";
              const fileLoc =
                file + (frame.lineNumber ? ":" + frame.lineNumber : "");
              if (!ci.file) {
                ci.file = file;
                ci.line = frame.lineNumber || null;
                ci.column = frame.columnNumber || null;
              }
              resolvedStack.push({ name, file: fileLoc });
              if (resolvedStack.length >= 5) break;
            }
          }
          if (resolvedStack.length) ci.stack = resolvedStack;
        } catch {
          /* ignore */
        }
        return ci;
      }

      doc.addEventListener(
        "mousemove",
        (e: MouseEvent) => {
          if (!inspectMode) return;
          const el = doc!.elementFromPoint(e.clientX, e.clientY);
          if (!el || el.id?.startsWith("__as_")) return;
          currentEl = el;
          const rect = el.getBoundingClientRect();
          if (!overlay) createOverlay();
          overlay!.style.display = "block";
          overlay!.style.left = rect.left + "px";
          overlay!.style.top = rect.top + "px";
          overlay!.style.width = rect.width + "px";
          overlay!.style.height = rect.height + "px";

          const dims = Math.round(rect.width) + "x" + Math.round(rect.height);
          const ci = getReactComponentInfo(el);
          if (ci?.file) {
            const shortFile = ci.file.split("/").pop();
            let label = "<" + (ci.component || "?") + "/>";
            label +=
              " " +
              shortFile +
              (ci.line ? ":" + ci.line : "") +
              " (" +
              dims +
              ")";
            infoBox!.textContent = label;
          } else if (ci?.component) {
            infoBox!.textContent = "<" + ci.component + "/> (" + dims + ")";
          } else {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? "#" + el.id : "";
            const cls =
              el.className && typeof el.className === "string"
                ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
                : "";
            infoBox!.textContent = tag + id + cls + " (" + dims + ")";
          }
          infoBox!.style.display = "block";
          let infoTop = rect.top - 30;
          if (infoTop < 0) infoTop = rect.bottom + 4;
          infoBox!.style.left = Math.max(0, rect.left) + "px";
          infoBox!.style.top = infoTop + "px";
        },
        true,
      );

      doc.addEventListener(
        "click",
        (e: MouseEvent) => {
          if (!inspectMode) return;
          e.preventDefault();
          e.stopPropagation();
          const el = currentEl || doc!.elementFromPoint(e.clientX, e.clientY);
          if (!el || el.id?.startsWith("__as_")) return;
          const rect = el.getBoundingClientRect();
          const ci = getReactComponentInfo(el);

          // Resolve owner stack (async for bippy source maps) then emit
          resolveOwnerStack(ci).then((info: any) => {
            onElementSelectedRef.current?.({
              tagName: el.tagName.toLowerCase(),
              id: el.id || null,
              className: typeof el.className === "string" ? el.className : "",
              textContent: (el.textContent || "").trim().slice(0, 200),
              selector: getSelector(el),
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
              component: info?.component || null,
              file: info?.file || null,
              line: info?.line || null,
              column: info?.column || null,
              framework: info?.framework || null,
              stack: info?.stack || [],
              htmlPreview: el.outerHTML.slice(0, 300),
            });
          });

          // Exit inspect mode after selection
          inspectMode = false;
          setInspectActive(false);
          if (overlay) overlay.style.display = "none";
          if (infoBox) infoBox.style.display = "none";
          doc!.body.style.cursor = "";
          overlay!.style.background = "rgba(99,102,241,0.3)";
          setTimeout(() => {
            if (overlay) overlay.style.background = "rgba(99,102,241,0.1)";
          }, 200);
        },
        true,
      );

      // Expose toggle function on iframe window for parent to call
      win.__as_toggleInspect = () => {
        inspectMode = !inspectMode;
        if (!overlay) createOverlay();
        if (!inspectMode) {
          overlay!.style.display = "none";
          infoBox!.style.display = "none";
          currentEl = null;
          doc!.body.style.cursor = "";
        } else {
          doc!.body.style.cursor = "crosshair";
        }
        setInspectActive(inspectMode);
      };

      win.__as_disableInspect = () => {
        inspectMode = false;
        if (overlay) overlay.style.display = "none";
        if (infoBox) infoBox.style.display = "none";
        doc!.body.style.cursor = "";
        setInspectActive(false);
      };

      // --- Eruda DevTools ---
      const erudaScript = doc.createElement("script");
      erudaScript.src = "https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.js";
      erudaScript.onload = () => {
        if (typeof win.eruda !== "undefined") {
          win.eruda.init({ defaults: { theme: "Dark" } });
          win.eruda.hide();
          // Hide floating entry button
          try {
            const entryBtn = win.eruda._entryBtn;
            if (entryBtn?._$el?.[0]) entryBtn._$el[0].style.display = "none";
          } catch {
            /* ignore */
          }
          setErudaReady(true);
          // Apply current devtools state
          if (devToolsActiveRef.current) win.eruda.show();
        }
      };
      doc.body.appendChild(erudaScript);

      setBridgeReady(true);
    } catch {
      // Cross-origin — can't inject (external URL), bridge stays unavailable
    }
  }, []);

  const sendErudaCommand = useCallback((visible: boolean) => {
    try {
      const win = iframeRef.current?.contentWindow as any;
      if (!win?.eruda) return;
      if (visible) win.eruda.show();
      else win.eruda.hide();
    } catch {
      /* cross-origin */
    }
  }, []);

  // When a URL is detected from logs, auto-set it
  useEffect(() => {
    if (detectedUrl && !iframeUrl) {
      setUrlInput(detectedUrl);
      // Build proxy URL from detected dev server URL
      navigateToUrl(detectedUrl);
    }
  }, [detectedUrl]);

  // Check if a URL points to a local dev server (should be proxied) vs external (load directly)
  const isLocalUrl = useCallback((url: string): boolean => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        host.startsWith("[::") // IPv6 localhost
      );
    } catch {
      // Bare paths like "/about" are treated as local
      return true;
    }
  }, []);

  const resolveIframeUrl = useCallback(
    (rawUrl: string): string => {
      if (!isLocalUrl(rawUrl)) {
        // External URL — load directly (no proxy)
        return rawUrl;
      }

      // Local URL — route through proxy, preserve the target port
      let path = "/";
      let port = "";
      try {
        const parsed = new URL(rawUrl);
        path = parsed.pathname + parsed.search + parsed.hash;
        port = parsed.port;
      } catch {
        path = rawUrl.startsWith("/") ? rawUrl : "/" + rawUrl;
      }

      // Pass the target port as a query param so the proxy knows where to forward
      const separator = path.includes("?") ? "&" : "?";
      const portParam = port ? `${separator}__port=${port}` : "";
      return `${proxyBaseUrl}${path}${portParam}`;
    },
    [proxyBaseUrl, isLocalUrl],
  );

  // Whether the currently loaded page goes through the proxy (and has the bridge script)
  const isProxied = useMemo(
    () => !!iframeUrl && iframeUrl.startsWith(proxyBaseUrl),
    [iframeUrl, proxyBaseUrl],
  );

  const navigateToUrl = useCallback(
    (rawUrl: string) => {
      // Reset bridge state — new page needs to re-establish
      setBridgeReady(false);
      setErudaReady(false);
      setInspectActive(false);

      setIframeUrl(resolveIframeUrl(rawUrl));
      setUrlInput(rawUrl);

      const newHistory = [...history.slice(0, historyIndex + 1), rawUrl];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [resolveIframeUrl, history, historyIndex],
  );

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const url = history[newIndex];
      setUrlInput(url);
      setIframeUrl(resolveIframeUrl(url));
    }
  }, [history, historyIndex, resolveIframeUrl]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const url = history[newIndex];
      setUrlInput(url);
      setIframeUrl(resolveIframeUrl(url));
    }
  }, [history, historyIndex, resolveIframeUrl]);

  const refresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  const toggleInspect = useCallback(() => {
    try {
      const win = iframeRef.current?.contentWindow as any;
      win?.__as_toggleInspect?.();
    } catch {
      /* cross-origin */
    }
  }, []);

  const toggleDevTools = useCallback(() => {
    setDevToolsActive((prev) => {
      const next = !prev;
      devToolsActiveRef.current = next;
      sendErudaCommand(next);
      return next;
    });
  }, [sendErudaCommand]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    // Normalize - if user enters just a path, treat as path on current server
    if (trimmed.startsWith("/")) {
      navigateToUrl(detectedUrl ? new URL(trimmed, detectedUrl).href : trimmed);
    } else if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
    ) {
      navigateToUrl(trimmed);
    } else {
      // Assume http://
      navigateToUrl(`http://${trimmed}`);
    }
  };

  const handleStartServer = async () => {
    if (!devServerScript) {
      setScriptDialogOpen(true);
      return;
    }
    try {
      await start();
      onDevServerChanged?.();
    } catch (err: any) {
      // If no script configured, open the dialog
      if (err?.message?.includes("No dev server script")) {
        setScriptDialogOpen(true);
      }
    }
  };

  const device = DEVICE_PRESETS[devicePreset];

  // Empty state: No script configured
  if (!devServerScript && !isServerRunning && !isStarting) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 p-6">
          <Globe className="h-10 w-10 opacity-40" />
          <div className="text-center">
            <p className="font-medium">No dev server configured</p>
            <p className="text-sm mt-1">
              Set up a dev server script to preview your app here.
            </p>
          </div>
          <button
            onClick={() => setScriptDialogOpen(true)}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Configure Dev Server
          </button>
        </div>
        <DevServerScriptDialog
          open={scriptDialogOpen}
          onClose={() => setScriptDialogOpen(false)}
          repositoryId={repositoryId}
          workspaceId={workspaceId}
          initialScript={devServerScript || ""}
          onSaved={refetch}
          onStarted={refetch}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Browser Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/30 shrink-0 overflow-x-auto flex-nowrap">
        {/* Dev Server Start/Stop */}
        {isStarting || isStopping ? (
          <button
            disabled
            className="shrink-0 p-1.5 rounded transition-colors opacity-50"
            title="Loading..."
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </button>
        ) : isServerRunning ? (
          <button
            onClick={async () => {
              await stop();
              onDevServerChanged?.();
            }}
            className="shrink-0 p-1.5 rounded hover:bg-red-500/10 text-red-500 transition-colors"
            title="Stop dev server"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={handleStartServer}
            className="shrink-0 p-1.5 rounded hover:bg-green-500/10 text-green-500 transition-colors"
            title="Start dev server"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Navigation */}
        <button
          onClick={goBack}
          disabled={historyIndex <= 0}
          className="shrink-0 p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
          title="Back"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          className="shrink-0 p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
          title="Forward"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={refresh}
          disabled={!iframeUrl}
          className="shrink-0 p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
          title="Refresh"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>

        {/* URL Bar */}
        <form onSubmit={handleUrlSubmit} className="flex-1 min-w-[120px] mx-1">
          <div className="flex items-center bg-background border rounded-md px-2 py-1">
            <Globe className="h-3 w-3 text-muted-foreground mr-1.5 shrink-0" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none min-w-0"
              placeholder={
                isServerRunning
                  ? "Enter URL or wait for auto-detection..."
                  : "Start dev server to preview"
              }
            />
            {urlInput && (
              <button
                type="button"
                onClick={() => {
                  setUrlInput("");
                  setIframeUrl(null);
                }}
                className="shrink-0 p-0.5 rounded hover:bg-muted ml-1"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </form>

        {/* URL Actions */}
        {urlInput && (
          <>
            <button
              onClick={() => navigator.clipboard.writeText(urlInput)}
              className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
              title="Copy URL"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => window.open(urlInput, "_blank")}
              className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
              title="Open in browser"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </>
        )}

        {/* Inspect Mode — only works when bridge script is loaded */}
        <button
          onClick={toggleInspect}
          disabled={!bridgeReady}
          className={`shrink-0 p-1.5 rounded transition-colors ${
            inspectActive
              ? "bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/40"
              : "hover:bg-muted disabled:opacity-30"
          }`}
          title={
            !iframeUrl
              ? "Load a page to use inspector"
              : !bridgeReady
                ? "Waiting for DevTools bridge to load..."
                : inspectActive
                  ? "Disable element inspector"
                  : "Enable element inspector"
          }
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>

        {/* Toggle DevTools — only works when bridge script is loaded */}
        <button
          onClick={toggleDevTools}
          disabled={!bridgeReady}
          className={`shrink-0 p-1.5 rounded transition-colors ${
            devToolsActive
              ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40"
              : "hover:bg-muted disabled:opacity-30"
          }`}
          title={
            !iframeUrl
              ? "Load a page to use DevTools"
              : !bridgeReady
                ? "Waiting for DevTools bridge to load..."
                : devToolsActive
                  ? "Hide DevTools"
                  : "Toggle DevTools"
          }
        >
          <Terminal className="h-3.5 w-3.5" />
        </button>

        {/* Device Presets */}
        <div className="shrink-0 flex items-center gap-0.5 ml-1 border-l pl-1.5">
          {DEVICE_PRESETS.map((preset, i) => (
            <button
              key={preset.name}
              onClick={() => setDevicePreset(i)}
              className={`p-1.5 rounded transition-colors ${
                devicePreset === i
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              title={preset.name}
            >
              <preset.icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        {/* Script Settings */}
        <button
          onClick={() => setScriptDialogOpen(true)}
          className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors ml-1 border-l pl-2"
          title="Dev server settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* iframe / Loading States */}
        <div className="flex-1 overflow-auto flex items-start justify-center bg-muted/20 p-2">
          {isStarting ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm font-medium">Starting dev server...</p>
            </div>
          ) : isServerRunning && !iframeUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm font-medium">Waiting for server URL...</p>
              <p className="text-xs">Scanning logs for a localhost URL</p>
            </div>
          ) : failedProcess && !isServerRunning ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="h-5 w-5 text-red-500" />
              </div>
              <p className="text-sm font-medium text-red-500">
                Dev server failed (exit code {failedProcess.exitCode ?? "?"})
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setScriptDialogOpen(true)}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Fix Script
                </button>
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
                >
                  View Logs
                </button>
              </div>
            </div>
          ) : !iframeUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Globe className="h-10 w-10 opacity-40" />
              <p className="text-sm">Enter a URL or start the dev server</p>
            </div>
          ) : (
            <div
              style={{
                width: device.width,
                height: device.height,
                maxWidth: "100%",
                maxHeight: "100%",
              }}
              className={`bg-white rounded-md overflow-hidden shadow-sm ${
                devicePreset > 0 ? "border-2 border-muted" : ""
              }`}
            >
              <iframe
                ref={iframeRef}
                src={iframeUrl}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                title="App Preview"
                onLoad={() => {
                  // Inject bridge script directly into iframe document (same-origin).
                  // This is more reliable than proxy injection + postMessage.
                  injectBridge();
                }}
              />
            </div>
          )}
        </div>

        {/* Execution Logs Panel */}
        {(showLogs || (isServerRunning && logs)) && (
          <div className="border-t bg-[#0d1117] shrink-0">
            <div className="flex items-center justify-between px-3 py-1 border-b border-[#30363d]">
              <span className="text-xs font-medium text-[#8b949e]">
                Execution Logs
              </span>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="p-0.5 rounded hover:bg-[#30363d] transition-colors"
              >
                <X className="h-3 w-3 text-[#8b949e]" />
              </button>
            </div>
            <div className="h-32 overflow-auto font-mono text-xs p-2 text-[#c9d1d9] whitespace-pre-wrap">
              {logs || "No logs yet..."}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-t bg-muted/30 text-xs text-muted-foreground shrink-0">
        <span className="flex items-center gap-1.5">
          {isServerRunning ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Server running
            </>
          ) : isStarting ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              Starting...
            </>
          ) : failedProcess ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Failed
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              Stopped
            </>
          )}
        </span>
        {detectedUrl && <span className="ml-2 truncate">{detectedUrl}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {iframeUrl &&
            isProxied &&
            (bridgeReady ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Bridge connected
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
                Connecting bridge...
              </>
            ))}
        </span>
        {inspectActive && (
          <span className="text-indigo-400 font-medium">
            Click an element to inspect
          </span>
        )}
        {logs && !showLogs && (
          <button
            onClick={() => setShowLogs(true)}
            className="text-primary hover:underline"
          >
            Show logs
          </button>
        )}
      </div>

      {/* Script Dialog */}
      <DevServerScriptDialog
        open={scriptDialogOpen}
        onClose={() => setScriptDialogOpen(false)}
        repositoryId={repositoryId}
        workspaceId={workspaceId}
        initialScript={devServerScript || ""}
        onSaved={refetch}
        onStarted={refetch}
      />
    </div>
  );
}
