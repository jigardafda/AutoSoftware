-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskStatus" ADD VALUE 'planning';
ALTER TYPE "TaskStatus" ADD VALUE 'awaiting_input';
ALTER TYPE "TaskStatus" ADD VALUE 'planned';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "enhancedPlan" TEXT,
ADD COLUMN     "planningRound" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlanningQuestion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "questionKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "answer" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningQuestion_taskId_round_idx" ON "PlanningQuestion"("taskId", "round");

-- AddForeignKey
ALTER TABLE "PlanningQuestion" ADD CONSTRAINT "PlanningQuestion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
