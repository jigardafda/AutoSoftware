import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { connectionManager } from "../websocket/connection-manager.js";

// Types for collaborative planning
interface CursorUpdate {
  x: number;
  y: number;
  viewportSection?: string;
}

interface CommentBody {
  content: string;
  approachIdx: number;
  parentId?: string;
  mentions?: string[];
}

interface VoteBody {
  approachIdx: number;
  voteType: "upvote" | "downvote";
}

interface MentionBody {
  taskId: string;
  commentId?: string;
  mentionedUserIds: string[];
  message: string;
}

// Extract mentions from content (e.g., @username or @userId)
function extractMentions(content: string): string[] {
  const mentionPattern = /@(\w+)/g;
  const matches = content.matchAll(mentionPattern);
  return [...matches].map((match) => match[1]);
}

export const collaborationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // ============================================================================
  // Cursor Tracking
  // ============================================================================

  /**
   * POST /api/collaboration/tasks/:taskId/cursor
   * Update user's cursor position in the planning view
   */
  app.post<{
    Params: { taskId: string };
    Body: CursorUpdate;
  }>("/tasks/:taskId/cursor", async (request) => {
    const { taskId } = request.params;
    const { x, y, viewportSection } = request.body;

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { id: true, name: true, avatarUrl: true },
    });

    // Upsert cursor position
    await prisma.planningCursor.upsert({
      where: {
        taskId_userId: {
          taskId,
          userId: request.userId,
        },
      },
      create: {
        taskId,
        userId: request.userId,
        x,
        y,
        viewportSection,
        lastUpdatedAt: new Date(),
      },
      update: {
        x,
        y,
        viewportSection,
        lastUpdatedAt: new Date(),
      },
    });

    // Broadcast cursor update to other viewers
    const resource = `task:${taskId}:planning`;
    connectionManager.broadcast(resource, {
      type: "planning:cursor",
      payload: {
        taskId,
        userId: request.userId,
        userName: user?.name || "Unknown",
        avatarUrl: user?.avatarUrl,
        x,
        y,
        viewportSection,
        timestamp: new Date().toISOString(),
      },
    });

    return { success: true };
  });

  /**
   * GET /api/collaboration/tasks/:taskId/cursors
   * Get all active cursors for a task
   */
  app.get<{ Params: { taskId: string } }>(
    "/tasks/:taskId/cursors",
    async (request) => {
      const { taskId } = request.params;

      // Get cursors updated in the last 30 seconds (active users)
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);

      const cursors = await prisma.planningCursor.findMany({
        where: {
          taskId,
          lastUpdatedAt: { gte: thirtySecondsAgo },
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

      return {
        data: cursors.map((cursor) => ({
          userId: cursor.userId,
          userName: cursor.user.name,
          avatarUrl: cursor.user.avatarUrl,
          x: cursor.x,
          y: cursor.y,
          viewportSection: cursor.viewportSection,
          lastUpdatedAt: cursor.lastUpdatedAt,
        })),
      };
    }
  );

  /**
   * DELETE /api/collaboration/tasks/:taskId/cursor
   * Remove user's cursor (when leaving the planning view)
   */
  app.delete<{ Params: { taskId: string } }>(
    "/tasks/:taskId/cursor",
    async (request) => {
      const { taskId } = request.params;

      await prisma.planningCursor.deleteMany({
        where: {
          taskId,
          userId: request.userId,
        },
      });

      // Broadcast cursor removal
      const resource = `task:${taskId}:planning`;
      connectionManager.broadcast(resource, {
        type: "planning:cursor:leave",
        payload: {
          taskId,
          userId: request.userId,
          timestamp: new Date().toISOString(),
        },
      });

      return { success: true };
    }
  );

  // ============================================================================
  // Comments
  // ============================================================================

  /**
   * GET /api/collaboration/tasks/:taskId/comments
   * Get all comments for a task's approaches
   */
  app.get<{
    Params: { taskId: string };
    Querystring: { approachIdx?: string };
  }>("/tasks/:taskId/comments", async (request) => {
    const { taskId } = request.params;
    const approachIdx = request.query.approachIdx
      ? parseInt(request.query.approachIdx, 10)
      : undefined;

    const comments = await prisma.approachComment.findMany({
      where: {
        taskId,
        ...(approachIdx !== undefined ? { approachIdx } : {}),
        parentId: null, // Top-level comments only
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
        replies: {
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
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { data: comments };
  });

  /**
   * POST /api/collaboration/tasks/:taskId/comments
   * Add a comment to an approach
   */
  app.post<{
    Params: { taskId: string };
    Body: CommentBody;
  }>("/tasks/:taskId/comments", async (request) => {
    const { taskId } = request.params;
    const { content, approachIdx, parentId, mentions } = request.body;

    // Verify task exists
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true },
    });

    if (!task) {
      throw { statusCode: 404, message: "Task not found" };
    }

    // Extract mentions from content if not provided
    const mentionedUsernames = mentions || extractMentions(content);

    // Create the comment
    const comment = await prisma.approachComment.create({
      data: {
        taskId,
        approachIdx,
        userId: request.userId,
        content,
        mentions: mentionedUsernames,
        parentId,
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
    });

    // Create mention notifications
    if (mentionedUsernames.length > 0) {
      // Find users by name or id
      const mentionedUsers = await prisma.user.findMany({
        where: {
          OR: [
            { id: { in: mentionedUsernames } },
            { name: { in: mentionedUsernames } },
          ],
        },
        select: { id: true },
      });

      // Create notifications
      await prisma.mentionNotification.createMany({
        data: mentionedUsers.map((user) => ({
          userId: user.id,
          mentionedBy: request.userId,
          taskId,
          commentId: comment.id,
          message: `mentioned you in a comment on "${task.title}"`,
        })),
      });

      // Send real-time notifications
      for (const user of mentionedUsers) {
        connectionManager.broadcastToUser(user.id, {
          type: "notification:mention",
          payload: {
            commentId: comment.id,
            taskId,
            taskTitle: task.title,
            mentionedBy: comment.user.name,
            mentionedByAvatar: comment.user.avatarUrl,
            content: content.substring(0, 100),
            createdAt: comment.createdAt.toISOString(),
          },
        });
      }
    }

    // Broadcast comment to viewers
    const resource = `task:${taskId}:planning`;
    connectionManager.broadcast(resource, {
      type: "planning:comment:add",
      payload: {
        comment: {
          id: comment.id,
          taskId,
          approachIdx,
          content,
          userId: comment.userId,
          userName: comment.user.name,
          userAvatar: comment.user.avatarUrl,
          parentId,
          mentions: mentionedUsernames,
          createdAt: comment.createdAt.toISOString(),
        },
      },
    });

    return { data: comment };
  });

  /**
   * PATCH /api/collaboration/comments/:commentId
   * Update a comment
   */
  app.patch<{
    Params: { commentId: string };
    Body: { content?: string; isResolved?: boolean };
  }>("/comments/:commentId", async (request) => {
    const { commentId } = request.params;
    const { content, isResolved } = request.body;

    // Verify ownership
    const existingComment = await prisma.approachComment.findUnique({
      where: { id: commentId },
      select: { userId: true, taskId: true, approachIdx: true },
    });

    if (!existingComment) {
      throw { statusCode: 404, message: "Comment not found" };
    }

    if (existingComment.userId !== request.userId) {
      throw { statusCode: 403, message: "You can only edit your own comments" };
    }

    const updatedComment = await prisma.approachComment.update({
      where: { id: commentId },
      data: {
        ...(content !== undefined ? { content } : {}),
        ...(isResolved !== undefined ? { isResolved } : {}),
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

    // Broadcast update
    const resource = `task:${existingComment.taskId}:planning`;
    connectionManager.broadcast(resource, {
      type: "planning:comment:update",
      payload: {
        commentId,
        content: updatedComment.content,
        isResolved: updatedComment.isResolved,
        updatedAt: updatedComment.updatedAt.toISOString(),
      },
    });

    return { data: updatedComment };
  });

  /**
   * DELETE /api/collaboration/comments/:commentId
   * Delete a comment
   */
  app.delete<{ Params: { commentId: string } }>(
    "/comments/:commentId",
    async (request) => {
      const { commentId } = request.params;

      // Verify ownership
      const existingComment = await prisma.approachComment.findUnique({
        where: { id: commentId },
        select: { userId: true, taskId: true, approachIdx: true },
      });

      if (!existingComment) {
        throw { statusCode: 404, message: "Comment not found" };
      }

      if (existingComment.userId !== request.userId) {
        throw { statusCode: 403, message: "You can only delete your own comments" };
      }

      await prisma.approachComment.delete({
        where: { id: commentId },
      });

      // Broadcast deletion
      const resource = `task:${existingComment.taskId}:planning`;
      connectionManager.broadcast(resource, {
        type: "planning:comment:delete",
        payload: {
          commentId,
          taskId: existingComment.taskId,
          approachIdx: existingComment.approachIdx,
        },
      });

      return { success: true };
    }
  );

  // ============================================================================
  // Voting
  // ============================================================================

  /**
   * GET /api/collaboration/tasks/:taskId/votes
   * Get vote counts for all approaches
   */
  app.get<{ Params: { taskId: string } }>(
    "/tasks/:taskId/votes",
    async (request) => {
      const { taskId } = request.params;

      const votes = await prisma.approachVote.groupBy({
        by: ["approachIdx", "voteType"],
        where: { taskId },
        _count: true,
      });

      // Get current user's votes
      const userVotes = await prisma.approachVote.findMany({
        where: {
          taskId,
          userId: request.userId,
        },
        select: {
          approachIdx: true,
          voteType: true,
        },
      });

      // Aggregate into { approachIdx: { upvotes, downvotes, userVote } }
      const voteMap: Record<
        number,
        { upvotes: number; downvotes: number; userVote: string | null }
      > = {};

      for (const vote of votes) {
        if (!voteMap[vote.approachIdx]) {
          voteMap[vote.approachIdx] = { upvotes: 0, downvotes: 0, userVote: null };
        }
        if (vote.voteType === "upvote") {
          voteMap[vote.approachIdx].upvotes = vote._count;
        } else {
          voteMap[vote.approachIdx].downvotes = vote._count;
        }
      }

      for (const userVote of userVotes) {
        if (!voteMap[userVote.approachIdx]) {
          voteMap[userVote.approachIdx] = { upvotes: 0, downvotes: 0, userVote: null };
        }
        voteMap[userVote.approachIdx].userVote = userVote.voteType;
      }

      return { data: voteMap };
    }
  );

  /**
   * POST /api/collaboration/tasks/:taskId/votes
   * Vote on an approach
   */
  app.post<{
    Params: { taskId: string };
    Body: VoteBody;
  }>("/tasks/:taskId/votes", async (request) => {
    const { taskId } = request.params;
    const { approachIdx, voteType } = request.body;

    // Upsert the vote (update if exists, create if not)
    const vote = await prisma.approachVote.upsert({
      where: {
        taskId_approachIdx_userId: {
          taskId,
          approachIdx,
          userId: request.userId,
        },
      },
      create: {
        taskId,
        approachIdx,
        userId: request.userId,
        voteType,
      },
      update: {
        voteType,
      },
    });

    // Get updated vote counts
    const voteCounts = await prisma.approachVote.groupBy({
      by: ["voteType"],
      where: { taskId, approachIdx },
      _count: true,
    });

    const counts = {
      upvotes: voteCounts.find((v) => v.voteType === "upvote")?._count || 0,
      downvotes: voteCounts.find((v) => v.voteType === "downvote")?._count || 0,
    };

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { name: true, avatarUrl: true },
    });

    // Broadcast vote update
    const resource = `task:${taskId}:planning`;
    connectionManager.broadcast(resource, {
      type: "planning:vote",
      payload: {
        taskId,
        approachIdx,
        voteType,
        userId: request.userId,
        userName: user?.name,
        userAvatar: user?.avatarUrl,
        counts,
        timestamp: new Date().toISOString(),
      },
    });

    return { data: { vote, counts } };
  });

  /**
   * DELETE /api/collaboration/tasks/:taskId/votes/:approachIdx
   * Remove a vote
   */
  app.delete<{
    Params: { taskId: string; approachIdx: string };
  }>("/tasks/:taskId/votes/:approachIdx", async (request) => {
    const { taskId, approachIdx } = request.params;
    const approachIdxNum = parseInt(approachIdx, 10);

    await prisma.approachVote.deleteMany({
      where: {
        taskId,
        approachIdx: approachIdxNum,
        userId: request.userId,
      },
    });

    // Get updated vote counts
    const voteCounts = await prisma.approachVote.groupBy({
      by: ["voteType"],
      where: { taskId, approachIdx: approachIdxNum },
      _count: true,
    });

    const counts = {
      upvotes: voteCounts.find((v) => v.voteType === "upvote")?._count || 0,
      downvotes: voteCounts.find((v) => v.voteType === "downvote")?._count || 0,
    };

    // Broadcast vote removal
    const resource = `task:${taskId}:planning`;
    connectionManager.broadcast(resource, {
      type: "planning:vote:remove",
      payload: {
        taskId,
        approachIdx: approachIdxNum,
        userId: request.userId,
        counts,
        timestamp: new Date().toISOString(),
      },
    });

    return { success: true, counts };
  });

  // ============================================================================
  // Mentions & Notifications
  // ============================================================================

  /**
   * GET /api/collaboration/notifications
   * Get user's mention notifications
   */
  app.get<{
    Querystring: { unreadOnly?: string; limit?: string };
  }>("/notifications", async (request) => {
    const unreadOnly = request.query.unreadOnly === "true";
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;

    const notifications = await prisma.mentionNotification.findMany({
      where: {
        userId: request.userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const unreadCount = await prisma.mentionNotification.count({
      where: {
        userId: request.userId,
        isRead: false,
      },
    });

    return {
      data: notifications,
      unreadCount,
    };
  });

  /**
   * POST /api/collaboration/notifications/:notificationId/read
   * Mark a notification as read
   */
  app.post<{ Params: { notificationId: string } }>(
    "/notifications/:notificationId/read",
    async (request) => {
      const { notificationId } = request.params;

      await prisma.mentionNotification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });

      return { success: true };
    }
  );

  /**
   * POST /api/collaboration/notifications/read-all
   * Mark all notifications as read
   */
  app.post("/notifications/read-all", async (request) => {
    await prisma.mentionNotification.updateMany({
      where: {
        userId: request.userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return { success: true };
  });

  // ============================================================================
  // Team Members (for @mention autocomplete)
  // ============================================================================

  /**
   * GET /api/collaboration/team-members
   * Get list of team members for @mention autocomplete
   */
  app.get<{
    Querystring: { search?: string; limit?: string };
  }>("/team-members", async (request) => {
    const search = request.query.search || "";
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;

    const members = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
        id: { not: request.userId }, // Exclude current user
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
      take: limit,
    });

    return { data: members };
  });

  // ============================================================================
  // Planning Session (Join/Leave)
  // ============================================================================

  /**
   * POST /api/collaboration/tasks/:taskId/join
   * Join a planning session
   */
  app.post<{ Params: { taskId: string } }>(
    "/tasks/:taskId/join",
    async (request) => {
      const { taskId } = request.params;

      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { id: true, name: true, avatarUrl: true },
      });

      // Create initial cursor
      await prisma.planningCursor.upsert({
        where: {
          taskId_userId: {
            taskId,
            userId: request.userId,
          },
        },
        create: {
          taskId,
          userId: request.userId,
          x: 0,
          y: 0,
          lastUpdatedAt: new Date(),
        },
        update: {
          lastUpdatedAt: new Date(),
        },
      });

      // Broadcast join event
      const resource = `task:${taskId}:planning`;
      connectionManager.broadcast(resource, {
        type: "planning:user:join",
        payload: {
          taskId,
          userId: request.userId,
          userName: user?.name,
          avatarUrl: user?.avatarUrl,
          timestamp: new Date().toISOString(),
        },
      });

      // Get current participants
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      const participants = await prisma.planningCursor.findMany({
        where: {
          taskId,
          lastUpdatedAt: { gte: thirtySecondsAgo },
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

      return {
        data: {
          participants: participants.map((p) => ({
            userId: p.userId,
            userName: p.user.name,
            avatarUrl: p.user.avatarUrl,
            x: p.x,
            y: p.y,
            viewportSection: p.viewportSection,
          })),
        },
      };
    }
  );

  /**
   * POST /api/collaboration/tasks/:taskId/leave
   * Leave a planning session
   */
  app.post<{ Params: { taskId: string } }>(
    "/tasks/:taskId/leave",
    async (request) => {
      const { taskId } = request.params;

      // Remove cursor
      await prisma.planningCursor.deleteMany({
        where: {
          taskId,
          userId: request.userId,
        },
      });

      // Broadcast leave event
      const resource = `task:${taskId}:planning`;
      connectionManager.broadcast(resource, {
        type: "planning:user:leave",
        payload: {
          taskId,
          userId: request.userId,
          timestamp: new Date().toISOString(),
        },
      });

      return { success: true };
    }
  );
};
