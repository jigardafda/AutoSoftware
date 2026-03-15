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
  BarChart3,
  X,
  LayoutGrid,
  GitPullRequestArrow,
  LinkIcon,
  Github,
  Gitlab,
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
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const navItems = [
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
];

const bottomNavItems = [
  { to: "/plugins", label: "Plugins", icon: Puzzle },
  { to: "/settings", label: "Settings", icon: Settings },
];

const STORAGE_KEY = "sidebar-collapsed";

interface SidebarProps {
  /** Mobile mode - renders as drawer content */
  mobile?: boolean;
  /** Callback when close is triggered (mobile only) */
  onClose?: () => void;
}

export function Sidebar({ mobile = false, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined" && !mobile) {
      return localStorage.getItem(STORAGE_KEY) === "true";
    }
    return false;
  });
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, localMode } = useAuth();

  useEffect(() => {
    if (!mobile) {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    }
  }, [collapsed, mobile]);

  // Close sidebar on navigation in mobile mode
  const handleNavClick = () => {
    if (mobile && onClose) {
      onClose();
    }
  };

  const displayName = user?.name ?? user?.email ?? (localMode ? "Local User" : null);
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.charAt(0).toUpperCase() ?? (localMode ? "L" : "?");

  // In mobile mode, always expanded
  const isCollapsed = mobile ? false : collapsed;

  return (
    <aside
      className={cn(
        "flex flex-col bg-card/50 backdrop-blur-sm transition-all duration-300 ease-out h-full",
        // Desktop: hidden on small screens, flex on large
        !mobile && "hidden lg:flex border-r border-border/50",
        // Mobile: always flex, full width
        mobile && "flex w-full",
        // Width based on collapsed state (desktop only)
        !mobile && (isCollapsed ? "w-[68px]" : "w-[240px]")
      )}
    >
      {/* Logo section */}
      <div className={cn(
        "relative flex items-center h-14 border-b border-border/50",
        isCollapsed ? "justify-center px-2" : "justify-between px-4"
      )}>
        {isCollapsed ? (
          <LogoIcon className="h-7 w-7" />
        ) : (
          <Logo iconClassName="h-7 w-7" />
        )}
        {!isCollapsed && !mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        {mobile && onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Expand button when collapsed - positioned below logo (desktop only) */}
      {isCollapsed && !mobile && (
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
          <nav className={cn("flex flex-col gap-1", isCollapsed ? "px-2" : "px-3")}>
            {/* Section label */}
            {!isCollapsed && (
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
                  onClick={handleNavClick}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200",
                    // Touch-friendly size on mobile
                    mobile ? "py-3 min-h-[44px]" : "py-2.5",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    isCollapsed && "justify-center px-0 py-2.5"
                  )}
                >
                  {/* Active indicator */}
                  {active && (
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary transition-all",
                        isCollapsed && "left-0"
                      )}
                    />
                  )}
                  <Icon className={cn(
                    "shrink-0 transition-transform duration-200",
                    mobile ? "h-5 w-5" : "h-[18px] w-[18px]",
                    !active && "group-hover:scale-110"
                  )} />
                  {!isCollapsed && <span>{label}</span>}
                </Link>
              );

              if (isCollapsed && !mobile) {
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
        isCollapsed ? "px-2 py-3" : "px-3 py-3"
      )}>
        <TooltipProvider delayDuration={0}>
          {/* Settings */}
          {bottomNavItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            const linkContent = (
              <Link
                to={to}
                onClick={handleNavClick}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200",
                  mobile ? "py-3 min-h-[44px]" : "py-2.5",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  isCollapsed && "justify-center px-0 py-2.5"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                )}
                <Icon className={cn(
                  "shrink-0 transition-transform duration-200",
                  mobile ? "h-5 w-5" : "h-[18px] w-[18px]",
                  !active && "group-hover:scale-110"
                )} />
                {!isCollapsed && <span>{label}</span>}
              </Link>
            );

            if (isCollapsed && !mobile) {
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

        {mobile && <Separator className="my-3" />}

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 mt-1 text-sm transition-all duration-200",
                mobile ? "py-3 min-h-[44px]" : "py-2.5",
                "hover:bg-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isCollapsed && "justify-center px-0"
              )}
            >
              <Avatar className={cn("shrink-0 ring-2 ring-border/50", mobile ? "h-10 w-10" : "h-8 w-8")}>
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name ?? ""} />}
                <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="truncate text-sm font-medium text-foreground">
                    {displayName}
                  </p>
                  {user?.name && user.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  )}
                  {!user && localMode && (
                    <p className="truncate text-xs text-muted-foreground">
                      Not signed in
                    </p>
                  )}
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={mobile ? "top" : "top"}
            align={isCollapsed ? "center" : "start"}
            className="w-56"
          >
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{displayName}</p>
              {user?.name && user.email && (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              )}
              {!user && localMode && (
                <p className="text-xs text-muted-foreground">Not signed in</p>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { navigate("/settings"); handleNavClick(); }}>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { navigate("/settings"); handleNavClick(); }}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setConnectDialogOpen(true); handleNavClick(); }}>
              <LinkIcon className="h-4 w-4" />
              Connect Account
            </DropdownMenuItem>
            {user && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => { void logout(); handleNavClick(); }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Connect Account Dialog */}
      <ConnectAccountDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        localMode={localMode}
      />
    </aside>
  );
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5002";

function ConnectAccountDialog({
  open,
  onOpenChange,
  localMode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localMode: boolean;
}) {
  const providers = [
    {
      id: "github",
      name: "GitHub",
      icon: <Github className="h-5 w-5" />,
      color: "bg-gray-900 text-white dark:bg-white dark:text-gray-900",
    },
    {
      id: "gitlab",
      name: "GitLab",
      icon: <Gitlab className="h-5 w-5" />,
      color: "bg-orange-600 text-white",
    },
    {
      id: "bitbucket",
      name: "Bitbucket",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.65 3C2.3 3 2 3.3 2 3.65v.12l2.73 16.5c.07.42.43.73.85.73h13.05c.32 0 .6-.22.66-.53L22 3.77v-.12c0-.35-.3-.65-.65-.65H2.65zM14.1 14.95H9.9L8.72 9.05h6.56l-1.18 5.9z" />
        </svg>
      ),
      color: "bg-blue-600 text-white",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <p className="text-sm text-muted-foreground mb-4">
            {localMode
              ? "Account linking will be available in the cloud version. You can use PATs or CLI tools for now."
              : "Link a provider account to enable OAuth-based repo access and PR reviews."}
          </p>
          {providers.map((provider) => (
            <div key={provider.id}>
              {localMode ? (
                <div className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 opacity-70">
                  <div className="flex items-center gap-3">
                    <div className={cn("flex items-center justify-center rounded-md h-9 w-9", provider.color)}>
                      {provider.icon}
                    </div>
                    <span className="text-sm font-medium">{provider.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                </div>
              ) : (
                <a
                  href={`${BACKEND_URL}/api/auth/login/${provider.id}`}
                  className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("flex items-center justify-center rounded-md h-9 w-9", provider.color)}>
                      {provider.icon}
                    </div>
                    <span className="text-sm font-medium">{provider.name}</span>
                  </div>
                  <Button variant="outline" size="sm">Connect</Button>
                </a>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
