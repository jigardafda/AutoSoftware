-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultBranch" TEXT;

-- AlterTable
ALTER TABLE "ProjectRepository" ADD COLUMN     "branchOverride" TEXT;
