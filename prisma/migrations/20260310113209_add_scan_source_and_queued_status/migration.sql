-- CreateEnum
CREATE TYPE "ScanSource" AS ENUM ('manual', 'scheduled');

-- AlterEnum
-- PostgreSQL requires committing enum changes before using them
-- Using IF NOT EXISTS to make this idempotent
DO $$ BEGIN
  ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'queued';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "ScanResult" ADD COLUMN IF NOT EXISTS "source" "ScanSource" NOT NULL DEFAULT 'manual';
-- Note: Setting default to 'queued' must be done separately after enum is committed
