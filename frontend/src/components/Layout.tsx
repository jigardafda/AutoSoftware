import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { AiChat } from "@/components/AiChat";

export function Layout() {
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

          {/* Mobile bottom nav (includes FAB) */}
          <MobileNav />
        </div>

        {/* AI Chat panel - renders side-by-side on desktop */}
        <AiChat />
      </div>
    </div>
  );
}
