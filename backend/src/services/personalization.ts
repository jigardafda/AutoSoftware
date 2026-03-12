/**
 * Personalization Service
 *
 * Tracks user behavior patterns, learns preferred code styles,
 * remembers tool preferences, adapts AI tone and verbosity,
 * and manages time-based preferences (quiet hours, peak productivity).
 */

import { prisma } from "../db.js";

// =============================================================================
// Types
// =============================================================================

export interface CodeStylePreferences {
  indentation: "tabs" | "spaces";
  indentSize: number;
  quotes: "single" | "double";
  semicolons: boolean;
  trailingComma: "none" | "es5" | "all";
  lineWidth: number;
  bracketSpacing: boolean;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  desktop: boolean;
  taskComplete: boolean;
  scanComplete: boolean;
  prMerged: boolean;
  reviewRequested: boolean;
  mentionedInComment: boolean;
  dailyDigest: boolean;
}

export interface LearnedPatterns {
  peakHours: number[]; // Hours of the day (0-23) when user is most active
  avgSessionLengthMinutes: number;
  preferredTaskTypes: string[];
  mostUsedTools: string[];
  commonCodePatterns: Record<string, number>; // pattern -> frequency
  averageResponseTime: number; // seconds
  preferredFilesExtensions: string[];
  lastActivityTime: string;
}

export interface UserPreferencesData {
  id: string;
  userId: string;
  aiVerbosity: "minimal" | "medium" | "detailed";
  preferredLanguages: string[];
  preferredTools: string[];
  codeStyle: CodeStylePreferences;
  notificationPrefs: NotificationPreferences;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  uiDensity: "compact" | "comfortable" | "spacious";
  aiTone: "casual" | "professional" | "technical";
  learnedPatterns: LearnedPatterns;
  enableAutoDetection: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BehaviorSignal {
  signalType: string;
  category: "ui" | "ai" | "code" | "workflow";
  data: Record<string, unknown>;
  context?: string;
  sessionId?: string;
}

export interface UserInsights {
  productivity: {
    peakHours: { hour: number; activity: number }[];
    mostProductiveDay: string;
    avgTasksPerDay: number;
    avgSessionLength: number;
  };
  preferences: {
    topLanguages: { language: string; percentage: number }[];
    topTools: { tool: string; usageCount: number }[];
    preferredTaskTypes: { type: string; count: number }[];
  };
  patterns: {
    codeStyleConsistency: number; // 0-100%
    responseTimeAvg: number;
    collaborationScore: number; // 0-100
  };
  recommendations: string[];
}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_CODE_STYLE: CodeStylePreferences = {
  indentation: "spaces",
  indentSize: 2,
  quotes: "double",
  semicolons: true,
  trailingComma: "es5",
  lineWidth: 80,
  bracketSpacing: true,
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  email: true,
  push: true,
  desktop: true,
  taskComplete: true,
  scanComplete: true,
  prMerged: true,
  reviewRequested: true,
  mentionedInComment: true,
  dailyDigest: false,
};

const DEFAULT_LEARNED_PATTERNS: LearnedPatterns = {
  peakHours: [],
  avgSessionLengthMinutes: 0,
  preferredTaskTypes: [],
  mostUsedTools: [],
  commonCodePatterns: {},
  averageResponseTime: 0,
  preferredFilesExtensions: [],
  lastActivityTime: new Date().toISOString(),
};

// =============================================================================
// Service Class
// =============================================================================

class PersonalizationService {
  /**
   * Get or create user preferences
   */
  async getPreferences(userId: string): Promise<UserPreferencesData> {
    let prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.userPreferences.create({
        data: {
          userId,
          codeStyle: DEFAULT_CODE_STYLE,
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
          learnedPatterns: DEFAULT_LEARNED_PATTERNS,
        },
      });
    }

