-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('upvote', 'downvote');

-- CreateEnum
CREATE TYPE "DependencyEcosystem" AS ENUM ('npm', 'pypi', 'maven', 'go', 'cargo', 'nuget', 'gem', 'composer');

-- CreateEnum
CREATE TYPE "DependencyAlertSeverity" AS ENUM ('low', 'moderate', 'high', 'critical');

-- CreateEnum
CREATE TYPE "DependencyAlertType" AS ENUM ('security', 'breaking_change', 'unmaintained', 'deprecated', 'license_change', 'upgrade_available');

-- CreateEnum
CREATE TYPE "DependencyAlertStatus" AS ENUM ('active', 'dismissed', 'resolved', 'auto_resolved');

-- CreateEnum
CREATE TYPE "HealthMetricType" AS ENUM ('complexity', 'duplication', 'test_coverage', 'documentation', 'maintainability', 'security', 'dependencies', 'churn');

-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('positive', 'negative', 'neutral');

-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('architecture', 'convention', 'decision', 'learning', 'context');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('task_complete', 'task_failed', 'scan_done', 'scan_failed', 'mention', 'alert', 'system', 'dependency_alert', 'pr_status');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('creating', 'active', 'paused', 'completed', 'error');

-- AlterEnum
ALTER TYPE "OAuthProvider" ADD VALUE 'local';

-- AlterEnum
ALTER TYPE "TaskSource" ADD VALUE 'ai_assistant';

-- AlterTable
ALTER TABLE "ChatArtifact" ALTER COLUMN "messageId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "thinking" JSONB;

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "localPath" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "forkDepth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "forkReason" TEXT,
ADD COLUMN     "parentTaskId" TEXT;

