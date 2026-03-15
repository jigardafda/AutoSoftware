import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  Menu,
  LogOut,
  User,
  Settings,
  LayoutDashboard,
  GitBranch,
  CheckCircle2,
  Activity,
  Layers,
  FolderKanban,
  Sparkles,
  BarChart3,
  LayoutGrid,
  GitPullRequestArrow,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { ActivityPulse } from "@/components/ActivityPulse";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/analytics": "Analytics",
  "/projects": "Projects",
  "/repos": "Repositories",
  "/tasks": "Tasks",
  "/scans": "Scans",
  "/activity": "Activity",
  "/queues": "Queues",
  "/notifications": "Notifications",
  "/settings": "Settings",
  "/workspaces": "Workspaces",
  "/reviews": "Reviews",
  "/triggers": "Triggers",
  "/team": "Team",
  "/plugins": "Plugins",
};

const mobileNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/repos", label: "Repositories", icon: GitBranch },
  { to: "/tasks", label: "Tasks", icon: CheckCircle2 },
  { to: "/workspaces", label: "Workspaces", icon: LayoutGrid },
  { to: "/reviews", label: "Reviews", icon: GitPullRequestArrow },
  { to: "/scans", label: "Scans", icon: Search },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/queues", label: "Queues", icon: Layers },
  { to: "/settings", label: "Settings", icon: Settings },
];

function getPageTitle(pathname: string): string {
  // Exact match first
  if (routeTitles[pathname]) return routeTitles[pathname];
  // Check prefix matches (e.g. /tasks/123 -> Tasks)
  for (const [route, title] of Object.entries(routeTitles)) {
    if (pathname.startsWith(route)) return title;
  }
  return "AutoSoftware";
}

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageTitle = getPageTitle(location.pathname);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border/50 bg-background/80 backdrop-blur-md px-4 lg:px-6">
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 lg:hidden"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>


        <div className="flex-1" />

        {/* Search button - refined style */}
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex h-9 w-64 justify-start text-muted-foreground bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-border"
          onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
        >
          <Search className="h-4 w-4 text-muted-foreground/70" />
          <span className="flex-1 text-left text-muted-foreground/70">Search...</span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border/50 bg-background/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

        {/* Action buttons group */}
        <div className="flex items-center gap-1">
          {/* Activity pulse - shows who's active */}
          <ActivityPulse maxDisplay={3} showDropdown={true} />

          {/* Connection status indicator */}
          <ConnectionIndicator />

          {/* Notifications bell */}
          <NotificationBell />

          {/* AI Chat button */}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-primary"
                  onClick={() => window.dispatchEvent(new Event("open-ai-chat"))}
                >
                  <Sparkles className="h-[18px] w-[18px]" />
                  <span className="sr-only">AI Chat</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>AI Assistant <kbd className="ml-1 text-[10px] opacity-60">⌘J</kbd></p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* User avatar dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full ml-1">
                <Avatar className="h-8 w-8 ring-2 ring-border/50">
                  {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} />}
                  <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
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
      </header>

      {/* Mobile sidebar sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 border-r-0">
          <SheetHeader className="px-4 py-4 border-b border-border/50">
            <SheetTitle className="text-left">
              <Logo iconClassName="h-7 w-7" />
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-65px)]">
            <nav className="flex flex-col gap-1 p-3">
              {mobileNavItems.map(({ to, label, icon: Icon }) => {
                const active = location.pathname === to ||
                  (to !== "/dashboard" && location.pathname.startsWith(to));
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <Separator className="my-2" />
            <div className="p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 ring-2 ring-border/50">
                  {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} />}
                  <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.name ?? user?.email}
                  </p>
                  {user?.name && (
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
