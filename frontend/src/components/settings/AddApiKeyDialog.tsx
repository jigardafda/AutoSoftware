import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Eye,
  EyeOff,
  Loader2,
  Terminal,
  Key,
  ExternalLink,
  Copy,
  Check,
  Info,
} from "lucide-react";
import { toast } from "sonner";

interface AddApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyAdded: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

function CodeBlock({ children, copyable = true }: { children: string; copyable?: boolean }) {
  return (
    <div className="relative">
      <pre className="bg-muted/50 border border-border/50 rounded-lg px-3 py-2.5 pr-10 font-mono text-sm overflow-x-auto">
        <code>{children}</code>
      </pre>
      {copyable && <CopyButton text={children} />}
    </div>
  );
}

export function AddApiKeyDialog({ open, onOpenChange, onKeyAdded }: AddApiKeyDialogProps) {
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !apiKey.trim()) return;

    setLoading(true);
    try {
      await api.apiKeys.create({ label: label.trim(), apiKey: apiKey.trim() });
      toast.success("API key added successfully");
      setLabel("");
      setApiKey("");
      setShowKey(false);
      onOpenChange(false);
      onKeyAdded();
    } catch (err: any) {
      toast.error(err.message || "Failed to add API key");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setLabel("");
    setApiKey("");
    setShowKey(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) handleReset();
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Add API Key or OAuth Token
          </DialogTitle>
          <DialogDescription>
            Connect your Anthropic credentials to enable AI-powered code analysis.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="token" className="gap-2">
              <Terminal className="h-4 w-4" />
              Claude Code Token
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-2">
              <Key className="h-4 w-4" />
              API Key
            </TabsTrigger>
          </TabsList>

          <TabsContent value="token" className="space-y-4 mt-4">
            {/* Info banner */}
            <div className="flex gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">Recommended for Claude Code users</p>
                <p className="text-muted-foreground">
                  OAuth tokens use your existing Claude Code subscription and don't require a separate API key.
                </p>
              </div>
            </div>

            {/* Step 1 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                Run the setup command
              </h4>
              <p className="text-sm text-muted-foreground ml-7">
                Open your terminal and run the following command:
              </p>
              <div className="ml-7">
                <CodeBlock>claude setup-token</CodeBlock>
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                Copy the token
              </h4>
              <p className="text-sm text-muted-foreground ml-7">
                The command will output your OAuth token starting with <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">sk-ant-oat-...</code>
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                Paste it below
              </h4>
            </div>
          </TabsContent>

          <TabsContent value="api" className="space-y-4 mt-4">
            {/* Info banner */}
            <div className="flex gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">For direct API access</p>
                <p className="text-muted-foreground">
                  API keys are billed separately based on usage. Great for teams or programmatic access.
                </p>
              </div>
            </div>

            {/* Step 1 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                Open the Anthropic Console
              </h4>
              <div className="ml-7">
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  console.anthropic.com/settings/keys
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                Create a new API key
              </h4>
              <p className="text-sm text-muted-foreground ml-7">
                Click "Create Key", give it a name, and copy the key starting with <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">sk-ant-api-...</code>
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                Paste it below
              </h4>
            </div>
          </TabsContent>
        </Tabs>

        {/* Form - shown for both tabs */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-border/50">
          <div className="space-y-2">
            <Label htmlFor="key-label">Label</Label>
            <Input
              id="key-label"
              placeholder="e.g. Personal, Work, Team"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              A friendly name to identify this credential
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key">
              {activeTab === "token" ? "OAuth Token" : "API Key"}
            </Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? "text" : "password"}
                placeholder={activeTab === "token" ? "sk-ant-oat-..." : "sk-ant-api-..."}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={loading}
                className="pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !label.trim() || !apiKey.trim()}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Validating..." : activeTab === "token" ? "Add Token" : "Add Key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
