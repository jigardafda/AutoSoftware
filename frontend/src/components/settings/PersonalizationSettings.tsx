/**
 * PersonalizationSettings Component
 *
 * Settings panel for AI verbosity, code style preferences,
 * notification preferences, quiet hours, and auto-detected patterns.
 */

import { useState, useEffect } from "react";
import { usePersonalization, type PreferencesUpdate } from "@/hooks/usePersonalization";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  MessageSquare,
  Code2,
  Bell,
  Moon,
  Brain,
  RefreshCw,
  Sparkles,
  Clock,
  Globe,
  Palette,
  Info,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// =============================================================================
// Constants
// =============================================================================

const LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Rust",
  "Go",
  "Java",
  "C++",
  "C#",
  "Ruby",
  "PHP",
  "Swift",
  "Kotlin",
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

// =============================================================================
// Component
// =============================================================================

export function PersonalizationSettings() {
  const {
    preferences,
    insights,
    isLoading,
    isLoadingInsights,
    isUpdating,
    updatePreferences,
    resetPreferences,
    refresh,
    refreshInsights,
    isQuietHours,
  } = usePersonalization({ autoTrackActivity: false });

  const [localPrefs, setLocalPrefs] = useState<PreferencesUpdate>({});
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState("ai");

  // Sync local state with preferences
  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        aiVerbosity: preferences.aiVerbosity,
        aiTone: preferences.aiTone,
        preferredLanguages: preferences.preferredLanguages,
        codeStyle: preferences.codeStyle,
        notificationPrefs: preferences.notificationPrefs,
        quietHoursStart: preferences.quietHoursStart,
        quietHoursEnd: preferences.quietHoursEnd,
        timezone: preferences.timezone,
        uiDensity: preferences.uiDensity,
        enableAutoDetection: preferences.enableAutoDetection,
      });
      setIsDirty(false);
    }
  }, [preferences]);

  const handleUpdate = (updates: PreferencesUpdate) => {
    setLocalPrefs((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await updatePreferences(localPrefs);
      setIsDirty(false);
      toast.success("Preferences saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save preferences");
    }
  };

  const handleReset = async () => {
    try {
      await resetPreferences();
      toast.success("Preferences reset to defaults");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset preferences");
    }
  };

  if (isLoading) {
    return <PersonalizationSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Personalization
          </h3>
          <p className="text-sm text-muted-foreground">
            Customize your AI experience and preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button onClick={handleSave} disabled={isUpdating}>
              {isUpdating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => refresh()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quiet Hours Indicator */}
      {isQuietHours && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/50">
          <Moon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Quiet hours are active. Notifications are suppressed.
          </span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="ai" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">AI</span>
          </TabsTrigger>
          <TabsTrigger value="code" className="gap-1.5">
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">Code</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="ui" className="gap-1.5">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">UI</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Insights</span>
          </TabsTrigger>
        </TabsList>

        {/* AI Preferences Tab */}
        <TabsContent value="ai" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Response Style</CardTitle>
              <CardDescription>
                Control how the AI communicates with you
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Verbosity Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Verbosity Level</Label>
                  <Badge variant="outline" className="capitalize">
                    {localPrefs.aiVerbosity}
                  </Badge>
                </div>
                <Slider
                  value={[
                    localPrefs.aiVerbosity === "minimal"
                      ? 0
                      : localPrefs.aiVerbosity === "detailed"
                      ? 2
                      : 1,
                  ]}
                  onValueChange={([v]) => {
                    const values = ["minimal", "medium", "detailed"] as const;
                    handleUpdate({ aiVerbosity: values[v] });
                  }}
                  max={2}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Minimal</span>
                  <span>Medium</span>
                  <span>Detailed</span>
                </div>
              </div>

              {/* AI Tone */}
              <div className="space-y-2">
                <Label>Communication Tone</Label>
                <Select
                  value={localPrefs.aiTone}
                  onValueChange={(v) =>
                    handleUpdate({ aiTone: v as "casual" | "professional" | "technical" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">Casual & Friendly</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="technical">Technical & Precise</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {localPrefs.aiTone === "casual" &&
                    "Friendly, conversational responses"}
                  {localPrefs.aiTone === "professional" &&
                    "Balanced, business-appropriate tone"}
                  {localPrefs.aiTone === "technical" &&
                    "Precise technical language, assumes expertise"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Preferred Languages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preferred Languages</CardTitle>
              <CardDescription>
                Languages you work with most often
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((lang) => {
                  const isSelected =
                    localPrefs.preferredLanguages?.includes(lang) || false;
                  return (
                    <Badge
                      key={lang}
                      variant={isSelected ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer transition-colors",
                        !isSelected && "hover:bg-muted"
                      )}
                      onClick={() => {
                        const current = localPrefs.preferredLanguages || [];
                        const updated = isSelected
                          ? current.filter((l) => l !== lang)
                          : [...current, lang];
                        handleUpdate({ preferredLanguages: updated });
                      }}
                    >
                      {lang}
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Auto Detection Toggle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Learning Mode
              </CardTitle>
              <CardDescription>
                Allow the system to learn from your behavior
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-detect preferences</Label>
                  <p className="text-xs text-muted-foreground">
                    Track usage patterns to improve suggestions
                  </p>
                </div>
                <Switch
                  checked={localPrefs.enableAutoDetection}
                  onCheckedChange={(v) =>
                    handleUpdate({ enableAutoDetection: v })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Code Style Tab */}
        <TabsContent value="code" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Code Formatting</CardTitle>
              <CardDescription>
                Your preferred code style settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Indentation */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Indentation</Label>
                  <Select
                    value={localPrefs.codeStyle?.indentation}
                    onValueChange={(v) =>
                      handleUpdate({
                        codeStyle: {
                          ...localPrefs.codeStyle,
                          indentation: v as "tabs" | "spaces",
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spaces">Spaces</SelectItem>
                      <SelectItem value="tabs">Tabs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Indent Size</Label>
                  <Select
                    value={String(localPrefs.codeStyle?.indentSize || 2)}
                    onValueChange={(v) =>
                      handleUpdate({
                        codeStyle: {
                          ...localPrefs.codeStyle,
                          indentSize: parseInt(v),
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 4, 8].map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} spaces
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quotes and Semicolons */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quote Style</Label>
                  <Select
                    value={localPrefs.codeStyle?.quotes}
                    onValueChange={(v) =>
                      handleUpdate({
                        codeStyle: {
                          ...localPrefs.codeStyle,
                          quotes: v as "single" | "double",
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single (')</SelectItem>
                      <SelectItem value="double">Double (")</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Trailing Comma</Label>
                  <Select
                    value={localPrefs.codeStyle?.trailingComma}
                    onValueChange={(v) =>
                      handleUpdate({
                        codeStyle: {
                          ...localPrefs.codeStyle,
                          trailingComma: v as "none" | "es5" | "all",
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="es5">ES5</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Semicolons Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Semicolons</Label>
                  <p className="text-xs text-muted-foreground">
                    Add semicolons at the end of statements
                  </p>
                </div>
                <Switch
                  checked={localPrefs.codeStyle?.semicolons}
                  onCheckedChange={(v) =>
                    handleUpdate({
                      codeStyle: { ...localPrefs.codeStyle, semicolons: v },
                    })
                  }
                />
              </div>

              {/* Line Width */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Line Width</Label>
                  <span className="text-sm text-muted-foreground">
                    {localPrefs.codeStyle?.lineWidth || 80} characters
                  </span>
                </div>
                <Slider
                  value={[localPrefs.codeStyle?.lineWidth || 80]}
                  onValueChange={([v]) =>
                    handleUpdate({
                      codeStyle: { ...localPrefs.codeStyle, lineWidth: v },
                    })
                  }
                  min={40}
                  max={120}
                  step={10}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>40</span>
                  <span>80</span>
                  <span>120</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Channels</CardTitle>
              <CardDescription>
                Choose how you want to be notified
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "email", label: "Email", desc: "Receive email notifications" },
                { key: "push", label: "Push", desc: "Browser push notifications" },
                { key: "desktop", label: "Desktop", desc: "Desktop notifications" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{label}</Label>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={
                      (localPrefs.notificationPrefs as any)?.[key] ?? true
                    }
                    onCheckedChange={(v) =>
                      handleUpdate({
                        notificationPrefs: {
                          ...localPrefs.notificationPrefs,
                          [key]: v,
                        },
                      })
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Event Notifications</CardTitle>
              <CardDescription>
                What events should trigger notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "taskComplete", label: "Task Completed" },
                { key: "scanComplete", label: "Scan Completed" },
                { key: "prMerged", label: "PR Merged" },
                { key: "reviewRequested", label: "Review Requested" },
                { key: "mentionedInComment", label: "Mentioned in Comment" },
                { key: "dailyDigest", label: "Daily Digest" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <Switch
                    checked={
                      (localPrefs.notificationPrefs as any)?.[key] ?? true
                    }
                    onCheckedChange={(v) =>
                      handleUpdate({
                        notificationPrefs: {
                          ...localPrefs.notificationPrefs,
                          [key]: v,
                        },
                      })
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quiet Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Moon className="h-4 w-4" />
                Quiet Hours
              </CardTitle>
              <CardDescription>
                Suppress notifications during these hours
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={localPrefs.quietHoursStart || ""}
                    onChange={(e) =>
                      handleUpdate({
                        quietHoursStart: e.target.value || null,
                      })
                    }
                    placeholder="22:00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={localPrefs.quietHoursEnd || ""}
                    onChange={(e) =>
                      handleUpdate({
                        quietHoursEnd: e.target.value || null,
                      })
                    }
                    placeholder="08:00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Timezone
                </Label>
                <Select
                  value={localPrefs.timezone}
                  onValueChange={(v) => handleUpdate({ timezone: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* UI Preferences Tab */}
        <TabsContent value="ui" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interface Density</CardTitle>
              <CardDescription>
                Adjust spacing and visual density
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {(["compact", "comfortable", "spacious"] as const).map(
                  (density) => {
                    const isSelected = localPrefs.uiDensity === density;
                    return (
                      <button
                        key={density}
                        onClick={() => handleUpdate({ uiDensity: density })}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:bg-muted/50",
                          isSelected
                            ? "border-primary bg-muted/30"
                            : "border-transparent bg-muted/10"
                        )}
                      >
                        <div
                          className={cn(
                            "flex flex-col gap-0.5",
                            density === "compact" && "gap-0",
                            density === "spacious" && "gap-1"
                          )}
                        >
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={cn(
                                "rounded bg-muted-foreground/30",
                                density === "compact" && "h-1 w-12",
                                density === "comfortable" && "h-1.5 w-14",
                                density === "spacious" && "h-2 w-16"
                              )}
                            />
                          ))}
                        </div>
                        <span
                          className={cn(
                            "text-sm font-medium capitalize",
                            isSelected
                              ? "text-primary"
                              : "text-muted-foreground"
                          )}
                        >
                          {density}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">
              Auto-detected patterns from your usage
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refreshInsights()}
              disabled={isLoadingInsights}
            >
              {isLoadingInsights ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>

          {isLoadingInsights ? (
            <InsightsSkeleton />
          ) : insights ? (
            <>
              {/* Productivity Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Productivity Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Most Productive Day
                      </p>
                      <p className="text-lg font-semibold">
                        {insights.productivity.mostProductiveDay}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Avg Tasks/Day
                      </p>
                      <p className="text-lg font-semibold">
                        {insights.productivity.avgTasksPerDay}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Avg Session
                      </p>
                      <p className="text-lg font-semibold">
                        {insights.productivity.avgSessionLength}m
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        Code Consistency
                      </p>
                      <p className="text-lg font-semibold">
                        {insights.patterns.codeStyleConsistency}%
                      </p>
                    </div>
                  </div>

                  {/* Peak Hours */}
                  {insights.productivity.peakHours.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Peak Activity Hours
                      </p>
                      <div className="flex gap-1">
                        {Array.from({ length: 24 }, (_, i) => {
                          const peak = insights.productivity.peakHours.find(
                            (p) => p.hour === i
                          );
                          const maxActivity = Math.max(
                            ...insights.productivity.peakHours.map(
                              (p) => p.activity
                            )
                          );
                          const intensity = peak
                            ? peak.activity / maxActivity
                            : 0;
                          return (
                            <div
                              key={i}
                              className="flex-1 h-8 rounded-sm transition-colors"
                              style={{
                                backgroundColor:
                                  intensity > 0
                                    ? `hsl(var(--primary) / ${intensity})`
                                    : "hsl(var(--muted))",
                              }}
                              title={`${i}:00 - ${peak?.activity || 0} activities`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>12am</span>
                        <span>6am</span>
                        <span>12pm</span>
                        <span>6pm</span>
                        <span>12am</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Preferences Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Detected Preferences
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Top Languages */}
                  {insights.preferences.topLanguages.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Top Languages</p>
                      <div className="flex flex-wrap gap-2">
                        {insights.preferences.topLanguages.map((lang) => (
                          <Badge key={lang.language} variant="secondary">
                            {lang.language} ({lang.percentage}%)
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Tools */}
                  {insights.preferences.topTools.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Most Used Tools</p>
                      <div className="flex flex-wrap gap-2">
                        {insights.preferences.topTools.map((tool) => (
                          <Badge key={tool.tool} variant="outline">
                            {tool.tool} ({tool.usageCount})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preferred Task Types */}
                  {insights.preferences.preferredTaskTypes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Preferred Task Types</p>
                      <div className="flex flex-wrap gap-2">
                        {insights.preferences.preferredTaskTypes.map((type) => (
                          <Badge key={type.type} variant="outline">
                            {type.type} ({type.count})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recommendations Card */}
              {insights.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {insights.recommendations.map((rec, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No insights available yet.</p>
                <p className="text-sm">
                  Keep using the app to generate personalization insights.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Reset Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Skeletons
// =============================================================================

function PersonalizationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export default PersonalizationSettings;
