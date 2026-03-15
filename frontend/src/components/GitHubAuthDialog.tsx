import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle2, Loader2, Terminal, AlertTriangle, Github } from "lucide-react";

type AuthState = "idle" | "running" | "success" | "error";

interface GitHubAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function GitHubAuthDialog({ open, onOpenChange, onSuccess }: GitHubAuthDialogProps) {
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  const startLogin = useCallback(() => {
    setAuthState("running");
    setLines([]);
    setErrorMessage(null);
    setUsername(null);

    const es = new EventSource("/api/auth/gh-login");
    eventSourceRef.current = es;

    es.addEventListener("status", (e) => {
      const data = JSON.parse(e.data);
      setLines((prev) => [...prev, data.message]);
    });

    es.addEventListener("output", (e) => {
      const data = JSON.parse(e.data);
      // Split multi-line output
      const newLines = data.text.split("\n").filter((l: string) => l.trim());
      setLines((prev) => [...prev, ...newLines]);
    });

    es.addEventListener("success", (e) => {
      const data = JSON.parse(e.data);
      setAuthState("success");
      setUsername(data.username);
      setLines((prev) => [...prev, "", `Logged in as ${data.username || "GitHub user"}`]);
      es.close();
      eventSourceRef.current = null;
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      queryClient.invalidateQueries({ queryKey: ["repo-prs"] });
    });

    es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setErrorMessage(data.message);
        setLines((prev) => [...prev, "", `Error: ${data.message}`]);
      } catch {
        setErrorMessage("Connection lost");
      }
      setAuthState("error");
      es.close();
      eventSourceRef.current = null;
    });

    es.onerror = () => {
      if (authState === "running") {
        // SSE connection closed by server (normal end)
      }
    };
  }, [queryClient]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const handleClose = () => {
    if (authState === "success") {
      onSuccess?.();
    }
    onOpenChange(false);
    // Reset after close animation
    setTimeout(() => {
      setAuthState("idle");
      setLines([]);
      setErrorMessage(null);
      setUsername(null);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Connect GitHub
          </DialogTitle>
          <DialogDescription>
            {authState === "idle"
              ? "Authenticate with GitHub to access your repositories and pull requests."
              : authState === "running"
                ? "Complete the authentication in your browser."
                : authState === "success"
                  ? "You're all set!"
                  : "Authentication failed. Please try again."}
          </DialogDescription>
        </DialogHeader>

        {authState === "idle" ? (
          <div className="py-4 space-y-4">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
              <p className="text-sm">
                This will open a browser window where you can sign in with your GitHub account.
                The app uses the <code className="text-xs bg-muted px-1 py-0.5 rounded">gh</code> CLI for authentication.
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>What happens:</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>A one-time code will appear below</li>
                  <li>A browser window opens to github.com</li>
                  <li>Paste the code and authorize the app</li>
                  <li>Return here — you're authenticated!</li>
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-3">
            {/* Terminal output */}
            <div
              ref={terminalRef}
              className="rounded-lg bg-gray-950 text-gray-100 font-mono text-xs p-4 min-h-[120px] max-h-[200px] overflow-y-auto space-y-0.5"
            >
              {lines.map((line, i) => (
                <div key={i} className={cn(
                  line.startsWith("Error:") ? "text-red-400" :
                  line.startsWith("Logged in") ? "text-green-400" :
                  line.includes("one-time code") || line.match(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/) ? "text-yellow-300 font-bold text-sm" :
                  "text-gray-300"
                )}>
                  {line || "\u00A0"}
                </div>
              ))}
              {authState === "running" && (
                <div className="flex items-center gap-2 text-gray-500 pt-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for browser authentication...
                </div>
              )}
            </div>

            {/* Status indicator */}
            {authState === "success" && (
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    Authenticated{username ? ` as ${username}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">You can now access your GitHub repositories and pull requests.</p>
                </div>
              </div>
            )}

            {authState === "error" && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">Authentication Failed</p>
                  <p className="text-xs text-muted-foreground">{errorMessage || "Please try again."}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {authState === "idle" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={startLogin}>
                <Terminal className="h-4 w-4 mr-2" />
                Start Authentication
              </Button>
            </>
          )}
          {authState === "running" && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {authState === "success" && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
          {authState === "error" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={startLogin}>
                <Terminal className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to check GitHub auth status and provide a trigger for the auth dialog.
 */
export function useGitHubAuth() {
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["github-status"],
    queryFn: () => api.auth.githubStatus(),
    staleTime: 60_000,
    retry: false,
  });

  const isAuthenticated = status?.authenticated ?? false;
  const isInstalled = status?.installed ?? false;
  const username = status?.username ?? null;

  /**
   * Call this before any GitHub operation.
   * Returns true if authenticated, false if dialog was shown.
   */
  const requireAuth = useCallback((): boolean => {
    if (isAuthenticated) return true;
    setShowAuthDialog(true);
    return false;
  }, [isAuthenticated]);

  return {
    isAuthenticated,
    isInstalled,
    username,
    isLoading,
    showAuthDialog,
    setShowAuthDialog,
    requireAuth,
  };
}
