import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { connectionManager } from "../websocket/connection-manager.js";

// Activity types
type ActivityType =
  | "viewing_task"
  | "viewing_scan"
  | "editing_plan"
  | "viewing_repo"
  | "browsing_tasks"
  | "browsing_scans"
  | "browsing_repos"
  | "viewing_dashboard"
  | "idle";

interface HeartbeatBody {
  currentActivity?: ActivityType;
  activityMeta?: {
    taskId?: string;
    scanId?: string;
    repoId?: string;
    repoName?: string;
    projectId?: string;
    pageName?: string;
  };
}

interface ActiveUser {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  lastActivityAt: Date;
  currentActivity: string | null;
  activityMeta: Record<string, unknown>;
  isOnline: boolean;
}

export const presenceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  /**
   * GET /api/presence/active
   * Returns list of currently active users with their current activity
   */
  app.get<{ Querystring: { includeIdle?: string } }>(
    "/active",
    async (request) => {
      const includeIdle = request.query.includeIdle === "true";

      // Consider users active if they had activity in the last 5 minutes
      const activeThreshold = new Date(Date.now() - 5 * 60 * 1000);

      // Get online users from WebSocket connections
      const onlineUserIds = connectionManager.getOnlineUsers();

      // Query presence records for these users
      const presenceRecords = await prisma.userPresence.findMany({
        where: {
          userId: { in: onlineUserIds },
          ...(includeIdle ? {} : { lastActivityAt: { gte: activeThreshold } }),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { lastActivityAt: "desc" },
      });

      const activeUsers: ActiveUser[] = presenceRecords.map((record) => ({
        id: record.user.id,
        name: record.user.name,
        email: record.user.email,
        avatarUrl: record.user.avatarUrl,
        lastActivityAt: record.lastActivityAt,
        currentActivity: record.currentActivity,
        activityMeta: record.activityMeta as Record<string, unknown>,
        isOnline: record.isOnline,
      }));

      // Also include online users without presence records (just connected)
      const recordedUserIds = new Set(presenceRecords.map((r) => r.userId));
      const onlineWithoutRecords = onlineUserIds.filter(
        (id) => !recordedUserIds.has(id)
      );

      if (onlineWithoutRecords.length > 0) {
        const additionalUsers = await prisma.user.findMany({
          where: { id: { in: onlineWithoutRecords } },
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        });

        for (const user of additionalUsers) {
          activeUsers.push({
            id: user.id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
            lastActivityAt: new Date(),
            currentActivity: "idle",
            activityMeta: {},
            isOnline: true,
          });
        }
      }

      return {
        data: activeUsers,
        onlineCount: onlineUserIds.length,
        activeCount: activeUsers.filter(
          (u) => u.currentActivity && u.currentActivity !== "idle"
        ).length,
      };
    }
  );

  /**
   * POST /api/presence/heartbeat
   * Updates user's last activity timestamp and current activity
   */
  app.post<{ Body: HeartbeatBody }>("/heartbeat", async (request) => {
    const { currentActivity, activityMeta } = request.body ?? {};
    const metaJson = activityMeta ? JSON.parse(JSON.stringify(activityMeta)) : {};

    const presence = await prisma.userPresence.upsert({
      where: { userId: request.userId },
      create: {
        userId: request.userId,
        lastSeenAt: new Date(),
        lastActivityAt: new Date(),
        isOnline: true,
        currentActivity: currentActivity ?? "idle",
        activityMeta: metaJson,
      },
      update: {
        lastSeenAt: new Date(),
        lastActivityAt: new Date(),
        isOnline: true,
        currentActivity: currentActivity ?? undefined,
        activityMeta: metaJson,
      },
    });

    // Get user info separately
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });

    // Broadcast activity pulse to all connected clients
    connectionManager.broadcast("presence", {
      type: "presence:activity",
      payload: {
        userId: request.userId,
        userName: user?.name ?? null,
        avatarUrl: user?.avatarUrl ?? null,
        currentActivity: presence.currentActivity,
        activityMeta: presence.activityMeta,
        lastActivityAt: presence.lastActivityAt.toISOString(),
      },
    });

    return {
      success: true,
      lastActivityAt: presence.lastActivityAt,
    };
  });

  /**
   * POST /api/presence/activity
   * Reports a specific activity (for explicit action tracking)
   */
  app.post<{
    Body: {
      activity: ActivityType;
      meta?: Record<string, unknown>;
    };
  }>("/activity", async (request) => {
    const { activity, meta } = request.body;
    const metaJson = meta ? JSON.parse(JSON.stringify(meta)) : {};

    const presence = await prisma.userPresence.upsert({
      where: { userId: request.userId },
      create: {
        userId: request.userId,
        lastSeenAt: new Date(),
        lastActivityAt: new Date(),
        isOnline: true,
        currentActivity: activity,
        activityMeta: metaJson,
      },
      update: {
        lastActivityAt: new Date(),
        currentActivity: activity,
        activityMeta: metaJson,
      },
    });

    // Get user info separately
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });

    // Broadcast activity pulse to all connected clients
    connectionManager.broadcast("presence", {
      type: "presence:activity",
      payload: {
        userId: request.userId,
        userName: user?.name ?? null,
        avatarUrl: user?.avatarUrl ?? null,
        currentActivity: activity,
        activityMeta: meta ?? {},
        lastActivityAt: presence.lastActivityAt.toISOString(),
      },
    });

    return { success: true };
  });

  /**
   * GET /api/presence/viewers/:resource
   * Gets users currently viewing a specific resource
   */
  app.get<{ Params: { resource: string } }>(
    "/viewers/:resource",
    async (request) => {
      const { resource } = request.params;
      const viewerIds = connectionManager.getResourceViewers(resource);

      if (viewerIds.length === 0) {
        return { data: [], count: 0 };
      }

      const viewers = await prisma.user.findMany({
        where: { id: { in: viewerIds } },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      });

      return { data: viewers, count: viewers.length };
    }
  );
};
