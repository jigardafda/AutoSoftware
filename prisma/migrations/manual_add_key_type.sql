-- Manual migration: Add keyType to ApiKey model + TaskLog table
-- This allows users to store either API keys or OAuth tokens

-- Create the enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "ClaudeKeyType" AS ENUM ('api_key', 'oauth_token');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add the keyType column with default value
ALTER TABLE "ApiKey"
ADD COLUMN IF NOT EXISTS "keyType" "ClaudeKeyType" NOT NULL DEFAULT 'api_key';

-- Create TaskLog table for live session streaming
CREATE TABLE IF NOT EXISTS "TaskLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'execute',
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLog_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
DO $$ BEGIN
    ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create index for efficient log queries
CREATE INDEX IF NOT EXISTS "TaskLog_taskId_createdAt_idx" ON "TaskLog"("taskId", "createdAt");
