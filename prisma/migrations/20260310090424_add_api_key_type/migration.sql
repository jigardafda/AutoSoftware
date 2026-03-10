-- CreateEnum
CREATE TYPE "ClaudeKeyType" AS ENUM ('api_key', 'oauth_token');

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "keyType" "ClaudeKeyType" NOT NULL DEFAULT 'api_key';

-- CreateTable
CREATE TABLE "TaskLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'execute',
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskLog_taskId_createdAt_idx" ON "TaskLog"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
