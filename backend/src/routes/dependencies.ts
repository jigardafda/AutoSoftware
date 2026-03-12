/**
 * Dependency Intelligence API Routes
 *
 * Provides endpoints for:
 * - Analyzing repository dependencies
 * - Viewing and managing dependency alerts
 * - Getting upgrade recommendations
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { dependencyIntelligenceService } from "../services/dependency-intelligence.js";
import { readFile, listDirectory, safePath } from "../services/repo-fs.js";
import type {
  DependencyAlertSeverity,
  DependencyAlertType,
  DependencyAlertStatus,
} from "../../../generated/prisma/client.js";

// Manifest files to look for
const MANIFEST_FILES = [
  "package.json",
  "requirements.txt",
  "requirements-dev.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "composer.json",
];

export const dependencyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // =========================================================================
  // Alert Summary
  // =========================================================================

  /**
   * GET /dependencies/summary
   * Get alert summary across all user's repositories
   */
  app.get("/summary", async (request) => {
    const summary = await dependencyIntelligenceService.getUserAlertSummary(
      request.userId
    );
    return { data: summary };
  });

  // =========================================================================
  // Repository-specific endpoints
  // =========================================================================

  /**
   * POST /dependencies/repos/:id/analyze
   * Trigger dependency analysis for a repository
   */
  app.post<{
    Params: { repoId: string };
    Body: { branch?: string };
  }>("/:repoId/analyze", async (request, reply) => {
    const { repoId } = request.params;

    const repo = await prisma.repository.findFirst({
      where: { id: repoId, userId: request.userId },
    });

    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      // Find manifest files in the repository
      const manifests: Array<{ path: string; content: string }> = [];

      // List root directory and look for manifest files
      const rootEntries = await listDirectory(repo.id, "");

      for (const entry of rootEntries) {
        if (entry.type === "file" && MANIFEST_FILES.includes(entry.name)) {
          try {
            const fileResult = await readFile(repo.id, entry.name);
            manifests.push({
              path: entry.name,
              content: fileResult.content || "",
            });
          } catch {
            // Skip files that can't be read
          }
        }
      }

      // Also check common subdirectories
      const subDirs = ["packages", "apps", "libs"];
      for (const subDir of subDirs) {
        try {
          const subEntries = await listDirectory(repo.id, subDir);
          for (const subEntry of subEntries) {
            if (subEntry.type === "directory") {
              try {
                const pkgEntries = await listDirectory(
                  repo.id,
                  `${subDir}/${subEntry.name}`
                );
                for (const pkgEntry of pkgEntries) {
                  if (
                    pkgEntry.type === "file" &&
                    MANIFEST_FILES.includes(pkgEntry.name)
                  ) {
                    const path = `${subDir}/${subEntry.name}/${pkgEntry.name}`;
                    const fileResult = await readFile(repo.id, path);
                    manifests.push({
                      path,
                      content: fileResult.content || "",
                    });
                  }
                }
              } catch {
                // Skip directories that can't be read
              }
            }
          }
        } catch {
          // Subdirectory doesn't exist
        }
      }

      if (manifests.length === 0) {
        return reply.code(400).send({
          error: { message: "No dependency manifests found in repository" },
        });
      }

      // Analyze dependencies
      const results = await dependencyIntelligenceService.analyzeDependencies(
        repo.id,
        request.userId,
        manifests,
        request.body?.branch
      );

      return {
        data: {
          analyzed: true,
          manifests: manifests.map((m) => m.path),
          results,
        },
      };
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return reply.code(400).send({
          error: {
            message: "Repository files not available. Trigger a scan first.",
          },
        });
      }
      throw error;
    }
  });

  /**
   * GET /dependencies/repos/:id/alerts
   * Get alerts for a specific repository
   */
  app.get<{
    Params: { repoId: string };
    Querystring: {
      status?: string;
      severity?: string;
      type?: string;
      limit?: string;
    };
  }>("/:repoId/alerts", async (request, reply) => {
    const { repoId } = request.params;

    const repo = await prisma.repository.findFirst({
      where: { id: repoId, userId: request.userId },
    });

    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    const { status, severity, type, limit } = request.query;

    const alerts = await dependencyIntelligenceService.getRepositoryAlerts(
      repo.id,
      {
        status: status as "active" | "dismissed" | "resolved" | undefined,
        severity: severity as DependencyAlertSeverity | undefined,
        type: type as DependencyAlertType | undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      }
    );

    return { data: alerts };
  });

  /**
   * GET /dependencies/repos/:id/snapshots
   * Get dependency snapshots for a repository
   */
  app.get<{
    Params: { repoId: string };
  }>("/:repoId/snapshots", async (request, reply) => {
    const { repoId } = request.params;

    const repo = await prisma.repository.findFirst({
      where: { id: repoId, userId: request.userId },
    });

    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    const snapshots = await prisma.dependencySnapshot.findMany({
      where: { repositoryId: repo.id },
      orderBy: { analyzedAt: "desc" },
    });

    return { data: snapshots };
  });

  // =========================================================================
  // Alert management
  // =========================================================================

  /**
   * GET /dependencies/alerts
   * Get all alerts for the user
   */
  app.get<{
    Querystring: {
      status?: string;
      severity?: string;
      type?: string;
      repositoryId?: string;
      limit?: string;
    };
  }>("/alerts", async (request) => {
    const query = request.query as {
      status?: string;
      severity?: string;
      type?: string;
      repositoryId?: string;
      limit?: string;
    };

    const where: any = { userId: request.userId };

    if (query.status) {
      where.status = query.status;
    }
    if (query.severity) {
      where.severity = query.severity;
    }
    if (query.type) {
      where.alertType = query.type;
    }
    if (query.repositoryId) {
      where.repositoryId = query.repositoryId;
    }

    const alerts = await prisma.dependencyAlert.findMany({
      where,
      include: {
        repository: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: query.limit ? parseInt(query.limit, 10) : 100,
    });

    return { data: alerts };
  });

  /**
   * GET /dependencies/alerts/:id
   * Get a specific alert with full details
   */
  app.get<{
    Params: { id: string };
  }>("/alerts/:id", async (request, reply) => {
    const alert = await prisma.dependencyAlert.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
      include: {
        repository: {
          select: { id: true, fullName: true },
        },
      },
    });

    if (!alert) {
      return reply.code(404).send({ error: { message: "Alert not found" } });
    }

    return { data: alert };
  });

  /**
   * POST /dependencies/alerts/:id/dismiss
   * Dismiss an alert
   */
  app.post<{
    Params: { id: string };
    Body: { reason?: string };
  }>("/alerts/:id/dismiss", async (request, reply) => {
    const alert = await prisma.dependencyAlert.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
    });

    if (!alert) {
      return reply.code(404).send({ error: { message: "Alert not found" } });
    }

    await dependencyIntelligenceService.dismissAlert(
      alert.id,
      request.userId,
      request.body?.reason
    );

    return { data: { success: true } };
  });

  /**
   * POST /dependencies/alerts/:id/resolve
   * Mark an alert as resolved
   */
  app.post<{
    Params: { id: string };
    Body: { taskId?: string };
  }>("/alerts/:id/resolve", async (request, reply) => {
    const alert = await prisma.dependencyAlert.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
    });

    if (!alert) {
      return reply.code(404).send({ error: { message: "Alert not found" } });
    }

    await dependencyIntelligenceService.resolveAlert(
      alert.id,
      request.body?.taskId
    );

    return { data: { success: true } };
  });

  /**
   * POST /dependencies/alerts/:id/reactivate
   * Reactivate a dismissed alert
   */
  app.post<{
    Params: { id: string };
  }>("/alerts/:id/reactivate", async (request, reply) => {
    const alert = await prisma.dependencyAlert.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
    });

    if (!alert) {
      return reply.code(404).send({ error: { message: "Alert not found" } });
    }

    await prisma.dependencyAlert.update({
      where: { id: alert.id },
      data: {
        status: "active",
        dismissedAt: null,
        dismissedReason: null,
      },
    });

    return { data: { success: true } };
  });

  /**
   * POST /dependencies/alerts/bulk-dismiss
   * Dismiss multiple alerts at once
   */
  app.post<{
    Body: { alertIds: string[]; reason?: string };
  }>("/alerts/bulk-dismiss", async (request, reply) => {
    const { alertIds, reason } = request.body;

    if (!alertIds || alertIds.length === 0) {
      return reply
        .code(400)
        .send({ error: { message: "Alert IDs required" } });
    }

    // Verify ownership
    const alerts = await prisma.dependencyAlert.findMany({
      where: {
        id: { in: alertIds },
        userId: request.userId,
      },
    });

    if (alerts.length === 0) {
      return reply.code(404).send({ error: { message: "No alerts found" } });
    }

    await prisma.dependencyAlert.updateMany({
      where: {
        id: { in: alerts.map((a) => a.id) },
      },
      data: {
        status: "dismissed",
        dismissedAt: new Date(),
        dismissedReason: reason,
      },
    });

    return { data: { dismissed: alerts.length } };
  });

  // =========================================================================
  // Package info
  // =========================================================================

  /**
   * GET /dependencies/package/:ecosystem/:name
   * Get detailed info about a specific package
   */
  app.get<{
    Params: { ecosystem: string; name: string };
  }>("/package/:ecosystem/:name", async (request, reply) => {
    const { ecosystem, name } = request.params;

    const validEcosystems = ["npm", "pypi", "maven", "go", "cargo", "nuget", "gem", "composer"];
    if (!validEcosystems.includes(ecosystem)) {
      return reply
        .code(400)
        .send({ error: { message: "Invalid ecosystem" } });
    }

    const info = await dependencyIntelligenceService.getPackageInfo(
      ecosystem as any,
      name
    );

    if (!info) {
      return reply
        .code(404)
        .send({ error: { message: "Package not found" } });
    }

    return { data: info };
  });

  // =========================================================================
  // Create task from alert
  // =========================================================================

  /**
   * POST /dependencies/alerts/:id/create-task
   * Create an upgrade task from an alert
   */
  app.post<{
    Params: { id: string };
    Body: {
      projectId?: string;
      priority?: string;
    };
  }>("/alerts/:id/create-task", async (request, reply) => {
    const alert = await prisma.dependencyAlert.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
      include: {
        repository: true,
      },
    });

    if (!alert) {
      return reply.code(404).send({ error: { message: "Alert not found" } });
    }

    // Generate task based on alert type
    let title: string;
    let description: string;
    let taskType: "security" | "improvement" = "improvement";

    switch (alert.alertType) {
      case "security":
        title = `Fix security vulnerability in ${alert.packageName}`;
        description = `**Security Alert: ${alert.title}**\n\n${alert.description}\n\n`;
        if (alert.cveId) {
          description += `**CVE:** ${alert.cveId}\n`;
        }
        if (alert.cvssScore) {
          description += `**CVSS Score:** ${alert.cvssScore}/10\n`;
        }
        if (alert.patchedVersion) {
          description += `\n**Fix:** Upgrade ${alert.packageName} from ${alert.currentVersion} to ${alert.patchedVersion}\n`;
        }
        taskType = "security";
        break;

      case "breaking_change":
        title = `Upgrade ${alert.packageName} to ${alert.recommendedVersion}`;
        description = `**Major Version Update Available**\n\n`;
        description += `Current version: ${alert.currentVersion}\n`;
        description += `Latest version: ${alert.recommendedVersion}\n\n`;
        if (alert.upgradePath) {
          const path = alert.upgradePath as { steps?: string[]; migrationGuide?: string };
          if (path.steps) {
            description += `**Upgrade Path:** ${path.steps.join(" -> ")}\n\n`;
          }
          if (path.migrationGuide) {
            description += `**Migration Guide:**\n${path.migrationGuide}\n`;
          }
        }
        break;

      case "unmaintained":
        title = `Find alternative to unmaintained package: ${alert.packageName}`;
        description = `**Warning: Unmaintained Package**\n\n${alert.description}\n\n`;
        description += `Consider finding an actively maintained alternative to ${alert.packageName}.\n`;
        break;

      case "deprecated":
        title = `Replace deprecated package: ${alert.packageName}`;
        description = `**Deprecated Package**\n\n${alert.description}\n\n`;
        description += `The package ${alert.packageName} has been deprecated and should be replaced.\n`;
        break;

      default:
        title = `Update ${alert.packageName}`;
        description = alert.description;
    }

    // Add source link if available
    if (alert.sourceUrl) {
      description += `\n\n**Reference:** ${alert.sourceUrl}`;
    }

    // Create the task
    const task = await prisma.task.create({
      data: {
        repositoryId: alert.repositoryId,
        userId: request.userId,
        projectId: request.body.projectId || null,
        title,
        description,
        type: taskType,
        priority: (request.body.priority as any) || "medium",
        status: "pending",
        source: "auto_scan",
        metadata: {
          fromAlert: alert.id,
          packageName: alert.packageName,
          currentVersion: alert.currentVersion,
          targetVersion: alert.recommendedVersion || alert.patchedVersion,
        },
      },
    });

    // Mark the alert as having a task created
    await prisma.dependencyAlert.update({
      where: { id: alert.id },
      data: {
        resolvedTaskId: task.id,
      },
    });

    return { data: task };
  });

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * GET /dependencies/stats
   * Get dependency statistics across all repositories
   */
  app.get("/stats", async (request) => {
    const [
      totalAlerts,
      alertsBySeverity,
      alertsByType,
      recentAlerts,
      ecosystemStats,
    ] = await Promise.all([
      prisma.dependencyAlert.count({
        where: { userId: request.userId, status: "active" },
      }),
      prisma.dependencyAlert.groupBy({
        by: ["severity"],
        where: { userId: request.userId, status: "active" },
        _count: true,
      }),
      prisma.dependencyAlert.groupBy({
        by: ["alertType"],
        where: { userId: request.userId, status: "active" },
        _count: true,
      }),
      prisma.dependencyAlert.findMany({
        where: { userId: request.userId, status: "active" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          repository: {
            select: { fullName: true },
          },
        },
      }),
      prisma.dependencySnapshot.groupBy({
        by: ["ecosystem"],
        where: {
          repository: {
            userId: request.userId,
          },
        },
        _count: true,
      }),
    ]);

    return {
      data: {
        totalAlerts,
        alertsBySeverity: alertsBySeverity.reduce(
          (acc, item) => {
            acc[item.severity] = item._count;
            return acc;
          },
          {} as Record<string, number>
        ),
        alertsByType: alertsByType.reduce(
          (acc, item) => {
            acc[item.alertType] = item._count;
            return acc;
          },
          {} as Record<string, number>
        ),
        recentAlerts: recentAlerts.map((alert) => ({
          id: alert.id,
          title: alert.title,
          severity: alert.severity,
          type: alert.alertType,
          repository: alert.repository.fullName,
          createdAt: alert.createdAt,
        })),
        ecosystems: ecosystemStats.map((item) => ({
          ecosystem: item.ecosystem,
          snapshotCount: item._count,
        })),
      },
    };
  });
};
