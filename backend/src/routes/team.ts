import type { FastifyPluginAsync } from "fastify";
import { teamActivityService } from "../services/team-activity.js";

export const teamRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook("preHandler", (app as any).requireAuth);

  /**
   * GET /api/team/activity - Get team activity feed
   */
  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      userId?: string;
      type?: string;
      since?: string;
    };
  }>("/activity", async (request) => {
    const { limit, offset, userId, type, since } = request.query;

    const activities = await teamActivityService.getActivityFeed({
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      userId,
      type,
      since: since ? new Date(since) : undefined,
    });

    return {
      data: activities.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });

  /**
   * GET /api/team/members - Get team members with status
   */
  app.get("/members", async (request) => {
    try {
      const members = await teamActivityService.getTeamMembers();

      // Ensure the current user is in the list (for single-user systems)
      const currentUserId = request.userId;
      const currentUserInList = members.some((m) => m.id === currentUserId);

      if (!currentUserInList && currentUserId) {
        // Fetch current user and add them
        const { prisma } = await import("../db.js");
        const currentUser = await prisma.user.findUnique({
          where: { id: currentUserId },
          include: {
            presence: true,
            tasks: {
              select: {
                status: true,
                completedAt: true,
              },
            },
          },
        });

        if (currentUser) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const taskCount = currentUser.tasks.filter(
            (t) => t.status === "pending" || t.status === "in_progress"
          ).length;
          const completedToday = currentUser.tasks.filter(
            (t) =>
              t.status === "completed" &&
              t.completedAt &&
              t.completedAt >= todayStart
          ).length;

          members.unshift({
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            avatarUrl: currentUser.avatarUrl,
            isOnline: true, // Current user is always "online"
            currentActivity: currentUser.presence?.currentActivity ?? null,
            currentEntityId: null,
            currentEntityType: null,
            lastActivityAt: currentUser.presence?.lastActivityAt ?? new Date(),
            taskCount,
            completedToday,
          });
        }
      } else if (members.length > 0) {
        // Mark current user as online
        const currentUserMember = members.find((m) => m.id === currentUserId);
        if (currentUserMember) {
          currentUserMember.isOnline = true;
        }
      }

      return {
        data: members.map((m) => ({
          ...m,
          lastActivityAt: m.lastActivityAt instanceof Date
            ? m.lastActivityAt.toISOString()
            : m.lastActivityAt ?? null,
        })),
      };
    } catch (error) {
      console.error("Error fetching team members:", error);
      throw error;
    }
  });

  /**
   * GET /api/team/workload - Get workload distribution
   */
  app.get("/workload", async (request) => {
    try {
      const workload = await teamActivityService.getWorkloadDistribution();

      // Ensure the current user is in the list
      const currentUserId = request.userId;
      const currentUserInList = workload.some((w) => w.userId === currentUserId);

      if (!currentUserInList && currentUserId) {
        const { prisma } = await import("../db.js");
        const currentUser = await prisma.user.findUnique({
          where: { id: currentUserId },
          include: {
            tasks: {
              select: {
                status: true,
                createdAt: true,
                completedAt: true,
              },
            },
          },
        });

        if (currentUser) {
          const tasks = currentUser.tasks;
          const pending = tasks.filter((t) => t.status === "pending").length;
          const inProgress = tasks.filter((t) => t.status === "in_progress").length;
          const completed = tasks.filter((t) => t.status === "completed").length;
          const failed = tasks.filter((t) => t.status === "failed").length;

          workload.unshift({
            userId: currentUser.id,
            userName: currentUser.name,
            userAvatar: currentUser.avatarUrl,
            pending,
            inProgress,
            completed,
            failed,
            total: pending + inProgress + completed + failed,
            avgCompletionTime: null,
          });
        }
      }

      return {
        data: workload,
      };
    } catch (error) {
      console.error("Error fetching workload:", error);
      throw error;
    }
  });

  /**
   * GET /api/team/collaboration - Get collaboration suggestions
   */
  app.get("/collaboration", async () => {
    const suggestions = await teamActivityService.getCollaborationSuggestions();

    return {
      data: suggestions,
    };
  });

  /**
   * POST /api/team/ping/:userId - Ping a team member
   */
  app.post<{
    Params: { userId: string };
    Body: { message?: string };
  }>("/ping/:userId", async (request) => {
    const { userId: toUserId } = request.params;
    const { message } = request.body || {};

    const result = await teamActivityService.sendPing(
      request.userId,
      toUserId,
      message
    );

    return {
      success: true,
      data: result,
    };
  });

  /**
   * GET /api/team/pings - Get unread pings for current user
   */
  app.get("/pings", async (request) => {
    const pings = await teamActivityService.getUnreadPings(request.userId);

    return {
      data: pings.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  });

  /**
   * POST /api/team/pings/:pingId/read - Mark a ping as read
   */
  app.post<{
    Params: { pingId: string };
  }>("/pings/:pingId/read", async (request) => {
    const { pingId } = request.params;

    await teamActivityService.markPingRead(pingId, request.userId);

    return {
      success: true,
    };
  });

  /**
   * GET /api/team/stats - Get activity stats
   */
  app.get<{
    Querystring: { since?: string };
  }>("/stats", async (request) => {
    const { since } = request.query;
    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to last 24 hours

    const stats = await teamActivityService.getActivityStats(sinceDate);

    return {
      data: stats,
    };
  });

  /**
   * POST /api/team/track - Track an activity (for manual tracking)
   */
  app.post<{
    Body: {
      type: string;
      entityId?: string;
      entityType?: string;
      metadata?: Record<string, unknown>;
    };
  }>("/track", async (request) => {
    const { type, entityId, entityType, metadata } = request.body;

    await teamActivityService.trackActivity(
      request.userId,
      type as any,
      entityId,
      entityType,
      metadata
    );

    return {
      success: true,
    };
  });
};
