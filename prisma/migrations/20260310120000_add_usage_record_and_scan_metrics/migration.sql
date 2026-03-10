-- AlterTable: Add scan metrics columns
ALTER TABLE "ScanResult" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "ScanResult" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "ScanResult" ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScanResult" ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScanResult" ADD COLUMN IF NOT EXISTS "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Set default for status to queued (may already be done)
ALTER TABLE "ScanResult" ALTER COLUMN "status" SET DEFAULT 'queued';

-- CreateTable: UsageRecord for independent usage tracking
CREATE TABLE IF NOT EXISTS "UsageRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT,
    "projectId" TEXT,
    "apiKeyId" TEXT,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'api_key',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageRecord_userId_createdAt_idx" ON "UsageRecord"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "UsageRecord_repositoryId_createdAt_idx" ON "UsageRecord"("repositoryId", "createdAt");
CREATE INDEX IF NOT EXISTS "UsageRecord_projectId_createdAt_idx" ON "UsageRecord"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "UsageRecord_source_createdAt_idx" ON "UsageRecord"("source", "createdAt");
