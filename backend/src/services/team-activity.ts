import { prisma } from "../db.js";
import { connectionManager } from "../websocket/connection-manager.js";

// Activity types for team coordination
export type TeamActivityType =
  | "task_start"
  | "task_complete"
  | "task_failed"
  | "comment"
  | "review"
  | "scan_start"
  | "scan_complete"
  | "coding"
  | "idle"
  | "viewing"
  | "pr_created"
  | "pr_merged";

// Team member with real-time status
export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  isOnline: boolean;
  currentActivity: string | null;
  currentEntityId: string | null;
  currentEntityType: string | null;
  lastActivityAt: Date | null;
  taskCount: number;
  completedToday: number;
}

// Activity entry in the feed
export interface TeamActivityEntry {
  id: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  type: string;
  entityId: string | null;
  entityType: string | null;
  entityTitle: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// Workload distribution data
export interface WorkloadData {
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  total: number;
  avgCompletionTime: number | null; // in hours
}

// Collaboration suggestion
export interface CollaborationSuggestion {
  type: "pair" | "review" | "handoff" | "sync";
  users: Array<{ id: string; name: string | null; avatarUrl: string | null }>;
  reason: string;
  entityId: string | null;
  entityType: string | null;
  priority: "low" | "medium" | "high";
}

class TeamActivityService {
  /**
   * Track a team member's activity
   */
  async trackActivity(
    userId: string,
    type: TeamActivityType,
    entityId?: string,
    entityType?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Create activity record
    const activity = await prisma.teamActivity.create({
      data: {
        userId,
        type,
        entityId,
        entityType,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Get user info from the included relation
    const activityUser = (activity as any).user;

    // Update user presence with current activity
    await prisma.userPresence.upsert({
      where: { userId },
      create: {
        userId,
        isOnline: true,
        currentActivity: type,
        activityMeta: JSON.parse(JSON.stringify({
          entityId,
          entityType,
          ...metadata,
        })),
        lastActivityAt: new Date(),
        lastSeenAt: new Date(),
      },
      update: {
        currentActivity: type,
        activityMeta: JSON.parse(JSON.stringify({
          entityId,
          entityType,
          ...metadata,
        })),
        lastActivityAt: new Date(),
      },
    });

    // Broadcast to all connected clients
    connectionManager.broadcast("team", {
      type: "team:activity",
      payload: {
        id: activity.id,
        userId: activity.userId,
        userName: activityUser?.name ?? null,
        userAvatar: activityUser?.avatarUrl ?? null,
        activityType: activity.type,
        entityId: activity.entityId,
        entityType: activity.entityType,
        metadata: activity.metadata,
        createdAt: activity.createdAt.toISOString(),
      },
    });
  }

  /**
   * Get activity feed for the team
   */
  async getActivityFeed(
    options: {
      limit?: number;
      offset?: number;
      userId?: string;
      type?: string;
      since?: Date;
    } = {}
  ): Promise<TeamActivityEntry[]> {
    const { limit = 50, offset = 0, userId, type, since } = options;

    const activities = await prisma.teamActivity.findMany({
      where: {
        ...(userId && { userId }),
        ...(type && { type }),
        ...(since && { createdAt: { gte: since } }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    // Enrich with entity titles
    const enrichedActivities = await Promise.all(
      activities.map(async (activity) => {
        let entityTitle: string | null = null;

        if (activity.entityId && activity.entityType === "task") {
          const task = await prisma.task.findUnique({
            where: { id: activity.entityId },
            select: { title: true },
          });
          entityTitle = task?.title ?? null;
        } else if (activity.entityId && activity.entityType === "scan") {
          const scan = await prisma.scanResult.findUnique({
            where: { id: activity.entityId },
            select: { id: true },
          });
          entityTitle = scan ? `Scan ${scan.id.slice(0, 8)}` : null;
        }

        return {
          id: activity.id,
          userId: activity.userId,
          userName: activity.user.name,
          userAvatar: activity.user.avatarUrl,
          type: activity.type,
          entityId: activity.entityId,
          entityType: activity.entityType,
          entityTitle,
          metadata: activity.metadata as Record<string, unknown> | null,
          createdAt: activity.createdAt,
        };
      })
    );

    return enrichedActivities;
  }

  /**
   * Get all team members with their current status
   */
  async getTeamMembers(): Promise<TeamMember[]> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Get all users with presence info
      const users = await prisma.user.findMany({
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

      // Get online users from WebSocket connection manager
      let onlineUserIds: string[] = [];
      try {
        onlineUserIds = connectionManager.getOnlineUsers();
      } catch (e) {
        // WebSocket manager might not be initialized
        console.warn("Could not get online users from connection manager:", e);
      }

      return users.map((user) => {
        const presence = user.presence;
        const isOnline = onlineUserIds.includes(user.id);
        const isActive =
          presence?.lastActivityAt &&
          presence.lastActivityAt >= fiveMinutesAgo;

        // Count tasks
        const taskCount = (user.tasks || []).filter(
          (t) => t.status === "pending" || t.status === "in_progress"
        ).length;
        const completedToday = (user.tasks || []).filter(
          (t) =>
            t.status === "completed" &&
            t.completedAt &&
            t.completedAt >= todayStart
        ).length;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          isOnline,
          currentActivity: isActive ? (presence?.currentActivity ?? null) : null,
          currentEntityId: isActive
            ? ((presence?.activityMeta as Record<string, unknown>)?.entityId as string) ?? null
            : null,
          currentEntityType: isActive
            ? ((presence?.activityMeta as Record<string, unknown>)?.entityType as string) ?? null
            : null,
          lastActivityAt: presence?.lastActivityAt ?? null,
          taskCount,
          completedToday,
        };
      });
    } catch (error) {
      console.error("Error in getTeamMembers:", error);
      return [];
    }
  }

  /**
   * Get workload distribution across the team
   */
  async getWorkloadDistribution(): Promise<WorkloadData[]> {
    const users = await prisma.user.findMany({
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

    return users.map((user) => {
      const tasks = user.tasks;

      const pending = tasks.filter((t) => t.status === "pending").length;
      const inProgress = tasks.filter((t) => t.status === "in_progress").length;
      const completed = tasks.filter((t) => t.status === "completed").length;
      const failed = tasks.filter((t) => t.status === "failed").length;

      // Calculate average completion time for completed tasks
      const completedTasks = tasks.filter(
        (t) => t.status === "completed" && t.completedAt
      );
      let avgCompletionTime: number | null = null;

      if (completedTasks.length > 0) {
        const totalTime = completedTasks.reduce((sum, t) => {
          const duration =
            (t.completedAt!.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
          return sum + duration;
        }, 0);
        avgCompletionTime = totalTime / completedTasks.length;
      }

      return {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatarUrl,
        pending,
        inProgress,
        completed,
        failed,
        total: pending + inProgress + completed + failed,
        avgCompletionTime,
      };
    });
  }

  /**
   * Generate collaboration suggestions based on activity patterns
   */
  async getCollaborationSuggestions(): Promise<CollaborationSuggestion[]> {
    const suggestions: CollaborationSuggestion[] = [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get recent activities
    const recentActivities = await prisma.teamActivity.findMany({
      where: {
        createdAt: { gte: oneHourAgo },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Find users working on related files/tasks (potential pairing)
    const userEntityMap = new Map<string, Set<string>>();
    for (const activity of recentActivities) {
      if (activity.entityId) {
        if (!userEntityMap.has(activity.entityId)) {
          userEntityMap.set(activity.entityId, new Set());
        }
        userEntityMap.get(activity.entityId)!.add(activity.userId);
      }
    }

    // Suggest pairing for entities with multiple users
    const entityEntries = Array.from(userEntityMap.entries());
    for (const [entityId, userIds] of entityEntries) {
      if (userIds.size >= 2) {
        const users: string[] = Array.from(userIds);
        const activity = recentActivities.find((a) => a.entityId === entityId);

        const userDetails = await prisma.user.findMany({
          where: { id: { in: users } },
          select: { id: true, name: true, avatarUrl: true },
        });

        suggestions.push({
          type: "pair",
          users: userDetails,
          reason: `Multiple team members are working on the same ${activity?.entityType || "item"}`,
          entityId,
          entityType: activity?.entityType ?? null,
          priority: "medium",
        });
      }
    }

    // Find completed tasks that need review
    const completedTasks = await prisma.task.findMany({
      where: {
        status: "completed",
        completedAt: { gte: oneDayAgo },
        pullRequestUrl: { not: null },
      },
      include: {
        user: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
      take: 5,
    });

    // Get potential reviewers (users who haven't worked on these tasks)
    const taskOwnerIds = completedTasks.map((t) => t.userId);
    const potentialReviewers = await prisma.user.findMany({
      where: {
        id: { notIn: taskOwnerIds },
      },
      select: { id: true, name: true, avatarUrl: true },
      take: 3,
    });

    for (const task of completedTasks) {
      if (potentialReviewers.length > 0) {
        suggestions.push({
          type: "review",
          users: [task.user, potentialReviewers[0]],
          reason: `PR needs review: "${task.title}"`,
          entityId: task.id,
          entityType: "task",
          priority: "high",
        });
      }
    }

    // Find overloaded team members who might need help
    const workload = await this.getWorkloadDistribution();
    const avgLoad =
      workload.reduce((sum, w) => sum + w.inProgress, 0) / workload.length;

    for (const member of workload) {
      if (member.inProgress > avgLoad * 1.5 && member.inProgress >= 3) {
        const underloaded = workload.find(
          (w) => w.inProgress < avgLoad * 0.5 && w.userId !== member.userId
        );

        if (underloaded) {
          suggestions.push({
            type: "handoff",
            users: [
              { id: member.userId, name: member.userName, avatarUrl: member.userAvatar },
              { id: underloaded.userId, name: underloaded.userName, avatarUrl: underloaded.userAvatar },
            ],
            reason: `${member.userName || "User"} has ${member.inProgress} tasks in progress. Consider redistributing.`,
            entityId: null,
            entityType: null,
            priority: "medium",
          });
        }
      }
    }

    // Find users who haven't synced recently
    const lastSyncThreshold = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const usersNeedingSync = await prisma.user.findMany({
      where: {
        presence: {
          lastActivityAt: { lt: lastSyncThreshold },
        },
        tasks: {
          some: {
            status: "in_progress",
          },
        },
      },
      select: { id: true, name: true, avatarUrl: true },
      take: 3,
    });

    if (usersNeedingSync.length >= 2) {
      suggestions.push({
        type: "sync",
        users: usersNeedingSync,
        reason: "Team members have been working independently. Consider a sync meeting.",
        entityId: null,
        entityType: null,
        priority: "low",
      });
    }

    return suggestions;
  }

  /**
   * Send a ping to a team member
   */
  async sendPing(
    fromUserId: string,
    toUserId: string,
    message?: string
  ): Promise<{ id: string }> {
    const ping = await prisma.teamPing.create({
      data: {
        fromUserId,
        toUserId,
        message,
      },
      include: {
        fromUser: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    // Broadcast ping to the recipient
    connectionManager.broadcastToUser(toUserId, {
      type: "team:ping",
      payload: {
        id: ping.id,
        fromUserId: ping.fromUserId,
        fromUserName: ping.fromUser.name,
        fromUserAvatar: ping.fromUser.avatarUrl,
        message: ping.message,
        createdAt: ping.createdAt.toISOString(),
      },
    });

    return { id: ping.id };
  }

  /**
   * Get unread pings for a user
   */
  async getUnreadPings(userId: string): Promise<
    Array<{
      id: string;
      fromUserId: string;
      fromUserName: string | null;
      fromUserAvatar: string | null;
      message: string | null;
      createdAt: Date;
    }>
  > {
    const pings = await prisma.teamPing.findMany({
      where: {
        toUserId: userId,
        read: false,
      },
      include: {
        fromUser: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return pings.map((ping) => ({
      id: ping.id,
      fromUserId: ping.fromUserId,
      fromUserName: ping.fromUser.name,
      fromUserAvatar: ping.fromUser.avatarUrl,
      message: ping.message,
      createdAt: ping.createdAt,
    }));
  }

  /**
   * Mark a ping as read
   */
  async markPingRead(pingId: string, userId: string): Promise<void> {
    await prisma.teamPing.updateMany({
      where: {
        id: pingId,
        toUserId: userId,
      },
      data: {
        read: true,
      },
    });
  }

  /**
   * Get aggregated activity stats for a time period
   */
  async getActivityStats(since: Date): Promise<{
    totalActivities: number;
    byType: Record<string, number>;
    byUser: Array<{
      userId: string;
      userName: string | null;
      count: number;
    }>;
    hourlyDistribution: Array<{ hour: number; count: number }>;
  }> {
    const activities = await prisma.teamActivity.findMany({
      where: {
        createdAt: { gte: since },
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    // Aggregate by type
    const byType: Record<string, number> = {};
    for (const activity of activities) {
      byType[activity.type] = (byType[activity.type] || 0) + 1;
    }

    // Aggregate by user
    const userCounts = new Map<string, { name: string | null; count: number }>();
    for (const activity of activities) {
      const existing = userCounts.get(activity.userId);
      if (existing) {
        existing.count++;
      } else {
        userCounts.set(activity.userId, {
          name: activity.user.name,
          count: 1,
        });
      }
    }

    const byUser = Array.from(userCounts.entries()).map(([userId, data]) => ({
      userId,
      userName: data.name,
      count: data.count,
    }));

    // Hourly distribution
    const hourlyMap = new Map<number, number>();
    for (const activity of activities) {
      const hour = activity.createdAt.getHours();
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
    }

    const hourlyDistribution = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourlyMap.get(i) || 0,
    }));

    return {
      totalActivities: activities.length,
      byType,
      byUser,
      hourlyDistribution,
    };
  }
}

export const teamActivityService = new TeamActivityService();
