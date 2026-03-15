-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "prReviewId" TEXT;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_prReviewId_fkey" FOREIGN KEY ("prReviewId") REFERENCES "PrReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
