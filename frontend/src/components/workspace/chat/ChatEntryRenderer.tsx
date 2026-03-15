import { useState } from "react";
import { Bot, User, AlertTriangle, Info, FileText, Image as ImageIcon, Copy, Check, Pencil, Download, Eye, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import { ToolCallEntry as ToolCallEntryComponent } from "./ToolCallEntry";
import { ThinkingBlock } from "./ThinkingBlock";
import { FileChangeEntry } from "./FileChangeEntry";
import { ApprovalCard } from "../ApprovalCard";
import { ActionButtonsEntry } from "./ActionButtonsEntry";
import type { ChatEntry, ToolCallEntry, FileChangeEntry as FileChangeType, PermissionRequestEntry, ActionButtonsEntry as ActionButtonsType, Attachment } from "./types";

interface ChatEntryRendererProps {
  entry: ChatEntry;
  onApprove?: (requestId: string) => void;
  onReject?: (requestId: string, reason?: string) => void;
  onEdit?: (content: string) => void;
  onRetry?: (entry: ChatEntry) => void;
  onShowInTerminal?: (entry: ChatEntry) => void;
  onAction?: (prompt: string) => void;
  className?: string;
}

export function ChatEntryRenderer({
  entry,
  onApprove,
  onReject,
  onEdit,
  onRetry,
  onShowInTerminal,
  onAction,
  className,
}: ChatEntryRendererProps) {
  switch (entry.type) {
    case "user_message":
      return (
        <div className={cn("flex justify-end items-start gap-1.5 group/user", className)}>
          <div className="flex gap-1 pt-1 opacity-0 group-hover/user:opacity-100 transition-opacity shrink-0">
            <CopyIconButton text={entry.content} />
            {onRetry && (
              <button
                onClick={() => onRetry(entry)}
                className="rounded-full bg-background border border-border p-1 shadow-sm hover:bg-muted"
                aria-label="Retry message"
                title="Retry"
              >
                <RotateCcw className="h-3 w-3 text-foreground" />
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => onEdit(entry.content)}
                className="rounded-full bg-background border border-border p-1 shadow-sm hover:bg-muted"
                aria-label="Edit message"
              >
                <Pencil className="h-3 w-3 text-foreground" />
              </button>
            )}
          </div>
          <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm bg-primary text-primary-foreground">
            <div className="min-w-0">
              {entry.attachments && entry.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {entry.attachments.map((att) => (
                    <AttachmentPreview key={att.id} attachment={att} />
                  ))}
                </div>
              )}
              {entry.content && (
                <p className="whitespace-pre-wrap break-words">{entry.content}</p>
              )}
              <span className="block text-[10px] mt-1 opacity-50">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      );

    case "agent_message":
      return (
        <div className={cn("flex justify-start group/agent", className)}>
          <div className="relative max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm bg-muted/60 border border-border/30">
            <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover/agent:opacity-100 transition-opacity">
              <CopyIconButton text={entry.content} />
              <DownloadMdButton text={entry.content} />
            </div>
            <div className="flex items-start gap-2">
              <Bot className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <Markdown className="text-sm">{entry.content}</Markdown>
                <span className="block text-[10px] mt-1 text-muted-foreground/50">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      );

    case "thinking":
      return (
        <div className={cn("px-1", className)}>
          <ThinkingBlock content={entry.content} />
        </div>
      );

    case "tool_call": {
      const meta = entry.metadata as ToolCallEntry["metadata"];
      return (
        <div className={cn("px-1", className)}>
          <ToolCallEntryComponent
            toolName={meta.toolName}
            summary={entry.content}
            status={meta.status}
            result={meta.result}
            command={meta.command}
            onShowInTerminal={onShowInTerminal ? () => onShowInTerminal(entry) : undefined}
          />
        </div>
      );
    }

    case "file_change": {
      const meta = entry.metadata as FileChangeType["metadata"];
      return (
        <div className={cn("px-1", className)}>
          <FileChangeEntry
            filename={meta.filename}
            additions={meta.additions}
            deletions={meta.deletions}
            status={meta.status}
          />
        </div>
      );
    }

    case "permission_request": {
      const meta = entry.metadata as PermissionRequestEntry["metadata"];
      return (
        <div className={cn("px-1", className)}>
          <ApprovalCard
            id={meta.requestId}
            title={meta.toolName || "Tool Call"}
            description={entry.content}
            details={meta.toolInput}
            type={meta.toolName?.toLowerCase().includes("bash") ? "command" : "action"}
            status={meta.status === "pending" ? "pending" : meta.status === "approved" ? "approved" : "rejected"}
            onApprove={(id) => onApprove?.(id)}
            onReject={(id) => onReject?.(id)}
          />
        </div>
      );
    }

    case "error":
      return (
        <div className={cn("flex items-start gap-2 px-1 py-1", className)}>
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400 whitespace-pre-wrap break-words">
            {entry.content}
          </p>
        </div>
      );

    case "system":
      return (
        <div className={cn("flex items-start gap-2 px-1 py-1", className)}>
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground italic">{entry.content}</p>
        </div>
      );

    case "action_buttons": {
      const meta = entry.metadata as ActionButtonsType["metadata"];
      return (
        <div className={cn("px-1", className)}>
          <ActionButtonsEntry
            question={meta.question || meta.label}
            choices={meta.choices || (meta.buttons || []).map((b) => ({
              id: b.id,
              label: b.label,
              value: b.label,
              prompt: b.prompt,
            }))}
            selectionMode={meta.selectionMode || "button"}
            onAction={(prompt) => onAction?.(prompt)}
          />
        </div>
      );
    }

    case "usage_update":
      // Usage updates are consumed by the gauge, not rendered inline
      return null;

    default:
      return null;
  }
}

function CopyIconButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="rounded-full bg-background border border-border p-1 shadow-sm hover:bg-muted"
      aria-label={copied ? "Copied" : "Copy message"}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-foreground" />
      )}
    </button>
  );
}

function DownloadMdButton({ text }: { text: string }) {
  const handleDownload = () => {
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `response-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className="rounded-full bg-background border border-border p-1 shadow-sm hover:bg-muted"
      aria-label="Download as Markdown"
    >
      <Download className="h-3 w-3 text-foreground" />
    </button>
  );
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [showLightbox, setShowLightbox] = useState(false);
  const hasData = Boolean(attachment.data);
  const hasPreview = Boolean(attachment.previewUrl);
  const hasServerUrl = Boolean(attachment.serverUrl);
  const canDisplay = hasData || hasPreview || hasServerUrl;

  const handleDownload = () => {
    if (hasServerUrl && !hasData) {
      // Download from server URL
      const a = document.createElement("a");
      a.href = attachment.serverUrl!;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    if (!hasData) return;
    const byteChars = atob(attachment.data);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: attachment.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = attachment.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (attachment.type === "image") {
    const src = canDisplay
      ? attachment.previewUrl || (hasData ? `data:${attachment.mimeType};base64,${attachment.data}` : attachment.serverUrl)
      : undefined;

    return (
      <>
        <div className="relative group/att">
          {src ? (
            <img
              src={src}
              alt={attachment.name}
              className="max-w-[320px] max-h-[240px] rounded-lg object-cover border border-white/20 cursor-pointer"
              onClick={() => setShowLightbox(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-[140px] h-[100px] rounded-lg bg-white/10 border border-white/20">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <span className="text-[10px] mt-1 opacity-60 truncate max-w-[120px] px-1">{attachment.name}</span>
            </div>
          )}
          <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover/att:opacity-100 transition-opacity">
            {canDisplay && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowLightbox(true); }}
                className="rounded-md bg-black/60 p-1 hover:bg-black/80 backdrop-blur-sm"
                aria-label="Preview image"
              >
                <Eye className="h-3.5 w-3.5 text-white" />
              </button>
            )}
            {(hasData || hasServerUrl) && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                className="rounded-md bg-black/60 p-1 hover:bg-black/80 backdrop-blur-sm"
                aria-label="Download attachment"
              >
                <Download className="h-3.5 w-3.5 text-white" />
              </button>
            )}
          </div>
        </div>
        {showLightbox && src && (
          <AttachmentLightbox src={src} mimeType={attachment.mimeType} alt={attachment.name} onClose={() => setShowLightbox(false)} />
        )}
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs group/att">
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate max-w-[150px]">{attachment.name}</span>
      <span className="text-[10px] opacity-60">{formatFileSize(attachment.size)}</span>
      <div className="flex gap-0.5 ml-1 opacity-0 group-hover/att:opacity-100 transition-opacity">
        {(hasData || hasServerUrl) && (
          <>
            <button
              onClick={() => setShowLightbox(true)}
              className="rounded hover:bg-white/20 p-0.5"
              aria-label="Preview file"
            >
              <Eye className="h-3 w-3" />
            </button>
            <button
              onClick={handleDownload}
              className="rounded hover:bg-white/20 p-0.5"
              aria-label="Download file"
            >
              <Download className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
      {showLightbox && (hasData || hasServerUrl) && (
        <AttachmentLightbox
          text={hasData && isTextFile(attachment.mimeType, attachment.name) ? atob(attachment.data) : undefined}
          src={!hasData && hasServerUrl ? attachment.serverUrl : undefined}
          base64Data={hasData ? attachment.data : undefined}
          mimeType={attachment.mimeType}
          alt={attachment.name}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </div>
  );
}

function AttachmentLightbox({
  src,
  text,
  alt,
  mimeType,
  base64Data,
  onClose,
}: {
  src?: string;
  text?: string;
  alt: string;
  mimeType?: string;
  base64Data?: string;
  onClose: () => void;
}) {
  const isPdf = mimeType === "application/pdf" || alt.toLowerCase().endsWith(".pdf");
  const isImage = mimeType?.startsWith("image/") || false;

  // Build a data URL for PDF rendering in iframe
  const pdfSrc = isPdf
    ? (src || (base64Data ? `data:application/pdf;base64,${base64Data}` : undefined))
    : undefined;

  // For images, use src directly
  const imgSrc = isImage ? src : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-hidden bg-background p-2 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 p-1.5 shadow-lg z-10 transition-colors"
          aria-label="Close preview"
        >
          <X className="h-4 w-4 text-white" />
        </button>
        {pdfSrc ? (
          <iframe
            src={pdfSrc}
            title={alt}
            className="w-[80vw] h-[85vh] rounded border-0"
          />
        ) : imgSrc ? (
          <img src={imgSrc} alt={alt} className="max-w-full max-h-[85vh] object-contain rounded" />
        ) : text !== undefined ? (
          <pre className="p-4 text-sm whitespace-pre-wrap break-words max-w-[80vw] max-h-[85vh] overflow-auto">
            {text}
          </pre>
        ) : null}
        <p className="text-center text-xs text-muted-foreground mt-2">{alt}</p>
      </div>
    </div>
  );
}

function isTextFile(mimeType: string, name: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json" || mimeType === "application/xml") return true;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const textExts = ["txt", "md", "json", "xml", "csv", "log", "yml", "yaml", "toml", "ini", "cfg", "js", "ts", "tsx", "jsx", "py", "rb", "sh", "bash", "html", "css", "sql"];
  return textExts.includes(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
