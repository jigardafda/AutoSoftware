-- CreateEnum
CREATE TYPE "PluginScope" AS ENUM ('global', 'project');

-- CreateTable
CREATE TABLE "PluginMarketplace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetched" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluginMarketplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalledPlugin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "scope" "PluginScope" NOT NULL DEFAULT 'global',
    "pluginId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL,
    "author" TEXT,
    "repoUrl" TEXT NOT NULL,
    "iconUrl" TEXT,
    "manifest" JSONB NOT NULL DEFAULT '{}',
    "skillsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "agentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hooksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mcpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstalledPlugin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PluginMarketplace_userId_idx" ON "PluginMarketplace"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginMarketplace_userId_url_key" ON "PluginMarketplace"("userId", "url");

-- CreateIndex
CREATE INDEX "InstalledPlugin_userId_scope_idx" ON "InstalledPlugin"("userId", "scope");

-- CreateIndex
CREATE INDEX "InstalledPlugin_projectId_idx" ON "InstalledPlugin"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledPlugin_userId_pluginId_projectId_key" ON "InstalledPlugin"("userId", "pluginId", "projectId");

-- AddForeignKey
ALTER TABLE "PluginMarketplace" ADD CONSTRAINT "PluginMarketplace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledPlugin" ADD CONSTRAINT "InstalledPlugin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledPlugin" ADD CONSTRAINT "InstalledPlugin_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
