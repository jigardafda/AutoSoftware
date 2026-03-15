import { useState, useMemo } from "react";
import { X, Download, Copy, Check, Globe, Code, FileText, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import type { Artifact } from "./ArtifactDetector";

interface ArtifactPreviewProps {
  artifact: Artifact | null;
  onClose: () => void;
  onDownload: (artifact: Artifact) => void;
  className?: string;
}

function TypeBadge({ type }: { type: Artifact["type"] }) {
  const config: Record<Artifact["type"], { label: string; color: string }> = {
    html: { label: "HTML", color: "bg-orange-500/15 text-orange-400" },
    markdown: { label: "Markdown", color: "bg-blue-500/15 text-blue-400" },
    react: { label: "React", color: "bg-cyan-500/15 text-cyan-400" },
    code: { label: "Code", color: "bg-violet-500/15 text-violet-400" },
    svg: { label: "SVG", color: "bg-green-500/15 text-green-400" },
    csv: { label: "CSV", color: "bg-yellow-500/15 text-yellow-400" },
    text: { label: "Text", color: "bg-zinc-500/15 text-zinc-400" },
    mermaid: { label: "Mermaid", color: "bg-pink-500/15 text-pink-400" },
  };

  const { label, color } = config[type];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        color
      )}
    >
      {label}
    </span>
  );
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title="Copy content"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-500" />
          <span className="text-green-500">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

function HtmlPreview({ content }: { content: string }) {
  return (
    <iframe
      srcDoc={content}
      sandbox="allow-scripts"
      className="w-full h-full border-0 bg-white rounded-b-md"
      title="HTML Preview"
    />
  );
}

function ReactPreview({ content }: { content: string }) {
  const srcDoc = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18?dev",
      "react-dom/client": "https://esm.sh/react-dom@18/client?dev",
      "react/jsx-runtime": "https://esm.sh/react@18/jsx-runtime?dev"
    }
  }
  </script>
  <style>
    body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
    #root { }
    .error { color: red; font-family: monospace; white-space: pre-wrap; padding: 16px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import React from "react";
    import { createRoot } from "react-dom/client";

    try {
      ${content}

      // Try to find the default export or last component defined
      const components = [typeof App !== 'undefined' && App, typeof Component !== 'undefined' && Component].filter(Boolean);
      const RootComponent = components[0] || (() => React.createElement('div', null, 'No component found. Export a component named App or Component.'));
      const root = createRoot(document.getElementById("root"));
      root.render(React.createElement(RootComponent));
    } catch (err) {
      document.getElementById("root").innerHTML = '<pre class="error">' + err.message + '</pre>';
    }
  </script>
</body>
</html>`;
  }, [content]);

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      className="w-full h-full border-0 bg-white rounded-b-md"
      title="React Preview"
    />
  );
}

function SvgPreview({ content }: { content: string }) {
  return (
    <div
      className="flex items-center justify-center w-full h-full p-8 bg-white rounded-b-md overflow-auto"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

function CsvPreview({ content }: { content: string }) {
  const { headers, rows } = useMemo(() => {
    const lines = content.trim().split("\n");
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseLine = (line: string) =>
      line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));

    return {
      headers: parseLine(lines[0]),
      rows: lines.slice(1).map(parseLine),
    };
  }, [content]);

  return (
    <div className="w-full h-full overflow-auto p-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border border-border bg-muted px-3 py-2 text-left font-medium text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-muted/50">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border border-border px-3 py-2 text-muted-foreground"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodePreview({
  content,
  language,
}: {
  content: string;
  language?: string;
}) {
  return (
    <div className="w-full h-full overflow-auto p-4">
      <pre className="text-xs font-mono leading-relaxed">
        <code className={language ? `language-${language}` : undefined}>
          {content}
        </code>
      </pre>
    </div>
  );
}

function MermaidPreview({ content }: { content: string }) {
  return (
    <div className="w-full h-full overflow-auto p-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Image className="h-3.5 w-3.5" />
        <span>Mermaid diagram (code view)</span>
      </div>
      <pre className="text-xs font-mono leading-relaxed bg-muted/50 rounded-md p-3">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="w-full h-full overflow-auto p-4">
      <Markdown>{content}</Markdown>
    </div>
  );
}

function getPreviewIcon(type: Artifact["type"]) {
  switch (type) {
    case "html":
    case "react":
      return Globe;
    case "svg":
      return Image;
    case "code":
      return Code;
    default:
      return FileText;
  }
}

export function ArtifactPreview({
  artifact,
  onClose,
  onDownload,
  className,
}: ArtifactPreviewProps) {
  if (!artifact) return null;

  const Icon = getPreviewIcon(artifact.type);

  return (
    <div
      className={cn(
        "flex flex-col h-full border border-border rounded-md bg-background overflow-hidden",
        className
      )}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate flex-1">
          {artifact.title}
        </span>
        <TypeBadge type={artifact.type} />
        <CopyButton content={artifact.content} />
        <button
          onClick={() => onDownload(artifact)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download</span>
        </button>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Close preview"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preview content */}
      <div className="flex-1 min-h-0">
        {artifact.type === "html" && <HtmlPreview content={artifact.content} />}
        {artifact.type === "react" && (
          <ReactPreview content={artifact.content} />
        )}
        {artifact.type === "svg" && <SvgPreview content={artifact.content} />}
        {artifact.type === "csv" && <CsvPreview content={artifact.content} />}
        {artifact.type === "mermaid" && (
          <MermaidPreview content={artifact.content} />
        )}
        {artifact.type === "markdown" && (
          <MarkdownPreview content={artifact.content} />
        )}
        {(artifact.type === "code" || artifact.type === "text") && (
          <CodePreview
            content={artifact.content}
            language={artifact.language}
          />
        )}
      </div>
    </div>
  );
}
