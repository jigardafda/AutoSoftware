/*
  Warnings:

  - You are about to drop the `AgentMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FileLock` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TaskStepStatus" AS ENUM ('pending', 'in_progress', 'completed', 'skipped', 'failed');

-- DropTable
DROP TABLE "AgentMessage";

-- DropTable
DROP TABLE "FileLock";

-- DropEnum
DROP TYPE "AgentMessageType";

-- CreateTable
CREATE TABLE "TaskStep" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStepStatus" NOT NULL DEFAULT 'pending',
    "order" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskStep_taskId_order_idx" ON "TaskStep"("taskId", "order");

-- AddForeignKey
ALTER TABLE "TaskStep" ADD CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
