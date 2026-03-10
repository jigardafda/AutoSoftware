-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "scanResultId" TEXT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_scanResultId_fkey" FOREIGN KEY ("scanResultId") REFERENCES "ScanResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
