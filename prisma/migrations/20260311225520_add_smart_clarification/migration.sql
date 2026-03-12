-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "approaches" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "selectedApproach" INTEGER;

-- CreateTable
CREATE TABLE "ClarificationHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "preferenceKey" TEXT NOT NULL,
    "preferenceValue" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClarificationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClarificationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "answers" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ClarificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClarificationHistory_userId_projectId_idx" ON "ClarificationHistory"("userId", "projectId");

-- CreateIndex
CREATE INDEX "ClarificationHistory_repositoryId_idx" ON "ClarificationHistory"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ClarificationHistory_userId_projectId_preferenceKey_key" ON "ClarificationHistory"("userId", "projectId", "preferenceKey");

-- CreateIndex
CREATE INDEX "ClarificationSession_userId_status_idx" ON "ClarificationSession"("userId", "status");

-- CreateIndex
CREATE INDEX "ClarificationSession_projectId_idx" ON "ClarificationSession"("projectId");
