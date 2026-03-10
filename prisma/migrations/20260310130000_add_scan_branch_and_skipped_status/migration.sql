-- AlterEnum: Add 'skipped' status
DO $$ BEGIN
  ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'skipped';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable: Add branch column
ALTER TABLE "ScanResult" ADD COLUMN IF NOT EXISTS "branch" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScanResult_repositoryId_status_idx" ON "ScanResult"("repositoryId", "status");
