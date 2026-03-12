import type { FastifyPluginAsync } from "fastify";
import { notificationService } from "../services/notifications.js";
import type { NotificationType as PrismaNotificationType } from "../../generated/prisma/index.js";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // Get user notifications with pagination
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      unreadOnly?: string;
      type?: PrismaNotificationType;
    };
  }>("/", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const page = parseInt(request.query.page || "1");
    const limit = Math.min(parseInt(request.query.limit || "20"), 100);
    const unreadOnly = request.query.unreadOnly === "true";
    const type = request.query.type;

    const result = await notificationService.getForUser(request.userId, {
      page,
      limit,
      unreadOnly,
      type,
    });

    return { data: result };
  });

  // Get unread count
  app.get("/unread-count", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const count = await notificationService.getUnreadCount(request.userId);
    return { data: { count } };
  });

  // Mark a notification as read
  app.put<{ Params: { id: string } }>("/:id/read", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const success = await notificationService.markAsRead(
      request.params.id,
      request.userId
    );

    if (!success) {
      return reply.code(404).send({ error: { message: "Notification not found" } });
    }

    return { data: { success: true } };
  });

  // Mark all notifications as read
  app.put("/read-all", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const count = await notificationService.markAllAsRead(request.userId);
    return { data: { count } };
  });

  // Delete a notification
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const success = await notificationService.delete(
      request.params.id,
      request.userId
    );

    if (!success) {
      return reply.code(404).send({ error: { message: "Notification not found" } });
    }

    return { data: { success: true } };
  });

  // Delete all notifications
  app.delete("/", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const count = await notificationService.deleteAll(request.userId);
    return { data: { count } };
  });

  // Subscribe to push notifications
  app.post<{
    Body: {
      subscription: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
    };
  }>("/subscribe", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const { subscription } = request.body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return reply.code(400).send({ error: { message: "Invalid subscription object" } });
    }

    const result = await notificationService.subscribeToPush(
      request.userId,
      subscription
    );

    return { data: result };
  });

  // Unsubscribe from push notifications
  app.post<{
    Body: { endpoint: string };
  }>("/unsubscribe", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const { endpoint } = request.body;

    if (!endpoint) {
      return reply.code(400).send({ error: { message: "Endpoint is required" } });
    }

    const success = await notificationService.unsubscribeFromPush(
      request.userId,
      endpoint
    );

    return { data: { success } };
  });

  // Get VAPID public key for client
  app.get("/vapid-key", async (_request, reply) => {
    const publicKey = notificationService.getVapidPublicKey();

    if (!publicKey) {
      return reply.code(404).send({ error: { message: "Push notifications not configured" } });
    }

    return { data: { publicKey } };
  });

  // Get notification preferences
  app.get("/preferences", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const prefs = await notificationService.getPreferences(request.userId);
    return { data: prefs };
  });

  // Update notification preferences
  app.put<{
    Body: {
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
    };
  }>("/preferences", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const prefs = await notificationService.updatePreferences(
      request.userId,
      request.body
    );

    return { data: prefs };
  });
};