    return this.formatPreferences(prefs);
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<{
      aiVerbosity: string;
      preferredLanguages: string[];
      preferredTools: string[];
      codeStyle: Partial<CodeStylePreferences>;
      notificationPrefs: Partial<NotificationPreferences>;
      quietHoursStart: string | null;
      quietHoursEnd: string | null;
      timezone: string;
      uiDensity: string;
      aiTone: string;
      enableAutoDetection: boolean;
    }>
  ): Promise<UserPreferencesData> {
    // Get existing preferences
    const existing = await this.getPreferences(userId);

    // Merge nested objects
    const codeStyle = updates.codeStyle
      ? { ...existing.codeStyle, ...updates.codeStyle }
      : existing.codeStyle;

    const notificationPrefs = updates.notificationPrefs
      ? { ...existing.notificationPrefs, ...updates.notificationPrefs }
      : existing.notificationPrefs;

    // Update preferences
    const updated = await prisma.userPreferences.update({
      where: { userId },
      data: {
        ...(updates.aiVerbosity && { aiVerbosity: updates.aiVerbosity }),
        ...(updates.preferredLanguages && { preferredLanguages: updates.preferredLanguages }),
        ...(updates.preferredTools && { preferredTools: updates.preferredTools }),
        codeStyle,
        notificationPrefs,
        ...(updates.quietHoursStart !== undefined && { quietHoursStart: updates.quietHoursStart }),
        ...(updates.quietHoursEnd !== undefined && { quietHoursEnd: updates.quietHoursEnd }),
        ...(updates.timezone && { timezone: updates.timezone }),
        ...(updates.uiDensity && { uiDensity: updates.uiDensity }),
        ...(updates.aiTone && { aiTone: updates.aiTone }),
        ...(updates.enableAutoDetection !== undefined && { enableAutoDetection: updates.enableAutoDetection }),
      },
    });

    return this.formatPreferences(updated);
  }

