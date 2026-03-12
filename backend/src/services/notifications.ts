import { prisma } from "../db.js";
import { connectionManager } from "../websocket/connection-manager.js";
import webpush from "web-push";
import { config } from "../config.js";
import type { NotificationType as PrismaNotificationType } from "../../generated/prisma/index.js";

// Types for notification data
export interface NotificationData {
  taskId?: string;
  scanId?: string;
  repoId?: string;
  projectId?: string;
  prUrl?: string;
  alertId?: string;
  [key: string]: unknown;
}

export interface CreateNotificationInput {
  userId: string;
  type: PrismaNotificationType;
  title: string;
  message: string;
  data?: NotificationData;
}

export interface BatchNotificationInput {
  userIds: string[];
  type: PrismaNotificationType;
  title: string;
  message: string;
  data?: NotificationData;
}

// Initialize web-push with VAPID keys (if configured)
const vapidConfigured =
  config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject;

if (vapidConfigured) {
  webpush.setVapidDetails(
    config.vapidSubject!,
    config.vapidPublicKey!,
    config.vapidPrivateKey!
  );
}

/**
 * Map notification type to preference field
 */
function getPreferenceField(type: PrismaNotificationType): string {
  const map: Record<PrismaNotificationType, string> = {
    task_complete: "taskComplete",
    task_failed: "taskFailed",
    scan_done: "scanDone",
    scan_failed: "scanFailed",
    mention: "mentions",
    alert: "alerts",
    system: "systemNotifications",
    dependency_alert: "dependencyAlerts",
    pr_status: "prStatus",
  };
  return map[type] || "alerts";
}

/**
 * Check if user is in quiet hours
 */
function isInQuietHours(
  quietHoursEnabled: boolean,
  quietHoursStart: string | null,
  quietHoursEnd: string | null
): boolean {
  if (!quietHoursEnabled || !quietHoursStart || !quietHoursEnd) {
    return false;
  }

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Handle overnight quiet hours (e.g., 22:00 to 07:00)
  if (quietHoursStart > quietHoursEnd) {
    return currentTime >= quietHoursStart || currentTime < quietHoursEnd;
  }

  return currentTime >= quietHoursStart && currentTime < quietHoursEnd;
}

/**
 * Check user preferences and determine which channels to use
 */
async function checkUserPreferences(
  userId: string,
  type: PrismaNotificationType
): Promise<{
  inApp: boolean;
  push: boolean;
  email: boolean;
}> {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  // Default preferences if none set
  if (!prefs) {
    return { inApp: true, push: true, email: false };
  }

  // Check quiet hours
  if (isInQuietHours(prefs.quietHoursEnabled, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    // During quiet hours, only in-app notifications are allowed
    return { inApp: prefs.inAppEnabled, push: false, email: false };
  }

  // Check type-specific preferences
  const prefField = getPreferenceField(type);
  const typeEnabled = (prefs as any)[prefField] ?? true;

  if (!typeEnabled) {
    return { inApp: false, push: false, email: false };
  }

  return {
    inApp: prefs.inAppEnabled,
    push: prefs.pushEnabled,
    email: prefs.emailEnabled,
  };
}

/**
 * Send a push notification via Web Push API
 */
async function sendPushNotification(
  userId: string,
  title: string,
  message: string,
  data?: NotificationData
): Promise<void> {
  if (!vapidConfigured) {
    console.log("[Push] VAPID not configured, skipping push notification");
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    title,
    body: message,
    icon: "/logo.png",
    badge: "/badge.png",
    data: {
      url: data?.taskId
        ? `/tasks/${data.taskId}`
        : data?.scanId
          ? `/scans/${data.scanId}`
          : "/notifications",
      ...data,
    },
  });

  const failedSubscriptions: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys as { p256dh: string; auth: string },
          },
          payload
        );
      } catch (error: any) {
        console.error(`[Push] Failed to send to ${sub.id}:`, error.message);
        // Mark subscription for cleanup if it's no longer valid
        if (error.statusCode === 410 || error.statusCode === 404) {
          failedSubscriptions.push(sub.id);
        }
      }
    })
  );

  // Clean up invalid subscriptions
  if (failedSubscriptions.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: failedSubscriptions } },
    });
  }
}

