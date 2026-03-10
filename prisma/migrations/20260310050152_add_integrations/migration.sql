-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('linear', 'github_issues', 'jira', 'sentry', 'azure_devops', 'asana');

-- CreateEnum
CREATE TYPE "IntegrationAuthType" AS ENUM ('oauth2', 'api_token');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('connected', 'error', 'expired');

-- AlterEnum
ALTER TYPE "TaskSource" ADD VALUE 'external_import';

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "authType" "IntegrationAuthType" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'connected',
    "displayName" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "providerAccountId" TEXT,
    "accountEmail" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLink" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "externalProjectId" TEXT NOT NULL,
    "externalProjectName" TEXT NOT NULL,
    "externalProjectKey" TEXT NOT NULL DEFAULT '',
    "externalProjectUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskExternalLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "integrationLinkId" TEXT NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "externalItemUrl" TEXT,
    "externalItemType" TEXT,
    "importedData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_provider_providerAccountId_key" ON "Integration"("userId", "provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "IntegrationLink_projectId_idx" ON "IntegrationLink"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationLink_integrationId_externalProjectId_projectId_key" ON "IntegrationLink"("integrationId", "externalProjectId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExternalLink_taskId_key" ON "TaskExternalLink"("taskId");

-- CreateIndex
CREATE INDEX "TaskExternalLink_taskId_idx" ON "TaskExternalLink"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskExternalLink_integrationLinkId_externalItemId_key" ON "TaskExternalLink"("integrationLinkId", "externalItemId");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationLink" ADD CONSTRAINT "IntegrationLink_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationLink" ADD CONSTRAINT "IntegrationLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExternalLink" ADD CONSTRAINT "TaskExternalLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskExternalLink" ADD CONSTRAINT "TaskExternalLink_integrationLinkId_fkey" FOREIGN KEY ("integrationLinkId") REFERENCES "IntegrationLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
