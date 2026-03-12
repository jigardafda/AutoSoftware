/**
 * Artifact Preview Component
 *
 * Live preview for artifacts with:
 * - HTML preview in sandboxed iframe
 * - React component preview
 * - SVG rendering
 * - Mermaid diagrams
 * - Code syntax highlighting
 * - Copy and download actions
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Copy,
  Download,
  Check,
  Code,
  Eye,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Markdown } from "@/components/ui/markdown";

interface Artifact {
  id: string;
  type: string;
  name: string;
  content: string;
  language?: string;
}

interface Props {
  artifact: Artifact;
  onClose: () => void;
}

export function ArtifactPreview({ artifact, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  // Download file
  const handleDownload = useCallback(() => {
    const mimeType = getMimeType(artifact.type);
    const blob = new Blob([artifact.content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact]);

  // Get language for syntax highlighting
  const getLanguage = () => {
    if (artifact.language) return artifact.language;
    if (artifact.type === "html") return "html";
    if (artifact.type === "react") return "tsx";
    if (artifact.type === "svg") return "xml";
    if (artifact.type === "json") return "json";
    if (artifact.type === "mermaid") return "markdown";
    if (artifact.type === "markdown") return "markdown";
    return "plaintext";
  };

  // Check if preview is available
  const hasPreview = ["html", "svg", "react", "mermaid", "markdown", "md", "pdf"].includes(artifact.type);

  // Set default tab based on artifact type
  useEffect(() => {
    setActiveTab(hasPreview ? "preview" : "code");
  }, [artifact.id, hasPreview]);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, isFullscreen]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm",
        isFullscreen && "p-0"
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "bg-background border rounded-lg shadow-lg flex flex-col overflow-hidden",
          isFullscreen ? "w-full h-full rounded-none" : "w-[800px] h-[600px] max-w-[90vw] max-h-[90vh]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-3">
            <Code className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">{artifact.name}</span>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
              {artifact.type}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        {hasPreview && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "preview" | "code")}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="w-full justify-start rounded-none border-b px-4 h-10">
              <TabsTrigger value="preview" className="gap-2">
                <Eye className="h-4 w-4" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="code" className="gap-2">
                <Code className="h-4 w-4" />
                Code
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
              <ArtifactRenderer artifact={artifact} iframeRef={iframeRef} />
            </TabsContent>

            <TabsContent value="code" className="flex-1 m-0 overflow-auto">
              <SyntaxHighlighter
                language={getLanguage()}
                style={oneDark}
                customStyle={{
                  margin: 0,
                  borderRadius: 0,
                  height: "100%",
                }}
              >
                {artifact.content}
              </SyntaxHighlighter>
            </TabsContent>
          </Tabs>
        )}

        {/* Code only */}
        {!hasPreview && (
          <div className="flex-1 overflow-auto">
            <SyntaxHighlighter
              language={getLanguage()}
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: 0,
                height: "100%",
              }}
            >
              {artifact.content}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </div>
  );
}

// Artifact renderer based on type
function ArtifactRenderer({
  artifact,
  iframeRef,
}: {
  artifact: Artifact;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);

  // Render mermaid diagram
  useEffect(() => {
    if (artifact.type === "mermaid") {
      // Dynamic import mermaid
      import("mermaid").then((mermaidModule: any) => {
        const mermaid = mermaidModule.default;
        mermaid.initialize({ startOnLoad: false, theme: "dark" });
        mermaid
          .render("mermaid-preview", artifact.content)
          .then((result: { svg: string }) => {
            setMermaidSvg(result.svg);
          })
          .catch(() => {
            setMermaidSvg(null);
          });
      });
    }
  }, [artifact]);

  if (artifact.type === "html" || artifact.type === "react") {
    // Wrap content for preview
    const htmlContent =
      artifact.type === "react"
        ? `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${artifact.content}

    // Auto-render if component is default export pattern
    const root = ReactDOM.createRoot(document.getElementById('root'));
    if (typeof App !== 'undefined') {
      root.render(<App />);
    } else if (typeof Component !== 'undefined') {
      root.render(<Component />);
    }
  </script>
</body>
</html>
`
        : artifact.content.includes("<html")
          ? artifact.content
          : `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  ${artifact.content}
</body>
</html>
`;

    return (
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        sandbox="allow-scripts"
        className="w-full h-full border-0 bg-white"
        title={artifact.name}
      />
    );
  }

  if (artifact.type === "svg") {
    return (
      <div
        className="w-full h-full flex items-center justify-center p-4 bg-white"
        dangerouslySetInnerHTML={{ __html: artifact.content }}
      />
    );
  }

  if (artifact.type === "mermaid") {
    if (mermaidSvg) {
      return (
        <div
          className="w-full h-full flex items-center justify-center p-4 overflow-auto"
          dangerouslySetInnerHTML={{ __html: mermaidSvg }}
        />
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
        Rendering diagram...
      </div>
    );
  }

  // Markdown preview
  if (artifact.type === "markdown" || artifact.type === "md") {
    return (
      <div className="w-full h-full overflow-auto p-6 bg-background">
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <Markdown>{artifact.content}</Markdown>
        </article>
      </div>
    );
  }

  // PDF preview (using iframe or object)
  if (artifact.type === "pdf") {
    // If content is base64 encoded
    const isBase64 = artifact.content.startsWith("data:") || !artifact.content.includes("<");
    if (isBase64) {
      const pdfSrc = artifact.content.startsWith("data:")
        ? artifact.content
        : `data:application/pdf;base64,${artifact.content}`;
      return (
        <iframe
          src={pdfSrc}
          className="w-full h-full border-0"
          title={artifact.name}
        />
      );
    }
    // If content is a URL
    if (artifact.content.startsWith("http")) {
      return (
        <iframe
          src={artifact.content}
          className="w-full h-full border-0"
          title={artifact.name}
        />
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
        Cannot preview this PDF format
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
      Preview not available for this type
    </div>
  );
}

// Helper to get MIME type
function getMimeType(type: string): string {
  switch (type) {
    case "html":
      return "text/html";
    case "svg":
      return "image/svg+xml";
    case "json":
      return "application/json";
    case "markdown":
      return "text/markdown";
    default:
      return "text/plain";
  }
}
