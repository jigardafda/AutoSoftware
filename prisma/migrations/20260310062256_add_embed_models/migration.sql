-- CreateEnum
CREATE TYPE "EmbedScreeningStatus" AS ENUM ('pending', 'screening', 'needs_input', 'scored', 'approved', 'rejected');

-- AlterEnum
ALTER TYPE "TaskSource" ADD VALUE 'embed';

-- CreateTable
CREATE TABLE "EmbedConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL DEFAULT 'Submit a Requirement',
    "welcomeMessage" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#6366f1',
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textColor" TEXT NOT NULL DEFAULT '#1f2937',
    "borderRadius" INTEGER NOT NULL DEFAULT 8,
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "scoreThreshold" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
    "maxFileSize" INTEGER NOT NULL DEFAULT 5,
    "maxTotalSize" INTEGER NOT NULL DEFAULT 25,
    "allowedFileTypes" TEXT[] DEFAULT ARRAY['pdf', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'svg', 'ts', 'js', 'py', 'zip']::TEXT[],
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmbedConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbedSubmission" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inputMethod" TEXT NOT NULL DEFAULT 'text',
    "screeningStatus" "EmbedScreeningStatus" NOT NULL DEFAULT 'pending',
    "screeningScore" DOUBLE PRECISION,
    "screeningReason" TEXT,
    "clarificationRound" INTEGER NOT NULL DEFAULT 0,
    "taskId" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmbedSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbedQuestion" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "questionKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "answer" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EmbedQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmbedConfig_projectId_key" ON "EmbedConfig"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "EmbedSubmission_taskId_key" ON "EmbedSubmission"("taskId");

-- CreateIndex
CREATE INDEX "EmbedSubmission_projectId_sessionToken_idx" ON "EmbedSubmission"("projectId", "sessionToken");

-- CreateIndex
CREATE INDEX "EmbedSubmission_projectId_screeningStatus_idx" ON "EmbedSubmission"("projectId", "screeningStatus");

-- CreateIndex
CREATE INDEX "EmbedQuestion_submissionId_round_idx" ON "EmbedQuestion"("submissionId", "round");

-- AddForeignKey
ALTER TABLE "EmbedConfig" ADD CONSTRAINT "EmbedConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbedSubmission" ADD CONSTRAINT "EmbedSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbedSubmission" ADD CONSTRAINT "EmbedSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbedQuestion" ADD CONSTRAINT "EmbedQuestion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "EmbedSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
