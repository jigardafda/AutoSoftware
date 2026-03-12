-- CreateEnum
CREATE TYPE "RefactorType" AS ENUM ('rename', 'move', 'extract', 'inline', 'restructure');

-- CreateEnum
CREATE TYPE "AgentMessageType" AS ENUM ('CLAIM_FILE', 'RELEASE_FILE', 'SYNC_CHANGES', 'REQUEST_REVIEW', 'ACKNOWLEDGE', 'CONFLICT_DETECTED', 'BATCH_COORDINATE');

-- CreateEnum
CREATE TYPE "BatchOperationStatus" AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'cancelled');

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'partial_success';

-- AlterTable
ALTER TABLE "CodeAnalysisResult" ADD COLUMN     "falsePositiveAnalysis" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "languageRuleViolations" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "ScanResult" ADD COLUMN     "languageProfile" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "primaryLanguage" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "buildValidated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "changeBatchIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "generatedTestPaths" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "healingAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "healingMetadata" JSONB,
ADD COLUMN     "multiFileMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partialFixDetails" JSONB,
ADD COLUMN     "refactorType" "RefactorType",
ADD COLUMN     "testsGenerated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserPresence" ADD COLUMN     "activityMeta" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "currentActivity" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "type" "AgentMessageType" NOT NULL,
    "senderId" TEXT NOT NULL,
    "targetId" TEXT,
    "repositoryId" TEXT NOT NULL,
    "filePath" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileLock" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "BatchOperationStatus" NOT NULL DEFAULT 'pending',
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "executionMode" TEXT NOT NULL DEFAULT 'parallel',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BatchOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchOperationTask" (
    "id" TEXT NOT NULL,
    "batchOperationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchOperationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedPR" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "prUrl" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedPR_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentMessage_repositoryId_createdAt_idx" ON "AgentMessage"("repositoryId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentMessage_senderId_idx" ON "AgentMessage"("senderId");

-- CreateIndex
CREATE INDEX "AgentMessage_targetId_idx" ON "AgentMessage"("targetId");

-- CreateIndex
CREATE INDEX "AgentMessage_type_createdAt_idx" ON "AgentMessage"("type", "createdAt");

-- CreateIndex
CREATE INDEX "FileLock_agentId_idx" ON "FileLock"("agentId");

-- CreateIndex
CREATE INDEX "FileLock_expiresAt_idx" ON "FileLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileLock_repositoryId_filePath_key" ON "FileLock"("repositoryId", "filePath");

-- CreateIndex
CREATE INDEX "BatchOperation_userId_status_idx" ON "BatchOperation"("userId", "status");

-- CreateIndex
CREATE INDEX "BatchOperation_createdAt_idx" ON "BatchOperation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BatchOperationTask_taskId_key" ON "BatchOperationTask"("taskId");

-- CreateIndex
CREATE INDEX "BatchOperationTask_batchOperationId_order_idx" ON "BatchOperationTask"("batchOperationId", "order");

-- CreateIndex
CREATE INDEX "LinkedPR_batchId_idx" ON "LinkedPR"("batchId");

-- CreateIndex
CREATE INDEX "LinkedPR_repositoryId_idx" ON "LinkedPR"("repositoryId");

-- AddForeignKey
ALTER TABLE "BatchOperationTask" ADD CONSTRAINT "BatchOperationTask_batchOperationId_fkey" FOREIGN KEY ("batchOperationId") REFERENCES "BatchOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchOperationTask" ADD CONSTRAINT "BatchOperationTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchOperationTask" ADD CONSTRAINT "BatchOperationTask_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
