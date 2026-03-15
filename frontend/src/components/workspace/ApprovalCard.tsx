import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldAlert, Check, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ApprovalCardProps {
  id: string;
  title: string;
  description: string;
  details?: string;
  type: "file_edit" | "command" | "action";
  status?: "pending" | "approved" | "rejected";
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
}

export function ApprovalCard({
  id,
  title,
  description,
  details,
  type,
  status = "pending",
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  const typeLabels: Record<string, string> = {
    file_edit: "File Edit",
    command: "Command",
    action: "Action",
  };

  const isPending = status === "pending";

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-4 transition-colors duration-200",
        status === "approved" && "border-green-500/30 bg-green-500/5",
        status === "rejected" && "border-red-500/30 bg-red-500/5",
        isPending && "border-amber-500/40 bg-amber-500/5"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            isPending && "bg-amber-500/10 text-amber-500",
            status === "approved" && "bg-green-500/10 text-green-500",
            status === "rejected" && "bg-red-500/10 text-red-500"
          )}
        >
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {typeLabels[type] || type}
            </span>
            {!isPending && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  status === "approved" && "bg-green-500/10 text-green-500",
                  status === "rejected" && "bg-red-500/10 text-red-500"
                )}
              >
                {status === "approved" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                {status === "approved" ? "Approved" : "Rejected"}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      {/* Expandable Details */}
      {details && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Hide details" : "Show details"}
          </button>
          {expanded && (
            <pre className="mt-2 rounded-md bg-muted/50 p-3 text-xs font-mono text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto">
              {details}
            </pre>
          )}
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="mt-3 space-y-2">
          {showFeedback ? (
            <div className="space-y-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Explain why you're rejecting this..."
                className="w-full resize-none rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                rows={2}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowFeedback(false);
                    setFeedback("");
                  }}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onReject(id, feedback || undefined);
                    setShowFeedback(false);
                    setFeedback("");
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onApprove(id)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowFeedback(true)}
                className="border-red-500/30 text-red-500 hover:bg-red-500/10"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1" />
                Request Changes
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
