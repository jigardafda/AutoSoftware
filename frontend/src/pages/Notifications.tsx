import { useState } from "react";
import {
  Bell,
  Settings2,
  Trash2,
  Volume2,
  VolumeX,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { NotificationList } from "@/components/notifications/NotificationList";
import {
  useNotifications,
  useNotificationPreferences,
  usePushNotifications,
} from "@/hooks/useNotifications";
import { toast } from "sonner";

export function Notifications() {
  const [activeTab, setActiveTab] = useState("all");

  const { deleteAllNotifications, isDeletingAll } = useNotifications();
  const { preferences, updatePreferences, isUpdating } =
    useNotificationPreferences();
  const {
    isSupported: pushSupported,
    isSubscribed: pushSubscribed,
    subscribe: subscribeToPush,
    unsubscribe: unsubscribeFromPush,
    isLoading: pushLoading,
  } = usePushNotifications();

  const handleClearAll = async () => {
    try {
      const count = await deleteAllNotifications();
      toast.success(`Cleared ${count} notification${count !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Failed to clear notifications");
    }
  };

  const handleTogglePreference = async (
    key: keyof typeof preferences,
    value: boolean
  ) => {
    try {
      await updatePreferences({ [key]: value });
      toast.success("Preferences updated");
    } catch {
      toast.error("Failed to update preferences");
    }
  };

  const handleTogglePush = async () => {
    if (pushSubscribed) {
      const success = await unsubscribeFromPush();
      if (success) {
        toast.success("Push notifications disabled");
      } else {
        toast.error("Failed to disable push notifications");
      }
    } else {
      const success = await subscribeToPush();
      if (success) {
        toast.success("Push notifications enabled");
      } else {
        toast.error("Failed to enable push notifications. Check browser permissions.");
      }
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              Manage your notification preferences and history
            </p>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1.5" />
              Clear All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all your notifications. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearAll}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeletingAll ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1.5" />
                )}
                Clear All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="all" className="gap-2">
            <Bell className="h-4 w-4" />
            All Notifications
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <NotificationList
                maxHeight="calc(100vh - 280px)"
                showPagination
                showFilters
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          {/* Push Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {pushSubscribed ? (
                  <Volume2 className="h-5 w-5 text-green-500" />
                ) : (
                  <VolumeX className="h-5 w-5 text-muted-foreground" />
                )}
                Push Notifications
              </CardTitle>
              <CardDescription>
                Receive notifications even when the browser is closed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!pushSupported ? (
                <p className="text-sm text-muted-foreground">
                  Push notifications are not supported in your browser.
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {pushSubscribed ? "Push notifications enabled" : "Push notifications disabled"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pushSubscribed
                        ? "You will receive desktop notifications"
                        : "Enable to receive desktop notifications"}
                    </p>
                  </div>
                  <Button
                    variant={pushSubscribed ? "outline" : "default"}
                    size="sm"
                    onClick={handleTogglePush}
                    disabled={pushLoading}
                  >
                    {pushLoading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    {pushSubscribed ? "Disable" : "Enable"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notification Channels */}
          <Card>
            <CardHeader>
              <CardTitle>Notification Channels</CardTitle>
              <CardDescription>
                Choose how you want to receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>In-app notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Show notifications in the bell icon
                  </p>
                </div>
                <Switch
                  checked={preferences?.inAppEnabled ?? true}
                  onCheckedChange={(v) => handleTogglePreference("inAppEnabled", v)}
                  disabled={isUpdating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <Switch
                  checked={preferences?.emailEnabled ?? false}
                  onCheckedChange={(v) => handleTogglePreference("emailEnabled", v)}
                  disabled={isUpdating}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notification Types */}
          <Card>
            <CardHeader>
              <CardTitle>Notification Types</CardTitle>
              <CardDescription>
                Choose which types of notifications you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "taskComplete", label: "Task completed", desc: "When a task finishes successfully" },
                { key: "taskFailed", label: "Task failed", desc: "When a task fails or encounters an error" },
                { key: "scanDone", label: "Scan completed", desc: "When a repository scan finishes" },
                { key: "scanFailed", label: "Scan failed", desc: "When a repository scan fails" },
                { key: "mentions", label: "Mentions", desc: "When someone mentions you" },
                { key: "alerts", label: "Alerts", desc: "Important alerts and warnings" },
                { key: "systemNotifications", label: "System notifications", desc: "Updates and announcements" },
                { key: "dependencyAlerts", label: "Dependency alerts", desc: "Security vulnerabilities in dependencies" },
                { key: "prStatus", label: "PR status changes", desc: "When a pull request status changes" },
              ].map((item, index) => (
                <div key={item.key}>
                  {index > 0 && <Separator className="mb-4" />}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{item.label}</Label>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch
                      checked={(preferences as any)?.[item.key] ?? true}
                      onCheckedChange={(v) =>
                        handleTogglePreference(item.key as keyof typeof preferences, v)
                      }
                      disabled={isUpdating}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quiet Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Quiet Hours
              </CardTitle>
              <CardDescription>
                Pause push and email notifications during specified hours
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable quiet hours</Label>
                  <p className="text-xs text-muted-foreground">
                    Only in-app notifications during this time
                  </p>
                </div>
                <Switch
                  checked={preferences?.quietHoursEnabled ?? false}
                  onCheckedChange={(v) => handleTogglePreference("quietHoursEnabled", v)}
                  disabled={isUpdating}
                />
              </div>

              {preferences?.quietHoursEnabled && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quiet-start">Start time</Label>
                      <Input
                        id="quiet-start"
                        type="time"
                        value={preferences.quietHoursStart || "22:00"}
                        onChange={(e) =>
                          updatePreferences({ quietHoursStart: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quiet-end">End time</Label>
                      <Input
                        id="quiet-end"
                        type="time"
                        value={preferences.quietHoursEnd || "07:00"}
                        onChange={(e) =>
                          updatePreferences({ quietHoursEnd: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Notifications;
