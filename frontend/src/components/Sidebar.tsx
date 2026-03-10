import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  GitBranch,
  CheckCircle2,
  Search,
  Activity,
  Layers,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  FolderKanban,
  Puzzle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Logo, LogoIcon } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/repos", label: "Repositories", icon: GitBranch },
  { to: "/tasks", label: "Tasks", icon: CheckCircle2 },
  { to: "/scans", label: "Scans", icon: Search },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/queues", label: "Queues", icon: Layers },
];

const bottomNavItems = [
  { to: "/plugins", label: "Plugins", icon: Puzzle },
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
        "hidden lg:flex flex-col bg-card/50 backdrop-blur-sm border-r border-border/50 transition-all duration-300 ease-out",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Logo section */}
      <div className={cn(
        "relative flex items-center h-14 border-b border-border/50",
        collapsed ? "justify-center px-2" : "justify-between px-4"
      )}>
        {collapsed ? (
          <LogoIcon className="h-7 w-7" />
        ) : (
          <Logo iconClassName="h-7 w-7" />
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Expand button when collapsed - positioned below logo */}
      {collapsed && (
        <div className="flex justify-center py-2 border-b border-border/50">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Main navigation */}
      <ScrollArea className="flex-1 py-3">
        <TooltipProvider delayDuration={0}>
          <nav className={cn("flex flex-col gap-1", collapsed ? "px-2" : "px-3")}>
            {/* Section label */}
            {!collapsed && (
              <span className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Navigation
              </span>
            )}

            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to ||
                (to !== "/dashboard" && location.pathname.startsWith(to));

              const linkContent = (
                <Link
                  to={to}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    collapsed && "justify-center px-0 py-2.5"
                  )}
                >
                  {/* Active indicator */}
                  {active && (
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary transition-all",
                        collapsed && "left-0"
                      )}
                    />
                  )}
                  <Icon className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                    !active && "group-hover:scale-110"
                  )} />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={to}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return <div key={to}>{linkContent}</div>;
            })}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      {/* Bottom section */}
      <div className={cn(
        "border-t border-border/50",
        collapsed ? "px-2 py-3" : "px-3 py-3"
      )}>
        <TooltipProvider delayDuration={0}>
          {/* Settings */}
          {bottomNavItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            const linkContent = (
              <Link
                to={to}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  collapsed && "justify-center px-0 py-2.5"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                )}
                <Icon className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                  !active && "group-hover:scale-110"
                )} />
                {!collapsed && <span>{label}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <div key={to}>{linkContent}</div>;
          })}
        </TooltipProvider>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 mt-1 text-sm transition-all duration-200",
                "hover:bg-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                collapsed && "justify-center px-0"
              )}
            >
              <Avatar className="h-8 w-8 shrink-0 ring-2 ring-border/50">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} />}
                <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
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
          <DropdownMenuContent
            side="top"
            align={collapsed ? "center" : "start"}
            className="w-56"
          >
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.name ?? user?.email}</p>
              {user?.name && (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void logout()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
