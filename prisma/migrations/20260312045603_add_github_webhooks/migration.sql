-- CreateEnum
CREATE TYPE "WebhookProvider" AS ENUM ('github', 'linear', 'jira');

-- CreateTable
CREATE TABLE "WebhookConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "WebhookProvider" NOT NULL,
    "secret" TEXT NOT NULL,
    "repositoryId" TEXT,
    "projectId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "webhookConfigId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "deliveryId" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "action" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookConfig_userId_idx" ON "WebhookConfig"("userId");

-- CreateIndex
CREATE INDEX "WebhookConfig_repositoryId_idx" ON "WebhookConfig"("repositoryId");

-- CreateIndex
CREATE INDEX "WebhookConfig_projectId_idx" ON "WebhookConfig"("projectId");

-- CreateIndex
CREATE INDEX "WebhookEvent_webhookConfigId_createdAt_idx" ON "WebhookEvent"("webhookConfigId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");

-- AddForeignKey
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_webhookConfigId_fkey" FOREIGN KEY ("webhookConfigId") REFERENCES "WebhookConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
