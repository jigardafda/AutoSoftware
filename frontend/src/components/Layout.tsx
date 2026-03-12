import { useState, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { AiChat } from "@/components/AiChat";
import { FloatingActionButton, QuickActionSheet } from "@/components/mobile";

export function Layout() {
  const navigate = useNavigate();
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  // Handle task creation from FAB or Quick Action Sheet
  const handleCreateTask = useCallback((description?: string) => {
    // Navigate to tasks page with create sheet open
    navigate("/tasks", { state: { openCreateSheet: true, description } });
    setQuickActionOpen(false);
  }, [navigate]);

  // Handle voice input from FAB
  const handleVoiceInput = useCallback(() => {
    setQuickActionOpen(true);
  }, []);

  // Handle task click from Quick Action Sheet
  const handleTaskClick = useCallback((taskId: string) => {
    navigate(`/tasks/${taskId}`);
    setQuickActionOpen(false);
  }, [navigate]);

  // Handle screenshot upload
  const handleUploadScreenshot = useCallback(async (file: File) => {
    // For now, just create a task with a note about the screenshot
    // In a real implementation, this would upload the file and attach it
    console.log("Screenshot uploaded:", file.name);
    handleCreateTask(`Task from screenshot: ${file.name}`);
  }, [handleCreateTask]);

  // Handle scan trigger
  const handleScanTrigger = useCallback(() => {
    navigate("/scans", { state: { openScanDialog: true } });
    setQuickActionOpen(false);
  }, [navigate]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content + AI Chat wrapper */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Header */}
          <Header />

          {/* Main content area — pb-16 on mobile for bottom nav clearance */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
            <Outlet />
          </main>

          {/* Mobile bottom nav */}
          <MobileNav />

          {/* Mobile Floating Action Button */}
          <FloatingActionButton
            onCreateTask={() => handleCreateTask()}
            onVoiceInput={handleVoiceInput}
            onUploadScreenshot={() => setQuickActionOpen(true)}
            onScanTrigger={handleScanTrigger}
          />

          {/* Mobile Quick Action Sheet */}
          <QuickActionSheet
            open={quickActionOpen}
            onOpenChange={setQuickActionOpen}
            onCreateTask={handleCreateTask}
            onTaskClick={handleTaskClick}
            onUploadScreenshot={handleUploadScreenshot}
          />
        </div>

        {/* AI Chat panel - renders side-by-side on desktop */}
        <AiChat />
      </div>
    </div>
  );
}