-- CreateTable
CREATE TABLE "TaskExecutionLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "stream" TEXT,
    "data" TEXT,
    "operation" TEXT,
    "filePath" TEXT,
    "diff" TEXT,
    "language" TEXT,

    CONSTRAINT "TaskExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApproachComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "approachIdx" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "parentId" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApproachComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApproachVote" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "approachIdx" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "voteType" "VoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApproachVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningCursor" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewportSection" TEXT,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentionNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mentionedBy" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "commentId" TEXT,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentionNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencySnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "branch" TEXT,
    "ecosystem" "DependencyEcosystem" NOT NULL,
    "manifestPath" TEXT NOT NULL,
    "dependencies" JSONB NOT NULL,
    "lockfileHash" TEXT,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DependencySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependencyAlert" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ecosystem" "DependencyEcosystem" NOT NULL,
    "packageName" TEXT NOT NULL,
    "currentVersion" TEXT NOT NULL,
    "alertType" "DependencyAlertType" NOT NULL,
    "severity" "DependencyAlertSeverity" NOT NULL,
    "status" "DependencyAlertStatus" NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedVersions" TEXT,
    "patchedVersion" TEXT,
    "cveId" TEXT,
    "cvssScore" DOUBLE PRECISION,
    "recommendedVersion" TEXT,
    "upgradePath" JSONB,
    "breakingChanges" JSONB,
    "migrationGuide" TEXT,
    "sourceUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "dismissedReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DependencyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageMetadataCache" (
    "id" TEXT NOT NULL,
    "ecosystem" "DependencyEcosystem" NOT NULL,
    "packageName" TEXT NOT NULL,
    "latestVersion" TEXT,
    "latestStableVersion" TEXT,
    "lastPublishDate" TIMESTAMP(3),
    "isDeprecated" BOOLEAN NOT NULL DEFAULT false,
    "deprecationMessage" TEXT,
    "repositoryUrl" TEXT,
    "homepage" TEXT,
    "license" TEXT,
    "versions" JSONB NOT NULL DEFAULT '[]',
    "advisories" JSONB NOT NULL DEFAULT '[]',
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageMetadataCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeHealthSnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "branch" TEXT,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "complexityScore" DOUBLE PRECISION NOT NULL,
    "duplicationScore" DOUBLE PRECISION NOT NULL,
    "coverageScore" DOUBLE PRECISION NOT NULL,
    "maintainabilityScore" DOUBLE PRECISION NOT NULL,
    "securityScore" DOUBLE PRECISION NOT NULL,
    "dependencyScore" DOUBLE PRECISION NOT NULL,
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "avgComplexity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duplicationPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "testCoveragePct" DOUBLE PRECISION,
    "docCoveragePct" DOUBLE PRECISION,
    "technicalDebtHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "codeSmellCount" INTEGER NOT NULL DEFAULT 0,
    "bugRiskCount" INTEGER NOT NULL DEFAULT 0,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analysisVersion" TEXT NOT NULL DEFAULT '1.0',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CodeHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeHotspot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "branch" TEXT,
    "filePath" TEXT NOT NULL,
    "changeCount" INTEGER NOT NULL DEFAULT 0,
    "additionCount" INTEGER NOT NULL DEFAULT 0,
    "deletionCount" INTEGER NOT NULL DEFAULT 0,
    "authorCount" INTEGER NOT NULL DEFAULT 0,
    "complexity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "testCoverage" DOUBLE PRECISION,
    "bugFixCount" INTEGER NOT NULL DEFAULT 0,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CodeHotspot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeQualityTrend" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "branch" TEXT,
    "metricType" "HealthMetricType" NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" DOUBLE PRECISION NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "changePercent" DOUBLE PRECISION,
    "commitHash" TEXT,
    "taskId" TEXT,

    CONSTRAINT "CodeQualityTrend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectHealthSummary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "avgComplexity" DOUBLE PRECISION NOT NULL,
    "avgCoverage" DOUBLE PRECISION NOT NULL,
    "avgMaintainability" DOUBLE PRECISION NOT NULL,
    "totalRepositories" INTEGER NOT NULL DEFAULT 0,
    "totalHotspots" INTEGER NOT NULL DEFAULT 0,
    "criticalHotspots" INTEGER NOT NULL DEFAULT 0,
    "scoreTrend" TEXT NOT NULL DEFAULT 'stable',
    "trendPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectHealthSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProactiveSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "affectedFiles" JSONB NOT NULL DEFAULT '[]',
    "relatedTaskId" TEXT,
    "relatedPatternId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "estimatedImpact" JSONB NOT NULL DEFAULT '{}',
    "suggestedActions" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ProactiveSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "rating" "FeedbackRating" NOT NULL,
    "taskId" TEXT,
    "messageId" TEXT,
    "pullRequestUrl" TEXT,
    "approachIndex" INTEGER,
    "suggestionType" TEXT NOT NULL DEFAULT '',
    "context" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnedPattern" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "projectId" TEXT,
    "pattern" TEXT NOT NULL,
    "patternHash" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "actionable" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnedPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RejectionMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "projectId" TEXT,
    "rejectionReason" TEXT NOT NULL,
    "rejectionHash" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "fixAttempted" TEXT NOT NULL,
    "learnedAction" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastOccurred" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RejectionMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABExperiment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "variantA" JSONB NOT NULL,
    "variantB" JSONB NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 20,
    "currentSampleA" INTEGER NOT NULL DEFAULT 0,
    "currentSampleB" INTEGER NOT NULL DEFAULT 0,
    "resultsA" JSONB NOT NULL DEFAULT '{}',
    "resultsB" JSONB NOT NULL DEFAULT '{}',
    "winner" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ABExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ABTestResult" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "executionTimeMs" INTEGER NOT NULL,
    "prApproved" BOOLEAN,
    "userSatisfaction" DOUBLE PRECISION,
    "codeQualityScore" DOUBLE PRECISION,
    "revisions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ABTestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMemory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "repositoryId" TEXT,
    "userId" TEXT NOT NULL,
    "category" "MemoryCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 5,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedTaskIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding" DOUBLE PRECISION[],
    "embeddingModel" TEXT,
    "isConsolidated" BOOLEAN NOT NULL DEFAULT false,
    "consolidatedAt" TIMESTAMP(3),
    "sourceMemoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trigger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "lastTriggeredAt" TIMESTAMP(3),
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "repositoryId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerExecution" (
    "id" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputData" JSONB NOT NULL,
    "outputData" JSONB,
    "error" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,

    CONSTRAINT "TriggerExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityId" TEXT,
    "entityType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPing" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "message" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aiVerbosity" TEXT NOT NULL DEFAULT 'medium',
    "preferredLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "codeStyle" JSONB NOT NULL DEFAULT '{}',
    "notificationPrefs" JSONB NOT NULL DEFAULT '{}',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "uiDensity" TEXT NOT NULL DEFAULT 'comfortable',
    "aiTone" TEXT NOT NULL DEFAULT 'professional',
    "learnedPatterns" JSONB NOT NULL DEFAULT '{}',
    "enableAutoDetection" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBehaviorSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "context" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBehaviorSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taskComplete" BOOLEAN NOT NULL DEFAULT true,
    "taskFailed" BOOLEAN NOT NULL DEFAULT true,
    "scanDone" BOOLEAN NOT NULL DEFAULT true,
    "scanFailed" BOOLEAN NOT NULL DEFAULT true,
    "mentions" BOOLEAN NOT NULL DEFAULT true,
    "alerts" BOOLEAN NOT NULL DEFAULT true,
    "systemNotifications" BOOLEAN NOT NULL DEFAULT true,
    "dependencyAlerts" BOOLEAN NOT NULL DEFAULT true,
    "prStatus" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT NOT NULL,
    "taskPositions" JSONB NOT NULL DEFAULT '{}',
    "connections" JSONB NOT NULL DEFAULT '[]',
    "groups" JSONB NOT NULL DEFAULT '[]',
    "zoom" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "viewportX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewportY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMetric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "feedbackType" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptRefinement" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "originalPattern" TEXT NOT NULL,
    "suggestedChange" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptRefinement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "repositoryId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'creating',
    "agentId" TEXT NOT NULL DEFAULT 'claude-code',
    "agentModel" TEXT,
    "worktreePath" TEXT,
    "worktreeBranch" TEXT,
    "localPath" TEXT,
    "devServerPort" INTEGER,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentPid" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskExecutionLog_taskId_timestamp_idx" ON "TaskExecutionLog"("taskId", "timestamp");

-- CreateIndex
CREATE INDEX "TaskExecutionLog_taskId_type_idx" ON "TaskExecutionLog"("taskId", "type");

-- CreateIndex
CREATE INDEX "ApproachComment_taskId_approachIdx_idx" ON "ApproachComment"("taskId", "approachIdx");

-- CreateIndex
CREATE INDEX "ApproachComment_userId_idx" ON "ApproachComment"("userId");

-- CreateIndex
CREATE INDEX "ApproachComment_parentId_idx" ON "ApproachComment"("parentId");

-- CreateIndex
CREATE INDEX "ApproachVote_taskId_approachIdx_idx" ON "ApproachVote"("taskId", "approachIdx");

-- CreateIndex
CREATE UNIQUE INDEX "ApproachVote_taskId_approachIdx_userId_key" ON "ApproachVote"("taskId", "approachIdx", "userId");

-- CreateIndex
CREATE INDEX "PlanningCursor_taskId_idx" ON "PlanningCursor"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningCursor_taskId_userId_key" ON "PlanningCursor"("taskId", "userId");

-- CreateIndex
CREATE INDEX "MentionNotification_userId_isRead_idx" ON "MentionNotification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "MentionNotification_taskId_idx" ON "MentionNotification"("taskId");

-- CreateIndex
CREATE INDEX "DependencySnapshot_repositoryId_ecosystem_idx" ON "DependencySnapshot"("repositoryId", "ecosystem");

-- CreateIndex
CREATE INDEX "DependencySnapshot_repositoryId_branch_idx" ON "DependencySnapshot"("repositoryId", "branch");

-- CreateIndex
CREATE INDEX "DependencyAlert_repositoryId_status_idx" ON "DependencyAlert"("repositoryId", "status");

-- CreateIndex
CREATE INDEX "DependencyAlert_userId_status_idx" ON "DependencyAlert"("userId", "status");

-- CreateIndex
CREATE INDEX "DependencyAlert_severity_status_idx" ON "DependencyAlert"("severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DependencyAlert_repositoryId_ecosystem_packageName_alertTyp_key" ON "DependencyAlert"("repositoryId", "ecosystem", "packageName", "alertType", "currentVersion");

-- CreateIndex
CREATE INDEX "PackageMetadataCache_ecosystem_packageName_idx" ON "PackageMetadataCache"("ecosystem", "packageName");

-- CreateIndex
CREATE INDEX "PackageMetadataCache_expiresAt_idx" ON "PackageMetadataCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackageMetadataCache_ecosystem_packageName_key" ON "PackageMetadataCache"("ecosystem", "packageName");

-- CreateIndex
CREATE INDEX "CodeHealthSnapshot_repositoryId_analyzedAt_idx" ON "CodeHealthSnapshot"("repositoryId", "analyzedAt");

-- CreateIndex
CREATE INDEX "CodeHealthSnapshot_repositoryId_branch_analyzedAt_idx" ON "CodeHealthSnapshot"("repositoryId", "branch", "analyzedAt");

-- CreateIndex
CREATE INDEX "CodeHotspot_repositoryId_riskLevel_idx" ON "CodeHotspot"("repositoryId", "riskLevel");

-- CreateIndex
CREATE INDEX "CodeHotspot_repositoryId_branch_idx" ON "CodeHotspot"("repositoryId", "branch");

-- CreateIndex
CREATE INDEX "CodeHotspot_riskScore_idx" ON "CodeHotspot"("riskScore");

-- CreateIndex
CREATE UNIQUE INDEX "CodeHotspot_repositoryId_branch_filePath_key" ON "CodeHotspot"("repositoryId", "branch", "filePath");

-- CreateIndex
CREATE INDEX "CodeQualityTrend_repositoryId_metricType_date_idx" ON "CodeQualityTrend"("repositoryId", "metricType", "date");

-- CreateIndex
CREATE INDEX "CodeQualityTrend_repositoryId_branch_date_idx" ON "CodeQualityTrend"("repositoryId", "branch", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CodeQualityTrend_repositoryId_branch_metricType_date_key" ON "CodeQualityTrend"("repositoryId", "branch", "metricType", "date");

-- CreateIndex
CREATE INDEX "ProjectHealthSummary_projectId_idx" ON "ProjectHealthSummary"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectHealthSummary_projectId_key" ON "ProjectHealthSummary"("projectId");

-- CreateIndex
CREATE INDEX "ProactiveSuggestion_userId_status_idx" ON "ProactiveSuggestion"("userId", "status");

-- CreateIndex
CREATE INDEX "ProactiveSuggestion_repositoryId_status_idx" ON "ProactiveSuggestion"("repositoryId", "status");

-- CreateIndex
CREATE INDEX "ProactiveSuggestion_type_priority_idx" ON "ProactiveSuggestion"("type", "priority");

-- CreateIndex
CREATE INDEX "ProactiveSuggestion_relatedTaskId_idx" ON "ProactiveSuggestion"("relatedTaskId");

-- CreateIndex
CREATE INDEX "ProactiveSuggestion_expiresAt_idx" ON "ProactiveSuggestion"("expiresAt");

-- CreateIndex
CREATE INDEX "FeedbackSignal_userId_repositoryId_idx" ON "FeedbackSignal"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "FeedbackSignal_userId_createdAt_idx" ON "FeedbackSignal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackSignal_repositoryId_type_idx" ON "FeedbackSignal"("repositoryId", "type");

-- CreateIndex
CREATE INDEX "FeedbackSignal_taskId_idx" ON "FeedbackSignal"("taskId");

-- CreateIndex
CREATE INDEX "LearnedPattern_userId_repositoryId_idx" ON "LearnedPattern"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "LearnedPattern_userId_category_idx" ON "LearnedPattern"("userId", "category");

-- CreateIndex
CREATE INDEX "LearnedPattern_confidence_idx" ON "LearnedPattern"("confidence");

-- CreateIndex
CREATE UNIQUE INDEX "LearnedPattern_userId_repositoryId_patternHash_key" ON "LearnedPattern"("userId", "repositoryId", "patternHash");

-- CreateIndex
CREATE INDEX "RejectionMemory_userId_repositoryId_idx" ON "RejectionMemory"("userId", "repositoryId");

-- CreateIndex
CREATE INDEX "RejectionMemory_occurrences_idx" ON "RejectionMemory"("occurrences");

-- CreateIndex
CREATE UNIQUE INDEX "RejectionMemory_userId_repositoryId_rejectionHash_key" ON "RejectionMemory"("userId", "repositoryId", "rejectionHash");

-- CreateIndex
CREATE INDEX "ABExperiment_userId_status_idx" ON "ABExperiment"("userId", "status");

-- CreateIndex
CREATE INDEX "ABExperiment_repositoryId_idx" ON "ABExperiment"("repositoryId");

-- CreateIndex
CREATE INDEX "ABExperiment_projectId_idx" ON "ABExperiment"("projectId");

-- CreateIndex
CREATE INDEX "ABTestResult_experimentId_idx" ON "ABTestResult"("experimentId");

-- CreateIndex
CREATE INDEX "ABTestResult_variant_idx" ON "ABTestResult"("variant");

-- CreateIndex
CREATE INDEX "ABTestResult_taskId_idx" ON "ABTestResult"("taskId");

-- CreateIndex
CREATE INDEX "ProjectMemory_projectId_idx" ON "ProjectMemory"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMemory_repositoryId_idx" ON "ProjectMemory"("repositoryId");

-- CreateIndex
CREATE INDEX "ProjectMemory_userId_idx" ON "ProjectMemory"("userId");

-- CreateIndex
CREATE INDEX "ProjectMemory_category_idx" ON "ProjectMemory"("category");

-- CreateIndex
CREATE INDEX "ProjectMemory_importance_idx" ON "ProjectMemory"("importance");

-- CreateIndex
CREATE INDEX "ProjectMemory_createdAt_idx" ON "ProjectMemory"("createdAt");

-- CreateIndex
CREATE INDEX "Trigger_userId_enabled_idx" ON "Trigger"("userId", "enabled");

-- CreateIndex
CREATE INDEX "Trigger_triggerType_idx" ON "Trigger"("triggerType");

-- CreateIndex
CREATE INDEX "Trigger_repositoryId_idx" ON "Trigger"("repositoryId");

-- CreateIndex
CREATE INDEX "Trigger_projectId_idx" ON "Trigger"("projectId");

-- CreateIndex
CREATE INDEX "TriggerExecution_triggerId_executedAt_idx" ON "TriggerExecution"("triggerId", "executedAt");

-- CreateIndex
CREATE INDEX "TriggerExecution_status_idx" ON "TriggerExecution"("status");

-- CreateIndex
CREATE INDEX "TeamActivity_userId_createdAt_idx" ON "TeamActivity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamActivity_createdAt_idx" ON "TeamActivity"("createdAt");

-- CreateIndex
CREATE INDEX "TeamActivity_type_idx" ON "TeamActivity"("type");

-- CreateIndex
CREATE INDEX "TeamPing_toUserId_read_idx" ON "TeamPing"("toUserId", "read");

-- CreateIndex
CREATE INDEX "TeamPing_fromUserId_idx" ON "TeamPing"("fromUserId");

-- CreateIndex
CREATE INDEX "TeamPing_createdAt_idx" ON "TeamPing"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE INDEX "UserBehaviorSignal_userId_createdAt_idx" ON "UserBehaviorSignal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserBehaviorSignal_userId_signalType_idx" ON "UserBehaviorSignal"("userId", "signalType");

-- CreateIndex
CREATE INDEX "UserBehaviorSignal_userId_category_idx" ON "UserBehaviorSignal"("userId", "category");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_endpoint_key" ON "PushSubscription"("userId", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasState_projectId_userId_key" ON "CanvasState"("projectId", "userId");

-- CreateIndex
CREATE INDEX "AIMetric_userId_metricType_createdAt_idx" ON "AIMetric"("userId", "metricType", "createdAt");

-- CreateIndex
CREATE INDEX "AIMetric_entityType_entityId_idx" ON "AIMetric"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AIMetric_metricType_createdAt_idx" ON "AIMetric"("metricType", "createdAt");

-- CreateIndex
CREATE INDEX "AIFeedback_entityType_entityId_idx" ON "AIFeedback"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AIFeedback_userId_createdAt_idx" ON "AIFeedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIFeedback_feedbackType_createdAt_idx" ON "AIFeedback"("feedbackType", "createdAt");

-- CreateIndex
CREATE INDEX "PromptRefinement_category_appliedAt_idx" ON "PromptRefinement"("category", "appliedAt");

-- CreateIndex
CREATE INDEX "PromptRefinement_failureCount_idx" ON "PromptRefinement"("failureCount");

-- CreateIndex
CREATE INDEX "Workspace_userId_status_idx" ON "Workspace"("userId", "status");

-- CreateIndex
CREATE INDEX "WorkspaceSession_workspaceId_idx" ON "WorkspaceSession"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceMessage_sessionId_createdAt_idx" ON "WorkspaceMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExecutionLog" ADD CONSTRAINT "TaskExecutionLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachComment" ADD CONSTRAINT "ApproachComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachComment" ADD CONSTRAINT "ApproachComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ApproachComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachVote" ADD CONSTRAINT "ApproachVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningCursor" ADD CONSTRAINT "PlanningCursor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentionNotification" ADD CONSTRAINT "MentionNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencySnapshot" ADD CONSTRAINT "DependencySnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyAlert" ADD CONSTRAINT "DependencyAlert_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependencyAlert" ADD CONSTRAINT "DependencyAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeHealthSnapshot" ADD CONSTRAINT "CodeHealthSnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeHotspot" ADD CONSTRAINT "CodeHotspot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProactiveSuggestion" ADD CONSTRAINT "ProactiveSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProactiveSuggestion" ADD CONSTRAINT "ProactiveSuggestion_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProactiveSuggestion" ADD CONSTRAINT "ProactiveSuggestion_relatedTaskId_fkey" FOREIGN KEY ("relatedTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ABTestResult" ADD CONSTRAINT "ABTestResult_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ABExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamActivity" ADD CONSTRAINT "TeamActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPing" ADD CONSTRAINT "TeamPing_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPing" ADD CONSTRAINT "TeamPing_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasState" ADD CONSTRAINT "CanvasState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMessage" ADD CONSTRAINT "WorkspaceMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkspaceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
