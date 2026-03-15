import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../db.js";

interface AnalyticsQuery {
  startDate?: string;
  endDate?: string;
  projectId?: string;
  repositoryId?: string;
  groupBy?: "day" | "week" | "month";
}

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // GET /api/analytics/overview
  // Returns executive summary: total tasks, hours saved, total cost, ROI, success rate with sparklines and trends
  app.get<{ Querystring: AnalyticsQuery }>(
    "/overview",
    async (request, reply) => {
      const { startDate, endDate, projectId, repositoryId } = request.query;
      const userId = request.userId;

      const dateFilter = buildDateFilter(startDate, endDate);
      const projectFilter = projectId ? { projectId } : {};
      const repoFilter = repositoryId ? { repositoryId } : {};

      // Get current period metrics
      const [
        totalTasks,
        completedTasks,
        failedTasks,
        timeSaved,
        codeChanges,
        usageRecords,
      ] = await Promise.all([
        prisma.task.count({
          where: { userId, ...dateFilter, ...projectFilter, ...repoFilter },
        }),
        prisma.task.count({
          where: {
            userId,
            status: "completed",
            ...dateFilter,
            ...projectFilter,
            ...repoFilter,
          },
        }),
        prisma.task.count({
          where: { userId, status: "failed", ...dateFilter, ...projectFilter, ...repoFilter },
        }),
        prisma.engineeringTimeSaved.aggregate({
          where: { userId, ...dateFilter, ...projectFilter, ...repoFilter },
          _sum: { estimatedMinutesSaved: true },
        }),
        prisma.codeChangeMetrics.aggregate({
          where: { userId, ...dateFilter, ...projectFilter },
          _sum: { linesAdded: true, linesDeleted: true, filesChanged: true },
        }),
        prisma.usageRecord.aggregate({
          where: { userId, ...dateFilter },
          _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
        }),
      ]);

      const totalTokens = (usageRecords._sum.inputTokens || 0) + (usageRecords._sum.outputTokens || 0);
      const hoursSaved = Math.round(
        (timeSaved._sum.estimatedMinutesSaved || 0) / 60
      );
      const totalCost = usageRecords._sum.estimatedCostUsd || 0;
      const successRate =
        totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
      const userSettings = await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });
      const savedRate = ((userSettings?.settings as any)?.analyticsHourlyRate) ?? 75;
      const roi = totalCost > 0 ? (hoursSaved * savedRate) / totalCost : 0;

      // Get previous period for trends (same duration before startDate)
      const periodDuration = calculatePeriodDuration(startDate, endDate);
      const previousPeriodFilter = buildPreviousPeriodFilter(
        startDate,
        periodDuration
      );

      const [prevTasks, prevTimeSaved, prevCost] = await Promise.all([
        prisma.task.count({
          where: { userId, ...previousPeriodFilter, ...projectFilter },
        }),
        prisma.engineeringTimeSaved.aggregate({
          where: { userId, ...previousPeriodFilter, ...projectFilter },
          _sum: { estimatedMinutesSaved: true },
        }),
        prisma.usageRecord.aggregate({
          where: { userId, ...previousPeriodFilter },
          _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
        }),
      ]);

      // Calculate trends (percentage change)
      const prevHours = Math.round(
        (prevTimeSaved._sum.estimatedMinutesSaved || 0) / 60
      );
      const prevTokens = (prevCost._sum.inputTokens || 0) + (prevCost._sum.outputTokens || 0);

      // Generate sparkline data (last 7 data points)
      const sparklineData = await generateSparklines(
        userId,
        projectId,
        dateFilter
      );

      return {
        data: {
          totalTasks,
          totalTasksTrend: calculateTrend(totalTasks, prevTasks),
          hoursSaved,
          hoursSavedTrend: calculateTrend(hoursSaved, prevHours),
          totalCost,
          totalCostTrend: calculateTrend(
            totalCost,
            prevCost._sum.estimatedCostUsd || 0
          ),
          totalTokens,
          totalTokensTrend: calculateTrend(totalTokens, prevTokens),
          roi: Math.round(roi * 10) / 10,
          roiTrend: 0, // Calculate if needed
          successRate: Math.round(successRate * 10) / 10,
          successRateTrend: 0,
          sparklines: sparklineData,
        },
      };
    }
  );

  // GET /api/analytics/roi
  app.get<{ Querystring: AnalyticsQuery & { hourlyRate?: string } }>(
    "/roi",
    async (request, reply) => {
      const { startDate, endDate, hourlyRate } = request.query;
      const userId = request.userId;
      let rate = hourlyRate ? parseFloat(hourlyRate) : NaN;
      if (isNaN(rate)) {
        const userSettings = await prisma.user.findUnique({
          where: { id: userId },
          select: { settings: true },
        });
        rate = ((userSettings?.settings as any)?.analyticsHourlyRate) ?? 75;
      }

      const dateFilter = buildDateFilter(startDate, endDate);

      const [timeSaved, totalCost] = await Promise.all([
        prisma.engineeringTimeSaved.aggregate({
          where: { userId, ...dateFilter },
          _sum: { estimatedMinutesSaved: true },
        }),
        prisma.usageRecord.aggregate({
          where: { userId, ...dateFilter },
          _sum: { estimatedCostUsd: true },
        }),
      ]);

      const hoursSaved = (timeSaved._sum.estimatedMinutesSaved || 0) / 60;
      const platformCost = totalCost._sum.estimatedCostUsd || 0;
      const engineeringCostSaved = hoursSaved * rate;
      const netSavings = engineeringCostSaved - platformCost;
      const roi = platformCost > 0 ? engineeringCostSaved / platformCost : 0;

      return {
        data: {
          engineeringCostSaved: Math.round(engineeringCostSaved * 100) / 100,
          platformCost: Math.round(platformCost * 100) / 100,
          netSavings: Math.round(netSavings * 100) / 100,
          roi: Math.round(roi * 10) / 10,
          hourlyRate: rate,
          totalHoursSaved: Math.round(hoursSaved * 10) / 10,
        },
      };
    }
  );

  // GET /api/analytics/costs
  app.get<{ Querystring: AnalyticsQuery }>(
    "/costs",
    async (request, reply) => {
      const { startDate, endDate, groupBy = "day" } = request.query;
      const userId = request.userId;

      const dateFilter = buildDateFilter(startDate, endDate);

      const usageRecords = await prisma.usageRecord.findMany({
        where: { userId, ...dateFilter },
        select: {
          model: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCostUsd: true,
          source: true,
          createdAt: true,
        },
      });

      // Aggregate by model
      const byModel = new Map<string, { cost: number; count: number }>();
      // Aggregate by source (chat, task, scan, command, etc.)
      const bySource = new Map<string, { cost: number; count: number }>();
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCost = 0;

      for (const record of usageRecords) {
        const model = record.model || "unknown";
        const existing = byModel.get(model) || { cost: 0, count: 0 };
        existing.cost += record.estimatedCostUsd || 0;
        existing.count++;
        byModel.set(model, existing);

        // Aggregate by source
        const source = record.source || "unknown";
        const sourceExisting = bySource.get(source) || { cost: 0, count: 0 };
        sourceExisting.cost += record.estimatedCostUsd || 0;
        sourceExisting.count++;
        bySource.set(source, sourceExisting);

        totalInputTokens += record.inputTokens || 0;
        totalOutputTokens += record.outputTokens || 0;
        totalCost += record.estimatedCostUsd || 0;
      }

      // Group by time period for timeline
      const timelineRaw = groupByTime(
        usageRecords.map((r) => ({
          createdAt: r.createdAt,
          value: r.estimatedCostUsd || 0,
        })),
        groupBy
      );

      // Map 'value' to 'cost' for the frontend chart
      const timeline = timelineRaw.map((item) => ({
        date: item.date,
        cost: item.value,
      }));

      // Map source names to user-friendly labels
      const sourceLabels: Record<string, string> = {
        chat: "AI Assistant",
        ai_chat: "AI Chat (Legacy)",
        task: "Task Execution",
        task_plan: "Task Planning",
        task_execute: "Task Execution",
        scan: "Repository Scans",
        embed: "Embed Screening",
        command: "Voice/Search Commands",
      };

      // Generate timeline by source (daily stacked data)
      const timelineBySourceMap = new Map<string, Map<string, number>>();
      const allSources = new Set<string>();

      for (const record of usageRecords) {
        const dateKey = formatDateKey(record.createdAt, groupBy);
        const source = record.source || "unknown";
        allSources.add(source);

        if (!timelineBySourceMap.has(dateKey)) {
          timelineBySourceMap.set(dateKey, new Map());
        }
        const dayMap = timelineBySourceMap.get(dateKey)!;
        dayMap.set(source, (dayMap.get(source) || 0) + (record.estimatedCostUsd || 0));
      }

      const timelineBySource = Array.from(timelineBySourceMap.entries())
        .map(([date, sourceMap]) => {
          const entry: Record<string, any> = { date };
          for (const source of allSources) {
            entry[source] = Math.round((sourceMap.get(source) || 0) * 10000) / 10000;
          }
          return entry;
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      // Generate timeline by token type (daily stacked data)
      const timelineByTokenMap = new Map<string, { input: number; output: number }>();

      for (const record of usageRecords) {
        const dateKey = formatDateKey(record.createdAt, groupBy);

        if (!timelineByTokenMap.has(dateKey)) {
          timelineByTokenMap.set(dateKey, { input: 0, output: 0 });
        }
        const dayData = timelineByTokenMap.get(dateKey)!;
        dayData.input += record.inputTokens || 0;
        dayData.output += record.outputTokens || 0;
      }

      const timelineByToken = Array.from(timelineByTokenMap.entries())
        .map(([date, tokens]) => ({
          date,
          input: tokens.input,
          output: tokens.output,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        data: {
          total: Math.round(totalCost * 100) / 100,
          byModel: Array.from(byModel.entries()).map(([model, data]) => ({
            model,
            cost: Math.round(data.cost * 100) / 100,
            percentage:
              totalCost > 0 ? Math.round((data.cost / totalCost) * 100) : 0,
          })),
          bySource: Array.from(bySource.entries()).map(([source, data]) => ({
            source,
            label: sourceLabels[source] || source,
            cost: Math.round(data.cost * 100) / 100,
            count: data.count,
            percentage:
              totalCost > 0 ? Math.round((data.cost / totalCost) * 100) : 0,
          })),
          byTokenType: [
            { type: "input", tokens: totalInputTokens, cost: 0 },
            { type: "output", tokens: totalOutputTokens, cost: 0 },
          ],
          timeline,
          timelineBySource,
          timelineByToken,
          sourceLabels, // Send labels to frontend for display
          sources: Array.from(allSources), // List of all sources for chart keys
        },
      };
    }
  );

  // GET /api/analytics/pipeline
  app.get("/pipeline", async (request, reply) => {
    const userId = request.userId;

    const [pending, planning, inProgress, completed, failed, avgCompletion] =
      await Promise.all([
        prisma.task.count({ where: { userId, status: "pending" } }),
        prisma.task.count({ where: { userId, status: "planning" } }),
        prisma.task.count({ where: { userId, status: "in_progress" } }),
        prisma.task.count({ where: { userId, status: "completed" } }),
        prisma.task.count({ where: { userId, status: "failed" } }),
        // Average time to complete (simplified)
        prisma.task.findMany({
          where: { userId, status: "completed" },
          select: { createdAt: true, updatedAt: true },
          take: 100,
          orderBy: { updatedAt: "desc" },
        }),
      ]);

    // Calculate average completion time
    let totalMinutes = 0;
    for (const task of avgCompletion) {
      totalMinutes +=
        (task.updatedAt.getTime() - task.createdAt.getTime()) / 60000;
    }
    const avgTimeToComplete =
      avgCompletion.length > 0 ? totalMinutes / avgCompletion.length / 60 : 0;

    return {
      data: {
        pending,
        planning,
        inProgress,
        completed,
        failed,
        avgTimeToComplete: Math.round(avgTimeToComplete * 10) / 10,
        avgPlanningRounds: 1.3, // Placeholder - would need planning question tracking
      },
    };
  });

  // GET /api/analytics/distribution
  app.get<{ Querystring: { type: string } }>(
    "/distribution",
    async (request, reply) => {
      const userId = request.userId;
      const { type } = request.query;

      let items: { label: string; value: number; percentage: number }[] = [];

      if (type === "type") {
        const groups = await prisma.task.groupBy({
          by: ["type"],
          where: { userId },
          _count: true,
        });
        const total = groups.reduce((sum, g) => sum + g._count, 0);
        items = groups.map((g) => ({
          label: g.type,
          value: g._count,
          percentage: total > 0 ? Math.round((g._count / total) * 100) : 0,
        }));
      } else if (type === "priority") {
        const groups = await prisma.task.groupBy({
          by: ["priority"],
          where: { userId },
          _count: true,
        });
        const total = groups.reduce((sum, g) => sum + g._count, 0);
        items = groups.map((g) => ({
          label: g.priority,
          value: g._count,
          percentage: total > 0 ? Math.round((g._count / total) * 100) : 0,
        }));
      } else if (type === "repository") {
        const groups = await prisma.task.groupBy({
          by: ["repositoryId"],
          where: { userId },
          _count: true,
          orderBy: { _count: { repositoryId: "desc" } },
          take: 10,
        });
        const repos = await prisma.repository.findMany({
          where: { id: { in: groups.map((g) => g.repositoryId) } },
          select: { id: true, fullName: true },
        });
        const repoMap = new Map(repos.map((r) => [r.id, r.fullName]));
        const total = groups.reduce((sum, g) => sum + g._count, 0);
        items = groups.map((g) => ({
          label: repoMap.get(g.repositoryId) || "Unknown",
          value: g._count,
          percentage: total > 0 ? Math.round((g._count / total) * 100) : 0,
        }));
      }

      return { data: { items } };
    }
  );

  // GET /api/analytics/contributors
  app.get<{ Querystring: AnalyticsQuery & { limit?: string } }>(
    "/contributors",
    async (request, reply) => {
      const { startDate, endDate, limit = "10" } = request.query;
      const dateFilter = buildDateFilter(startDate, endDate);

      // Group tasks by user with aggregations
      const taskGroups = await prisma.task.groupBy({
        by: ["userId"],
        where: { status: "completed", ...dateFilter },
        _count: true,
      });

      // Get additional metrics for each user
      const contributors = await Promise.all(
        taskGroups.slice(0, parseInt(limit)).map(async (group, index) => {
          const [user, timeSaved, codeChanges] = await Promise.all([
            prisma.user.findUnique({
              where: { id: group.userId },
              select: { id: true, name: true, avatarUrl: true },
            }),
            prisma.engineeringTimeSaved.aggregate({
              where: { userId: group.userId, ...dateFilter },
              _sum: { estimatedMinutesSaved: true },
            }),
            prisma.codeChangeMetrics.aggregate({
              where: { userId: group.userId, ...dateFilter },
              _sum: { linesAdded: true, linesDeleted: true },
            }),
          ]);

          return {
            rank: index + 1,
            userId: group.userId,
            userName: user?.name || "Unknown",
            userAvatar: user?.avatarUrl,
            taskCount: group._count,
            hoursSaved: Math.round(
              (timeSaved._sum.estimatedMinutesSaved || 0) / 60
            ),
            linesChanged:
              (codeChanges._sum.linesAdded || 0) +
              (codeChanges._sum.linesDeleted || 0),
          };
        })
      );

      // Sort by hours saved descending
      return { data: contributors.sort((a, b) => b.hoursSaved - a.hoursSaved) };
    }
  );

  // GET /api/analytics/trends
  app.get<{ Querystring: AnalyticsQuery & { metric: string } }>(
    "/trends",
    async (request, reply) => {
      const { startDate, endDate, groupBy = "day", metric } = request.query;
      const userId = request.userId;
      const dateFilter = buildDateFilter(startDate, endDate);

      // Return time-series data based on metric
      // Simplified implementation - group by date
      const tasks = await prisma.task.findMany({
        where: { userId, ...dateFilter },
        select: { createdAt: true, status: true },
      });

      const grouped = groupByTime(
        tasks.map((t) => ({ createdAt: t.createdAt, value: 1 })),
        groupBy
      );

      return { data: grouped };
    }
  );

  // GET /api/analytics/loc
  app.get<{ Querystring: AnalyticsQuery }>(
    "/loc",
    async (request, reply) => {
      const { startDate, endDate, groupBy = "day" } = request.query;
      const userId = request.userId;
      const dateFilter = buildDateFilter(startDate, endDate);

      const metrics = await prisma.codeChangeMetrics.findMany({
        where: { userId, ...dateFilter },
        select: {
          linesAdded: true,
          linesDeleted: true,
          filesChanged: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      });

      // Group by time period
      const grouped = new Map<
        string,
        { linesAdded: number; linesDeleted: number; filesChanged: number }
      >();

      for (const m of metrics) {
        const key = formatDateKey(m.createdAt, groupBy);
        const existing = grouped.get(key) || {
          linesAdded: 0,
          linesDeleted: 0,
          filesChanged: 0,
        };
        existing.linesAdded += m.linesAdded;
        existing.linesDeleted += m.linesDeleted;
        existing.filesChanged += m.filesChanged;
        grouped.set(key, existing);
      }

      return {
        data: Array.from(grouped.entries()).map(([date, data]) => ({
          date,
          ...data,
        })),
      };
    }
  );

  // GET /api/analytics/time-saved
  app.get<{ Querystring: AnalyticsQuery }>(
    "/time-saved",
    async (request, reply) => {
      const { startDate, endDate, groupBy = "day" } = request.query;
      const userId = request.userId;
      const dateFilter = buildDateFilter(startDate, endDate);

      const records = await prisma.engineeringTimeSaved.findMany({
        where: { userId, ...dateFilter },
        select: { estimatedMinutesSaved: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      const grouped = new Map<
        string,
        { minutesSaved: number; taskCount: number }
      >();

      for (const r of records) {
        const key = formatDateKey(r.createdAt, groupBy);
        const existing = grouped.get(key) || { minutesSaved: 0, taskCount: 0 };
        existing.minutesSaved += r.estimatedMinutesSaved;
        existing.taskCount++;
        grouped.set(key, existing);
      }

      return {
        data: Array.from(grouped.entries()).map(([date, data]) => ({
          date,
          ...data,
        })),
      };
    }
  );

  // GET /api/analytics/drill-down/:type/:id
  app.get<{ Params: { type: string; id: string } }>(
    "/drill-down/:type/:id",
    async (request, reply) => {
      const { type, id } = request.params;
      const userId = request.userId;

      let summary = {
        totalTasks: 0,
        totalHoursSaved: 0,
        totalLinesChanged: 0,
        successRate: 0,
      };
      let items: any[] = [];

      if (type === "user") {
        // Drill down into user's projects
        const [tasks, timeSaved, codeChanges] = await Promise.all([
          prisma.task.findMany({
            where: { userId: id },
            select: { id: true, status: true, projectId: true },
          }),
          prisma.engineeringTimeSaved.aggregate({
            where: { userId: id },
            _sum: { estimatedMinutesSaved: true },
          }),
          prisma.codeChangeMetrics.aggregate({
            where: { userId: id },
            _sum: { linesAdded: true, linesDeleted: true },
          }),
        ]);

        summary.totalTasks = tasks.length;
        summary.totalHoursSaved = Math.round(
          (timeSaved._sum.estimatedMinutesSaved || 0) / 60
        );
        summary.totalLinesChanged =
          (codeChanges._sum.linesAdded || 0) +
          (codeChanges._sum.linesDeleted || 0);
        summary.successRate =
          tasks.length > 0
            ? (tasks.filter((t) => t.status === "completed").length /
                tasks.length) *
              100
            : 0;

        // Group by project
        const projectGroups = new Map<string, number>();
        for (const task of tasks) {
          if (task.projectId) {
            projectGroups.set(
              task.projectId,
              (projectGroups.get(task.projectId) || 0) + 1
            );
          }
        }

        items = Array.from(projectGroups.entries()).map(
          ([projectId, count]) => ({
            id: projectId,
            name: projectId, // Would fetch actual name
            taskCount: count,
            hoursSaved: 0,
            linesChanged: 0,
          })
        );
      } else if (type === "project") {
        // Drill down into project's tasks
        const tasks = await prisma.task.findMany({
          where: { projectId: id },
          include: {
            codeChangeMetrics: true,
            engineeringTimeSaved: true,
          },
        });

        summary.totalTasks = tasks.length;
        summary.totalHoursSaved = tasks.reduce(
          (sum, t) =>
            sum + (t.engineeringTimeSaved?.estimatedMinutesSaved || 0) / 60,
          0
        );
        summary.totalLinesChanged = tasks.reduce(
          (sum, t) =>
            sum +
            ((t.codeChangeMetrics?.linesAdded || 0) +
              (t.codeChangeMetrics?.linesDeleted || 0)),
          0
        );
        summary.successRate =
          tasks.length > 0
            ? (tasks.filter((t) => t.status === "completed").length /
                tasks.length) *
              100
            : 0;

        items = tasks.map((t) => ({
          id: t.id,
          name: t.title,
          taskCount: 1,
          hoursSaved: Math.round(
            (t.engineeringTimeSaved?.estimatedMinutesSaved || 0) / 60
          ),
          linesChanged:
            (t.codeChangeMetrics?.linesAdded || 0) +
            (t.codeChangeMetrics?.linesDeleted || 0),
        }));
      } else if (type === "task") {
        // Drill down into task's file-level detail
        const task = await prisma.task.findUnique({
          where: { id },
          include: { codeChangeMetrics: true, engineeringTimeSaved: true },
        });

        if (task) {
          summary.totalTasks = 1;
          summary.totalHoursSaved = Math.round(
            (task.engineeringTimeSaved?.estimatedMinutesSaved || 0) / 60
          );
          summary.totalLinesChanged =
            (task.codeChangeMetrics?.linesAdded || 0) +
            (task.codeChangeMetrics?.linesDeleted || 0);
          summary.successRate = task.status === "completed" ? 100 : 0;

          // File breakdown
          const breakdown =
            (task.codeChangeMetrics?.fileBreakdown as any[]) || [];
          items = breakdown.map((f: any) => ({
            id: f.path,
            name: f.path,
            taskCount: 1,
            hoursSaved: 0,
            linesChanged: (f.added || 0) + (f.deleted || 0),
          }));
        }
      }

      return { data: { summary, items } };
    }
  );

  // GET /api/analytics/export
  app.get<{ Querystring: AnalyticsQuery & { format: string } }>(
    "/export",
    async (request, reply) => {
      const { format = "json", startDate, endDate } = request.query;
      const userId = request.userId;
      const dateFilter = buildDateFilter(startDate, endDate);

      const data = await prisma.task.findMany({
        where: { userId, ...dateFilter },
        include: {
          codeChangeMetrics: true,
          engineeringTimeSaved: true,
        },
      });

      if (format === "csv") {
        const headers = [
          "id",
          "title",
          "type",
          "status",
          "linesAdded",
          "linesDeleted",
          "minutesSaved",
          "createdAt",
        ];
        const rows = data.map((t) => [
          t.id,
          `"${t.title.replace(/"/g, '""')}"`,
          t.type,
          t.status,
          t.codeChangeMetrics?.linesAdded || 0,
          t.codeChangeMetrics?.linesDeleted || 0,
          t.engineeringTimeSaved?.estimatedMinutesSaved || 0,
          t.createdAt.toISOString(),
        ]);

        const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join(
          "\n"
        );
        reply.header("Content-Type", "text/csv");
        reply.header(
          "Content-Disposition",
          "attachment; filename=analytics-export.csv"
        );
        return csv;
      }

      return { data };
    }
  );

  // GET /api/analytics/settings
  app.get(
    "/settings",
    async (request, reply) => {
      const userId = request.userId;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });
      const settings = (user?.settings as any) || {};
      return {
        data: {
          hourlyRate: settings.analyticsHourlyRate ?? 75,
          displayPreferences: settings.analyticsDisplayPreferences || {},
        },
      };
    }
  );

  // PUT /api/analytics/settings
  app.put<{ Body: { hourlyRate?: number; displayPreferences?: object } }>(
    "/settings",
    async (request, reply) => {
      const userId = request.userId;
      const { hourlyRate, displayPreferences } = request.body;

      // Store in user settings
      const currentSettings = await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });

      const settings = (currentSettings?.settings as any) || {};
      if (hourlyRate !== undefined) settings.analyticsHourlyRate = hourlyRate;
      if (displayPreferences)
        settings.analyticsDisplayPreferences = displayPreferences;

      await prisma.user.update({
        where: { id: userId },
        data: { settings },
      });

      return { data: { success: true } };
    }
  );
};

// Helper functions
function buildDateFilter(startDate?: string, endDate?: string) {
  const filter: any = {};
  if (startDate) {
    filter.createdAt = { ...filter.createdAt, gte: new Date(startDate) };
  }
  if (endDate) {
    // Include the entire end day by setting time to 23:59:59.999
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    filter.createdAt = { ...filter.createdAt, lte: endOfDay };
  }
  return Object.keys(filter).length > 0 ? filter : {};
}

function calculatePeriodDuration(startDate?: string, endDate?: string): number {
  if (!startDate || !endDate) return 30 * 24 * 60 * 60 * 1000; // Default 30 days
  return new Date(endDate).getTime() - new Date(startDate).getTime();
}

function buildPreviousPeriodFilter(startDate: string | undefined, duration: number) {
  if (!startDate) return {};
  const start = new Date(new Date(startDate).getTime() - duration);
  const end = new Date(startDate);
  return { createdAt: { gte: start, lt: end } };
}

function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

async function generateSparklines(
  userId: string,
  projectId?: string,
  dateFilter: any = {}
) {
  // Generate 7-point sparklines for each metric based on actual data
  const now = new Date();
  const points = 7;
  const dayMs = 24 * 60 * 60 * 1000;

  const tasksData: number[] = [];
  const hoursSavedData: number[] = [];
  const costData: number[] = [];
  const tokensData: number[] = [];

  // Get data for the last 7 days
  for (let i = points - 1; i >= 0; i--) {
    const dayStart = new Date(now.getTime() - (i + 1) * dayMs);
    const dayEnd = new Date(now.getTime() - i * dayMs);

    const projectFilter = projectId ? { projectId } : {};

    const [taskCount, timeSaved, usage] = await Promise.all([
      prisma.task.count({
        where: {
          userId,
          ...projectFilter,
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      prisma.engineeringTimeSaved.aggregate({
        where: {
          userId,
          ...projectFilter,
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        _sum: { estimatedMinutesSaved: true },
      }),
      prisma.usageRecord.aggregate({
        where: {
          userId,
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      }),
    ]);

    tasksData.push(taskCount);
    hoursSavedData.push(Math.round((timeSaved._sum.estimatedMinutesSaved || 0) / 60));
    costData.push(Math.round((usage._sum.estimatedCostUsd || 0) * 100) / 100);
    tokensData.push((usage._sum.inputTokens || 0) + (usage._sum.outputTokens || 0));
  }

  // Calculate ROI and success rate sparklines
  const roiData = costData.map((cost, i) => {
    if (cost === 0) return 0;
    return Math.round((hoursSavedData[i] * 75) / cost);
  });

  // For success rate, we need completed vs total per day - simplified to flat for now
  const successRateData = tasksData.map(() => 0);

  return {
    tasks: tasksData,
    hoursSaved: hoursSavedData,
    cost: costData,
    tokens: tokensData,
    roi: roiData,
    successRate: successRateData,
  };
}

function groupByTime(
  records: { createdAt: Date; value: number }[],
  groupBy: string
) {
  const grouped = new Map<string, number>();

  for (const record of records) {
    const key = formatDateKey(record.createdAt, groupBy);
    grouped.set(key, (grouped.get(key) || 0) + record.value);
  }

  return Array.from(grouped.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatDateKey(date: Date, groupBy: string): string {
  const d = new Date(date);
  if (groupBy === "day") {
    return d.toISOString().split("T")[0];
  } else if (groupBy === "week") {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return start.toISOString().split("T")[0];
  } else {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
}
