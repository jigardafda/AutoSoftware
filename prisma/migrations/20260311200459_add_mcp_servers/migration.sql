-- CreateEnum
CREATE TYPE "McpServerStatus" AS ENUM ('pending', 'active', 'error', 'disabled');

-- CreateTable
CREATE TABLE "McpServer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "transportType" TEXT NOT NULL DEFAULT 'http-stream',
    "status" "McpServerStatus" NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "toolCount" INTEGER NOT NULL DEFAULT 0,
    "authType" TEXT,
    "encryptedToken" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpServer_userId_isEnabled_idx" ON "McpServer"("userId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "McpServer_userId_url_key" ON "McpServer"("userId", "url");

-- AddForeignKey
ALTER TABLE "McpServer" ADD CONSTRAINT "McpServer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
