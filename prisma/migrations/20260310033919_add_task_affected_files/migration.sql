-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "affectedFiles" JSONB NOT NULL DEFAULT '[]';
