import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  GitBranch,
  CheckCircle2,
  Activity,
  MoreHorizontal,
  Search,
  Layers,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const tabs = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/repos", label: "Repos", icon: GitBranch },
  { to: "/tasks", label: "Tasks", icon: CheckCircle2 },
  { to: "/activity", label: "Activity", icon: Activity },
];

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-border bg-card lg:hidden">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-muted-foreground transition-colors"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>

      {/* More sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-1">
            <button
              onClick={() => {
                navigate("/scans");
                setMoreOpen(false);
              }}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
            >
              <Search className="h-4 w-4" />
              Scans
            </button>
            <button
              onClick={() => {
                navigate("/queues");
                setMoreOpen(false);
              }}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
            >
              <Layers className="h-4 w-4" />
              Queues
            </button>
            <button
              onClick={() => {
                navigate("/settings");
                setMoreOpen(false);
              }}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <Separator className="my-1" />
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium text-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <Separator className="my-1" />
            <button
              onClick={() => {
                void logout();
                setMoreOpen(false);
              }}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
