-- CreateTable
CREATE TABLE "PrReview" (
    "id" TEXT NOT NULL,
    "prUrl" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "summary" TEXT,
    "verdict" TEXT,
    "comments" JSONB,
    "filesChanged" JSONB,
    "baseBranch" TEXT NOT NULL DEFAULT 'main',
    "headBranch" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "userId" TEXT,
    "repoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrReview_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PrReview" ADD CONSTRAINT "PrReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrReview" ADD CONSTRAINT "PrReview_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;
