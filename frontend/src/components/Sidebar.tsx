import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  GitBranch,
  CheckCircle2,
  Search,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/repos", label: "Repositories", icon: GitBranch },
  { to: "/tasks", label: "Tasks", icon: CheckCircle2 },
  { to: "/scans", label: "Scans", icon: Search },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

const STORAGE_KEY = "sidebar-collapsed";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) === "true";
    }
    return false;
  });

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col bg-card border-r border-border transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Top: Logo + collapse toggle */}
      <div className="flex items-center justify-between h-12 px-3 border-b border-border">
        <span
          className={cn(
            "font-semibold text-foreground transition-all overflow-hidden whitespace-nowrap",
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          )}
        >
          AutoSoftware
        </span>
        {collapsed && (
          <span className="font-semibold text-foreground text-sm">AS</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Nav items */}
      <ScrollArea className="flex-1">
        <TooltipProvider delayDuration={0}>
          <nav className="flex flex-col gap-1 p-2">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname.startsWith(to);
              const linkContent = (
                <Link
                  to={to}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                    collapsed && "justify-center px-0"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={to}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                );
              }

              return <div key={to}>{linkContent}</div>;
            })}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      <Separator />

      {/* User section */}
      <div className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/50",
                collapsed && "justify-center px-0"
              )}
            >
              <Avatar className="h-7 w-7 shrink-0">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} />}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.name ?? user?.email}
                  </p>
                  {user?.name && (
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  )}
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align={collapsed ? "center" : "start"} className="w-56">
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
