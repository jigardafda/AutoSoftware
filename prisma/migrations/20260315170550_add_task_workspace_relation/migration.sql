-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
