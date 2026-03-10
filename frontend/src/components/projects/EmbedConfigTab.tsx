import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Copy, Check, Loader2, Eye, Save, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FONT_FAMILIES = [
  "Inter",
  "System UI",
  "Roboto",
  "Open Sans",
  "Lato",
  "Nunito",
  "Poppins",
  "Montserrat",
  "Source Sans 3",
  "DM Sans",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "zh", label: "Chinese" },
];

interface EmbedConfigTabProps {
  projectId: string;
}

export function EmbedConfigTab({ projectId }: EmbedConfigTabProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [backgroundColor, setBackgroundColor] = useState("#09090b");
  const [textColor, setTextColor] = useState("#fafafa");
  const [borderRadius, setBorderRadius] = useState(8);
  const [fontFamily, setFontFamily] = useState("Inter");
  const [scoreThreshold, setScoreThreshold] = useState(7);
  const [maxFileSize, setMaxFileSize] = useState(10);
  const [maxTotalSize, setMaxTotalSize] = useState(50);
  const [allowedFileTypes, setAllowedFileTypes] = useState<string[]>([]);
  const [language, setLanguage] = useState("en");

  const { data: config, isLoading } = useQuery({
    queryKey: ["embed-config", projectId],
    queryFn: () => api.projects.getEmbedConfig(projectId),
    enabled: !!projectId,
  });

  // Initialize form from fetched config
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled ?? false);
      setTitle(config.title ?? "");
      setWelcomeMessage(config.welcomeMessage ?? "");
      setLogoUrl(config.logoUrl ?? "");
      setPrimaryColor(config.primaryColor ?? "#6366f1");
      setBackgroundColor(config.backgroundColor ?? "#09090b");
      setTextColor(config.textColor ?? "#fafafa");
      setBorderRadius(config.borderRadius ?? 8);
      setFontFamily(config.fontFamily ?? "Inter");
      setScoreThreshold(config.scoreThreshold ?? 7);
      setMaxFileSize(config.maxFileSize ?? 10);
      setMaxTotalSize(config.maxTotalSize ?? 50);
      setAllowedFileTypes(config.allowedFileTypes ?? []);
      setLanguage(config.language ?? "en");
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.projects.updateEmbedConfig(projectId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["embed-config", projectId] });
      setPreviewKey((k) => k + 1);
      toast.success("Embed configuration saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    updateMutation.mutate({
      enabled,
      title,
      welcomeMessage,
      logoUrl,
      primaryColor,
      backgroundColor,
      textColor,
      borderRadius,
      fontFamily,
      scoreThreshold,
      maxFileSize,
      maxTotalSize,
      allowedFileTypes,
      language,
    });
  };

  const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
  const embedCode = `<iframe src="${backendUrl}/embed/${projectId}" width="100%" height="600" frameborder="0" allow="microphone"></iframe>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      toast.success("Embed code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enable/Disable */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Enable Embed</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Allow external users to submit code through an embeddable widget
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="embed-title">Title</Label>
              <Input
                id="embed-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Submit your code for review"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="embed-logo">Logo URL</Label>
              <Input
                id="embed-logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="embed-welcome">Welcome Message</Label>
            <Textarea
              id="embed-welcome"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Describe what users should submit and any guidelines..."
              rows={3}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="embed-primary-color">Primary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="embed-primary-color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 font-mono text-xs"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="embed-bg-color">Background Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="embed-bg-color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer"
                />
                <Input
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="flex-1 font-mono text-xs"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="embed-text-color">Text Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="embed-text-color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer"
                />
                <Input
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="flex-1 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="embed-border-radius">Border Radius (px)</Label>
              <Input
                id="embed-border-radius"
                type="number"
                min={0}
                max={32}
                value={borderRadius}
                onChange={(e) => setBorderRadius(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Font Family</Label>
              <Select value={fontFamily} onValueChange={setFontFamily}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_FAMILIES.map((font) => (
                    <SelectItem key={font} value={font}>
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Behavior */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="embed-threshold">Score Threshold</Label>
              <Input
                id="embed-threshold"
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Minimum score (1-10) to pass screening
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="embed-max-file">Max File Size (MB)</Label>
              <Input
                id="embed-max-file"
                type="number"
                min={1}
                value={maxFileSize}
                onChange={(e) => setMaxFileSize(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="embed-max-total">Max Total Size (MB)</Label>
              <Input
                id="embed-max-total"
                type="number"
                min={1}
                value={maxTotalSize}
                onChange={(e) => setMaxTotalSize(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Allowed File Types</Label>
              <div className="flex flex-wrap gap-1.5">
                {allowedFileTypes.length > 0 ? (
                  allowedFileTypes.map((type) => (
                    <span
                      key={type}
                      className="inline-flex items-center rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 border border-zinc-700"
                    >
                      {type}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    All file types allowed
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Live Preview
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/embed/${projectId}?preview=true`, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open in New Tab
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
            <iframe
              key={previewKey}
              src={`/embed/${projectId}?preview=true`}
              className="w-full h-[500px] border-0"
              title="Embed preview"
            />
          </div>
        </CardContent>
      </Card>

      {/* Embed Code */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Embed Code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Copy and paste this code snippet into your website to embed the
            submission form.
          </p>
          <div className="relative">
            <pre className="rounded-lg bg-zinc-950 border border-zinc-800 p-4 pr-12 text-xs font-mono text-zinc-300 overflow-x-auto">
              {embedCode}
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="min-w-[120px]"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
