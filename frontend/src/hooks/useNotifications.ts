import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket";

// Types
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: NotificationData | null;
  read: boolean;
  createdAt: string;
}

export type NotificationType =
  | "task_complete"
  | "task_failed"
  | "scan_done"
  | "scan_failed"
  | "mention"
  | "alert"
  | "system"
  | "dependency_alert"
  | "pr_status";

export interface NotificationData {
  taskId?: string;
  scanId?: string;
  repoId?: string;
  projectId?: string;
  prUrl?: string;
  alertId?: string;
  [key: string]: unknown;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  taskComplete: boolean;
  taskFailed: boolean;
  scanDone: boolean;
  scanFailed: boolean;
  mentions: boolean;
  alerts: boolean;
  systemNotifications: boolean;
  dependencyAlerts: boolean;
  prStatus: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

interface NotificationsResponse {
  notifications: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ApiResponse<T> {
  data: T;
}

const BASE = "/api/notifications";

// API functions
async function fetchNotifications(
  page = 1,
  limit = 20,
  unreadOnly = false,
  type?: NotificationType
): Promise<NotificationsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    unreadOnly: String(unreadOnly),
  });
  if (type) params.append("type", type);

  const res = await fetch(`${BASE}?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  const json: ApiResponse<NotificationsResponse> = await res.json();
  return json.data;
}

async function fetchUnreadCount(): Promise<number> {
  const res = await fetch(`${BASE}/unread-count`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch unread count");
  const json: ApiResponse<{ count: number }> = await res.json();
  return json.data.count;
}

async function markAsRead(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}/read`, {
    method: "PUT",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to mark notification as read");
}

async function markAllAsRead(): Promise<number> {
  const res = await fetch(`${BASE}/read-all`, {
    method: "PUT",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to mark all as read");
  const json: ApiResponse<{ count: number }> = await res.json();
  return json.data.count;
}

async function deleteNotification(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete notification");
}

async function deleteAllNotifications(): Promise<number> {
  const res = await fetch(BASE, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete all notifications");
  const json: ApiResponse<{ count: number }> = await res.json();
  return json.data.count;
}

async function fetchPreferences(): Promise<NotificationPreferences> {
  const res = await fetch(`${BASE}/preferences`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch notification preferences");
  const json: ApiResponse<NotificationPreferences> = await res.json();
  return json.data;
}

async function updatePreferences(
  updates: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const res = await fetch(`${BASE}/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update notification preferences");
  const json: ApiResponse<NotificationPreferences> = await res.json();
  return json.data;
}

async function fetchVapidKey(): Promise<string | null> {
  const res = await fetch(`${BASE}/vapid-key`, { credentials: "include" });
  if (!res.ok) return null;
  const json: ApiResponse<{ publicKey: string }> = await res.json();
  return json.data.publicKey;
}

async function subscribeToPush(
  subscription: PushSubscription
): Promise<{ id: string }> {
  const subscriptionJson = subscription.toJSON();
  const res = await fetch(`${BASE}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      subscription: {
        endpoint: subscriptionJson.endpoint,
        keys: subscriptionJson.keys,
      },
    }),
  });
  if (!res.ok) throw new Error("Failed to subscribe to push notifications");
  const json: ApiResponse<{ id: string }> = await res.json();
  return json.data;
}

async function unsubscribeFromPush(endpoint: string): Promise<void> {
  const res = await fetch(`${BASE}/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error("Failed to unsubscribe from push notifications");
}

/**
 * Hook for managing notifications
 */
export function useNotifications(options: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
} = {}) {
  const { page = 1, limit = 20, unreadOnly = false, type } = options;
  const queryClient = useQueryClient();
  const { addMessageHandler } = useWebSocket();

  // Fetch notifications
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["notifications", page, limit, unreadOnly, type],
    queryFn: () => fetchNotifications(page, limit, unreadOnly, type),
  });

  // Listen for real-time updates
  useEffect(() => {
    const unsubscribe = addMessageHandler("notification:new", () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    });

    return unsubscribe;
  }, [addMessageHandler, queryClient]);

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: deleteAllNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });

  return {
    notifications: data?.notifications ?? [],
    pagination: data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 0 },
    isLoading,
    error,
    refetch,
    markAsRead: markReadMutation.mutateAsync,
    markAllAsRead: markAllReadMutation.mutateAsync,
    deleteNotification: deleteMutation.mutateAsync,
    deleteAllNotifications: deleteAllMutation.mutateAsync,
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllReadMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDeletingAll: deleteAllMutation.isPending,
  };
}

/**
 * Hook for unread count only (lightweight)
 */
export function useUnreadCount() {
  const queryClient = useQueryClient();
  const { addMessageHandler } = useWebSocket();

  const { data: count = 0, refetch } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: fetchUnreadCount,
    refetchInterval: 60000, // Refresh every minute
  });

  // Listen for real-time updates
  useEffect(() => {
    const unsubscribeNew = addMessageHandler("notification:new", () => {
      refetch();
    });

    const unsubscribeCount = addMessageHandler(
      "notification:countUpdate",
      (payload: { unreadCount: number }) => {
        queryClient.setQueryData(["notifications", "unread-count"], payload.unreadCount);
      }
    );

    return () => {
      unsubscribeNew();
      unsubscribeCount();
    };
  }, [addMessageHandler, queryClient, refetch]);

  return count;
}

/**
 * Hook for notification preferences
 */
export function useNotificationPreferences() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", "preferences"],
    queryFn: fetchPreferences,
  });

  const updateMutation = useMutation({
    mutationFn: updatePreferences,
    onSuccess: (updated) => {
      queryClient.setQueryData(["notifications", "preferences"], updated);
    },
  });

  return {
    preferences: data,
    isLoading,
    error,
    updatePreferences: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

/**
 * Hook for push notification subscription
 */
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check support and current subscription on mount
  useEffect(() => {
    const checkSupport = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setIsSupported(false);
        setIsLoading(false);
        return;
      }

      setIsSupported(true);

      try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
          setSubscription(existingSubscription);
          setIsSubscribed(true);
        }
      } catch (error) {
        console.error("Error checking push subscription:", error);
      }

      setIsLoading(false);
    };

    checkSupport();
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    const permission = await Notification.requestPermission();
    return permission === "granted";
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      // Request permission first
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return false;
      }

      // Get VAPID public key
      const vapidKey = await fetchVapidKey();
      if (!vapidKey) {
        console.error("Push notifications not configured on server");
        return false;
      }

      // Subscribe
      const registration = await navigator.serviceWorker.ready;
      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Send to server
      await subscribeToPush(newSubscription);

      setSubscription(newSubscription);
      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error("Error subscribing to push notifications:", error);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) return false;

    try {
      // Unsubscribe from browser
      await subscription.unsubscribe();

      // Remove from server
      await unsubscribeFromPush(subscription.endpoint);

      setSubscription(null);
      setIsSubscribed(false);
      return true;
    } catch (error) {
      console.error("Error unsubscribing from push notifications:", error);
      return false;
    }
  }, [subscription]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    requestPermission,
    subscribe,
    unsubscribe,
  };
}

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