  /**
   * Record a behavior signal
   */
  async recordSignal(userId: string, signal: BehaviorSignal): Promise<void> {
    await prisma.userBehaviorSignal.create({
      data: {
        userId,
        signalType: signal.signalType,
        category: signal.category,
        data: signal.data,
        context: signal.context,
        sessionId: signal.sessionId,
      },
    });

    // Update learned patterns if auto-detection is enabled
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { enableAutoDetection: true },
    });

    if (prefs?.enableAutoDetection) {
      await this.updateLearnedPatterns(userId, signal);
    }
  }

  /**
   * Get user insights based on behavior signals
   */
  async getInsights(userId: string): Promise<UserInsights> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch behavior signals
    const signals = await prisma.userBehaviorSignal.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    // Fetch tasks for productivity analysis
    const tasks = await prisma.task.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        createdAt: true,
        completedAt: true,
        type: true,
        status: true,
      },
    });

    // Analyze peak hours
    const hourActivity = new Map<number, number>();
    for (const signal of signals) {
      const hour = signal.createdAt.getHours();
      hourActivity.set(hour, (hourActivity.get(hour) || 0) + 1);
    }
    const peakHours = Array.from(hourActivity.entries())
      .map(([hour, activity]) => ({ hour, activity }))
      .sort((a, b) => b.activity - a.activity);

    // Calculate most productive day
    const dayActivity = new Map<string, number>();
    for (const task of tasks.filter(t => t.completedAt)) {
      const day = task.completedAt!.toLocaleDateString("en-US", { weekday: "long" });
      dayActivity.set(day, (dayActivity.get(day) || 0) + 1);
    }
    const mostProductiveDay = Array.from(dayActivity.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "No data";

    // Average tasks per day
    const daysWithTasks = new Set(
      tasks.map(t => t.createdAt.toISOString().split("T")[0])
    ).size;
    const avgTasksPerDay = daysWithTasks > 0 ? tasks.length / daysWithTasks : 0;

    // Analyze language preferences
    const languageSignals = signals.filter((s: { signalType: string }) => s.signalType === "language_used");
    const languageCounts = new Map<string, number>();
    for (const signal of languageSignals) {
      const lang = (signal.data as { language?: string }).language;
      if (lang) {
        languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
      }
    }
    const totalLanguageSignals = languageSignals.length || 1;
    const topLanguages = Array.from(languageCounts.entries())
      .map(([language, count]) => ({
        language,
        percentage: Math.round((count / totalLanguageSignals) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5);

    // Analyze tool usage
    const toolSignals = signals.filter((s: { signalType: string }) => s.signalType === "tool_usage");
    const toolCounts = new Map<string, number>();
    for (const signal of toolSignals) {
      const tool = (signal.data as { tool?: string }).tool;
      if (tool) {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      }
    }
    const topTools = Array.from(toolCounts.entries())
      .map(([tool, usageCount]) => ({ tool, usageCount }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5);

    // Analyze task types
    const taskTypeCounts = new Map<string, number>();
    for (const task of tasks) {
      taskTypeCounts.set(task.type, (taskTypeCounts.get(task.type) || 0) + 1);
    }
    const preferredTaskTypes = Array.from(taskTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Calculate session length (estimate based on signal gaps)
    let sessionLengths: number[] = [];
    let currentSessionStart = signals[0]?.createdAt;
    for (let i = 1; i < signals.length; i++) {
      const gap = signals[i - 1].createdAt.getTime() - signals[i].createdAt.getTime();
      if (gap > 30 * 60 * 1000) {
        // 30 min gap = new session
        if (currentSessionStart) {
          sessionLengths.push(
            (currentSessionStart.getTime() - signals[i - 1].createdAt.getTime()) / 60000
          );
        }
        currentSessionStart = signals[i].createdAt;
      }
    }
    const avgSessionLength = sessionLengths.length > 0
      ? Math.round(sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length)
      : 0;

    // Generate recommendations
    const recommendations: string[] = [];
    if (peakHours.length > 0 && peakHours[0].hour >= 9 && peakHours[0].hour <= 17) {
      recommendations.push("Your peak productivity is during business hours. Consider scheduling complex tasks during this time.");
    }
    if (topLanguages.length > 0) {
      recommendations.push(`You work most frequently with ${topLanguages[0].language}. We'll prioritize related suggestions.`);
    }
    if (avgTasksPerDay > 5) {
      recommendations.push("You're highly productive! Consider using batch processing for similar tasks.");
    }

    return {
      productivity: {
        peakHours: peakHours.slice(0, 6),
        mostProductiveDay,
        avgTasksPerDay: Math.round(avgTasksPerDay * 10) / 10,
        avgSessionLength,
      },
      preferences: {
        topLanguages,
        topTools,
        preferredTaskTypes,
      },
      patterns: {
        codeStyleConsistency: 85, // TODO: Calculate from actual code analysis
        responseTimeAvg: 120, // TODO: Calculate from actual response data
        collaborationScore: 75, // TODO: Calculate from collaboration data
      },
      recommendations,
    };
  }

  /**
   * Check if current time is within quiet hours
   */
  async isQuietHours(userId: string): Promise<boolean> {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { quietHoursStart: true, quietHoursEnd: true, timezone: true },
    });

    if (!prefs?.quietHoursStart || !prefs?.quietHoursEnd) {
      return false;
    }

    // Get current time in user's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: prefs.timezone,
    });
    const currentTime = formatter.format(now);

    // Parse times
    const [currentHour, currentMinute] = currentTime.split(":").map(Number);
    const [startHour, startMinute] = prefs.quietHoursStart.split(":").map(Number);
    const [endHour, endMinute] = prefs.quietHoursEnd.split(":").map(Number);

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Get AI system prompt modifications based on user preferences
   */
  async getAIPromptModifications(userId: string): Promise<{
    verbosityInstruction: string;
    toneInstruction: string;
    languageContext: string;
  }> {
    const prefs = await this.getPreferences(userId);

    const verbosityInstructions = {
      minimal: "Be extremely concise. Use bullet points. Avoid explanations unless asked.",
      medium: "Balance conciseness with clarity. Explain key concepts briefly.",
      detailed: "Provide thorough explanations. Include examples and context.",
    };

    const toneInstructions = {
      casual: "Use a friendly, conversational tone. It's okay to be informal.",
      professional: "Maintain a professional but approachable tone.",
      technical: "Use precise technical language. Assume expertise.",
    };

    const languageContext = prefs.preferredLanguages.length > 0
      ? `User's preferred programming languages: ${prefs.preferredLanguages.join(", ")}.`
      : "";

    return {
      verbosityInstruction: verbosityInstructions[prefs.aiVerbosity],
      toneInstruction: toneInstructions[prefs.aiTone],
      languageContext,
    };
  }

  /**
   * Track tool usage for learning
   */
  async trackToolUsage(userId: string, tool: string, context?: string): Promise<void> {
    await this.recordSignal(userId, {
      signalType: "tool_usage",
      category: "workflow",
      data: { tool, timestamp: new Date().toISOString() },
      context,
    });
  }

  /**
   * Track language usage for learning
   */
  async trackLanguageUsage(userId: string, language: string, context?: string): Promise<void> {
    await this.recordSignal(userId, {
      signalType: "language_used",
      category: "code",
      data: { language, timestamp: new Date().toISOString() },
      context,
    });
  }

  /**
   * Track user activity time for learning peak hours
   */
  async trackActivity(userId: string, activityType: string, sessionId?: string): Promise<void> {
    await this.recordSignal(userId, {
      signalType: "time_active",
      category: "workflow",
      data: {
        activityType,
        hour: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        timestamp: new Date().toISOString(),
      },
      sessionId,
    });
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private formatPreferences(prefs: any): UserPreferencesData {
    return {
      id: prefs.id,
      userId: prefs.userId,
      aiVerbosity: prefs.aiVerbosity as "minimal" | "medium" | "detailed",
      preferredLanguages: prefs.preferredLanguages || [],
      preferredTools: prefs.preferredTools || [],
      codeStyle: { ...DEFAULT_CODE_STYLE, ...(prefs.codeStyle as object) },
      notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...(prefs.notificationPrefs as object) },
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
      timezone: prefs.timezone,
      uiDensity: prefs.uiDensity as "compact" | "comfortable" | "spacious",
      aiTone: prefs.aiTone as "casual" | "professional" | "technical",
      learnedPatterns: { ...DEFAULT_LEARNED_PATTERNS, ...(prefs.learnedPatterns as object) },
      enableAutoDetection: prefs.enableAutoDetection,
      createdAt: prefs.createdAt,
      updatedAt: prefs.updatedAt,
    };
  }

  private async updateLearnedPatterns(userId: string, signal: BehaviorSignal): Promise<void> {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { learnedPatterns: true },
    });

    const patterns = {
      ...DEFAULT_LEARNED_PATTERNS,
      ...(prefs?.learnedPatterns as object),
    } as LearnedPatterns;

    // Update based on signal type
    switch (signal.signalType) {
      case "time_active":
        const hour = (signal.data as { hour?: number }).hour;
        if (hour !== undefined && !patterns.peakHours.includes(hour)) {
          patterns.peakHours = [...patterns.peakHours.slice(-5), hour];
        }
        patterns.lastActivityTime = new Date().toISOString();
        break;

      case "tool_usage":
        const tool = (signal.data as { tool?: string }).tool;
        if (tool && !patterns.mostUsedTools.includes(tool)) {
          patterns.mostUsedTools = [...patterns.mostUsedTools.slice(-9), tool];
        }
        break;

      case "language_used":
        const lang = (signal.data as { language?: string }).language;
        if (lang) {
          const ext = this.getExtensionForLanguage(lang);
          if (ext && !patterns.preferredFilesExtensions.includes(ext)) {
            patterns.preferredFilesExtensions = [...patterns.preferredFilesExtensions.slice(-9), ext];
          }
        }
        break;
    }

    await prisma.userPreferences.update({
      where: { userId },
      data: { learnedPatterns: patterns },
    });
  }

  private getExtensionForLanguage(language: string): string | null {
    const extensionMap: Record<string, string> = {
      typescript: ".ts",
      javascript: ".js",
      python: ".py",
      rust: ".rs",
      go: ".go",
      java: ".java",
      cpp: ".cpp",
      c: ".c",
      ruby: ".rb",
      php: ".php",
      swift: ".swift",
      kotlin: ".kt",
    };
    return extensionMap[language.toLowerCase()] || null;
  }
}

export const personalizationService = new PersonalizationService();
