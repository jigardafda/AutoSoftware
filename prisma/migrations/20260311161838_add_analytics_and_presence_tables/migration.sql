-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "allocatedPort" INTEGER,
ADD COLUMN     "architecturePattern" TEXT,
ADD COLUMN     "confidenceScore" DOUBLE PRECISION,
ADD COLUMN     "dryRunOutput" JSONB,
ADD COLUMN     "executionMode" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN     "falsePositiveRisk" DOUBLE PRECISION,
ADD COLUMN     "lintPassing" BOOLEAN,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "severityLevel" TEXT,
ADD COLUMN     "testsPassing" BOOLEAN;

-- CreateTable
CREATE TABLE "CodeChangeMetrics" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "projectId" TEXT,
    "linesAdded" INTEGER NOT NULL DEFAULT 0,
    "linesDeleted" INTEGER NOT NULL DEFAULT 0,
    "filesChanged" INTEGER NOT NULL DEFAULT 0,
    "fileBreakdown" JSONB NOT NULL DEFAULT '[]',
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeChangeMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineeringTimeSaved" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "projectId" TEXT,
    "estimatedMinutesSaved" INTEGER NOT NULL DEFAULT 0,
    "locFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complexityFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "contextFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "methodologyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineeringTimeSaved_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPresence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "currentView" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeAnalysisResult" (
    "id" TEXT NOT NULL,
    "scanResultId" TEXT NOT NULL,
    "architecturePattern" TEXT,
    "dependencies" JSONB NOT NULL DEFAULT '[]',
    "deadCodePaths" JSONB NOT NULL DEFAULT '[]',
    "duplications" JSONB NOT NULL DEFAULT '[]',
    "performanceIssues" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeAnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectConvention" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "indentStyle" TEXT,
    "quoteStyle" TEXT,
    "namingConvention" TEXT,
    "frameworkPatterns" JSONB NOT NULL DEFAULT '[]',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectConvention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodeChangeMetrics_taskId_key" ON "CodeChangeMetrics"("taskId");

-- CreateIndex
CREATE INDEX "CodeChangeMetrics_userId_createdAt_idx" ON "CodeChangeMetrics"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CodeChangeMetrics_repositoryId_createdAt_idx" ON "CodeChangeMetrics"("repositoryId", "createdAt");

-- CreateIndex
CREATE INDEX "CodeChangeMetrics_projectId_createdAt_idx" ON "CodeChangeMetrics"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EngineeringTimeSaved_taskId_key" ON "EngineeringTimeSaved"("taskId");

-- CreateIndex
CREATE INDEX "EngineeringTimeSaved_userId_createdAt_idx" ON "EngineeringTimeSaved"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EngineeringTimeSaved_repositoryId_createdAt_idx" ON "EngineeringTimeSaved"("repositoryId", "createdAt");

-- CreateIndex
CREATE INDEX "EngineeringTimeSaved_projectId_createdAt_idx" ON "EngineeringTimeSaved"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPresence_userId_key" ON "UserPresence"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CodeAnalysisResult_scanResultId_key" ON "CodeAnalysisResult"("scanResultId");

-- CreateIndex
CREATE INDEX "CodeAnalysisResult_scanResultId_idx" ON "CodeAnalysisResult"("scanResultId");

-- CreateIndex
CREATE INDEX "ProjectConvention_repositoryId_idx" ON "ProjectConvention"("repositoryId");

-- AddForeignKey
ALTER TABLE "CodeChangeMetrics" ADD CONSTRAINT "CodeChangeMetrics_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineeringTimeSaved" ADD CONSTRAINT "EngineeringTimeSaved_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPresence" ADD CONSTRAINT "UserPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeAnalysisResult" ADD CONSTRAINT "CodeAnalysisResult_scanResultId_fkey" FOREIGN KEY ("scanResultId") REFERENCES "ScanResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectConvention" ADD CONSTRAINT "ProjectConvention_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