/**
 * Send email notification (placeholder - logs to console)
 */
async function sendEmailNotification(
  userId: string,
  title: string,
  message: string,
  _data?: NotificationData
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) return;

  // For now, just log the email. In production, integrate with email service.
  console.log(`[Email] Would send email to ${user.email}:`);
  console.log(`  Subject: ${title}`);
  console.log(`  Body: ${message}`);

  // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
  // await emailService.send({
  //   to: user.email,
  //   subject: title,
  //   text: message,
  // });
}

/**
 * Broadcast notification via WebSocket for real-time updates
 */
function broadcastNotification(
  userId: string,
  notification: {
    id: string;
    type: PrismaNotificationType;
    title: string;
    message: string;
    data: NotificationData | null;
    read: boolean;
    createdAt: Date;
  }
): void {
  connectionManager.broadcastToUser(userId, {
    type: "notification:new",
    payload: {
      ...notification,
      createdAt: notification.createdAt.toISOString(),
    },
  });
}

/**
 * Notification service for creating and sending notifications
 */
export const notificationService = {
  /**
   * Create and send a notification to a single user
   */
  async create(input: CreateNotificationInput): Promise<{
    id: string;
    type: PrismaNotificationType;
    title: string;
    message: string;
    data: NotificationData | null;
    read: boolean;
    createdAt: Date;
  } | null> {
    const { userId, type, title, message, data } = input;

    // Check user preferences
    const channels = await checkUserPreferences(userId, type);

    // If no channels enabled for this notification type, skip
    if (!channels.inApp && !channels.push && !channels.email) {
      return null;
    }

    let notification = null;

    // Create in-app notification if enabled
    if (channels.inApp) {
      notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data: data || undefined,
        },
      });

      // Broadcast via WebSocket for real-time updates
      broadcastNotification(userId, {
        ...notification,
        data: (notification.data as NotificationData) || null,
      });
    }

    // Send push notification if enabled
    if (channels.push) {
      await sendPushNotification(userId, title, message, data);
    }

    // Send email notification if enabled
    if (channels.email) {
      await sendEmailNotification(userId, title, message, data);
    }

    return notification
      ? {
          ...notification,
          data: (notification.data as NotificationData) || null,
        }
      : null;
  },

  /**
   * Create notifications for multiple users (batch)
   */
  async createBatch(input: BatchNotificationInput): Promise<number> {
    const { userIds, type, title, message, data } = input;

    let created = 0;

    // Process in parallel but with some batching to avoid overwhelming the system
    const batchSize = 50;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (userId) => {
          const result = await this.create({
            userId,
            type,
            title,
            message,
            data,
          });
          if (result) created++;
        })
      );
    }

    return created;
  },

  /**
   * Get notifications for a user with pagination
   */
  async getForUser(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
      type?: PrismaNotificationType;
    } = {}
  ) {
    const { page = 1, limit = 20, unreadOnly = false, type } = options;

    const where = {
      userId,
      ...(unreadOnly && { read: false }),
      ...(type && { type }),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      notifications: notifications.map((n) => ({
        ...n,
        data: n.data as NotificationData | null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, read: false },
    });
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });

    if (result.count > 0) {
      // Broadcast count update
      const unreadCount = await this.getUnreadCount(userId);
      connectionManager.broadcastToUser(userId, {
        type: "notification:countUpdate",
        payload: { unreadCount },
      });
    }

    return result.count > 0;
  },

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    // Broadcast count update
    connectionManager.broadcastToUser(userId, {
      type: "notification:countUpdate",
      payload: { unreadCount: 0 },
    });

    return result.count;
  },

  /**
   * Delete a notification
   */
  async delete(notificationId: string, userId: string): Promise<boolean> {
    const result = await prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });

    if (result.count > 0) {
      // Broadcast count update
      const unreadCount = await this.getUnreadCount(userId);
      connectionManager.broadcastToUser(userId, {
        type: "notification:countUpdate",
        payload: { unreadCount },
      });
    }

    return result.count > 0;
  },

  /**
   * Delete all notifications for a user
   */
  async deleteAll(userId: string): Promise<number> {
    const result = await prisma.notification.deleteMany({
      where: { userId },
    });

    // Broadcast count update
    connectionManager.broadcastToUser(userId, {
      type: "notification:countUpdate",
      payload: { unreadCount: 0 },
    });

    return result.count;
  },

  /**
   * Subscribe to push notifications
   */
  async subscribeToPush(
    userId: string,
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }
  ): Promise<{ id: string }> {
    const result = await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId,
          endpoint: subscription.endpoint,
        },
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      update: {
        keys: subscription.keys,
      },
    });

    return { id: result.id };
  },

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribeFromPush(userId: string, endpoint: string): Promise<boolean> {
    const result = await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return result.count > 0;
  },

  /**
   * Get or create notification preferences for a user
   */
  async getPreferences(userId: string) {
    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: { userId },
      });
    }

    return prefs;
  },

  /**
   * Update notification preferences
   */
  async updatePreferences(
    userId: string,
    updates: {
      inAppEnabled?: boolean;
      pushEnabled?: boolean;
      emailEnabled?: boolean;
      taskComplete?: boolean;
      taskFailed?: boolean;
      scanDone?: boolean;
      scanFailed?: boolean;
      mentions?: boolean;
      alerts?: boolean;
      systemNotifications?: boolean;
      dependencyAlerts?: boolean;
      prStatus?: boolean;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
    }
  ) {
    return prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...updates },
      update: updates,
    });
  },

  /**
   * Get VAPID public key for client subscription
   */
  getVapidPublicKey(): string | null {
    return config.vapidPublicKey || null;
  },

  /**
   * Helper: Notify when a task completes
   */
  async notifyTaskComplete(
    userId: string,
    taskId: string,
    taskTitle: string
  ): Promise<void> {
    await this.create({
      userId,
      type: "task_complete",
      title: "Task Completed",
      message: `"${taskTitle}" has been completed successfully.`,
      data: { taskId },
    });
  },

  /**
   * Helper: Notify when a task fails
   */
  async notifyTaskFailed(
    userId: string,
    taskId: string,
    taskTitle: string,
    error?: string
  ): Promise<void> {
    await this.create({
      userId,
      type: "task_failed",
      title: "Task Failed",
      message: `"${taskTitle}" has failed.${error ? ` Error: ${error}` : ""}`,
      data: { taskId },
    });
  },

  /**
   * Helper: Notify when a scan completes
   */
  async notifyScanComplete(
    userId: string,
    scanId: string,
    repoName: string,
    tasksFound: number
  ): Promise<void> {
    await this.create({
      userId,
      type: "scan_done",
      title: "Scan Complete",
      message: `Scan of "${repoName}" found ${tasksFound} potential improvement${tasksFound !== 1 ? "s" : ""}.`,
      data: { scanId },
    });
  },

  /**
   * Helper: Notify when a scan fails
   */
  async notifyScanFailed(
    userId: string,
    scanId: string,
    repoName: string,
    error?: string
  ): Promise<void> {
    await this.create({
      userId,
      type: "scan_failed",
      title: "Scan Failed",
      message: `Scan of "${repoName}" has failed.${error ? ` Error: ${error}` : ""}`,
      data: { scanId },
    });
  },

  /**
   * Helper: Notify about a dependency alert
   */
  async notifyDependencyAlert(
    userId: string,
    alertId: string,
    packageName: string,
    severity: string
  ): Promise<void> {
    await this.create({
      userId,
      type: "dependency_alert",
      title: `${severity.toUpperCase()} Vulnerability`,
      message: `A ${severity} vulnerability was found in "${packageName}".`,
      data: { alertId },
    });
  },

  /**
   * Helper: Notify about PR status change
   */
  async notifyPRStatus(
    userId: string,
    taskId: string,
    prUrl: string,
    status: string
  ): Promise<void> {
    await this.create({
      userId,
      type: "pr_status",
      title: "PR Status Update",
      message: `Pull request status changed to: ${status}`,
      data: { taskId, prUrl },
    });
  },

  /**
   * Helper: Send a system notification
   */
  async notifySystem(
    userId: string,
    title: string,
    message: string
  ): Promise<void> {
    await this.create({
      userId,
      type: "system",
      title,
      message,
    });
  },
};
