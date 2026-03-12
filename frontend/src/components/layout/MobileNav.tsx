import { useState, useRef, useEffect, useCallback } from "react";
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
  FolderKanban,
  Plus,
  Puzzle,
  BarChart3,
  X,
  ChevronUp,
  Users,
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
import { Button } from "@/components/ui/button";
import { useSafeAreaInsets, useIsMobile } from "@/hooks/useMediaQuery";

// Primary navigation tabs - most frequently accessed
const primaryTabs = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", icon: CheckCircle2 },
  { to: "/repos", label: "Repos", icon: GitBranch },
  { to: "/activity", label: "Activity", icon: Activity },
];

// Secondary navigation items in the More sheet
const secondaryItems = [
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/team", label: "Team", icon: Users },
  { to: "/scans", label: "Scans", icon: Search },
  { to: "/queues", label: "Queues", icon: Layers },
  { to: "/plugins", label: "Plugins", icon: Puzzle },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Swipe gesture configuration
const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(false);
  const safeAreaInsets = useSafeAreaInsets();
  const isMobile = useIsMobile();
  const fabRef = useRef<HTMLDivElement>(null);

  // Swipe gesture handling
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchStartY.current - touchEndY;
    const deltaTime = Date.now() - touchStartTime.current;
    const velocity = Math.abs(deltaY) / deltaTime;

    // Swipe up to open more sheet
    if (deltaY > SWIPE_THRESHOLD && velocity > SWIPE_VELOCITY_THRESHOLD) {
      setMoreOpen(true);
    }
  }, []);

  useEffect(() => {
    const navElement = document.getElementById('mobile-nav');
    if (navElement && isMobile) {
      navElement.addEventListener('touchstart', handleTouchStart, { passive: true });
      navElement.addEventListener('touchend', handleTouchEnd, { passive: true });

      return () => {
        navElement.removeEventListener('touchstart', handleTouchStart);
        navElement.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [handleTouchStart, handleTouchEnd, isMobile]);

  // Close FAB when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
        setFabExpanded(false);
      }
    }

    if (fabExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [fabExpanded]);

  // Close FAB on route change
  useEffect(() => {
    setFabExpanded(false);
  }, [location.pathname]);

  if (!isMobile) return null;

  const bottomPadding = Math.max(safeAreaInsets.bottom, 8);

  return (
    <>
      {/* Floating Action Button for New Task */}
      <div
        ref={fabRef}
        className={cn(
          "fixed z-40 transition-all duration-300 ease-out lg:hidden",
          fabExpanded ? "right-4 bottom-24" : "right-4 bottom-24"
        )}
        style={{ paddingBottom: bottomPadding }}
      >
        {/* Expanded FAB Menu */}
        {fabExpanded && (
          <div className="absolute bottom-16 right-0 flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
            <Button
              size="sm"
              variant="secondary"
              className="shadow-lg rounded-full px-4 h-10 gap-2"
              onClick={() => {
                navigate('/tasks');
                setFabExpanded(false);
                // Dispatch event to open create task sheet
                window.dispatchEvent(new Event('open-create-task'));
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>New Task</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="shadow-lg rounded-full px-4 h-10 gap-2"
              onClick={() => {
                navigate('/repos');
                setFabExpanded(false);
                // Dispatch event to open connect repo dialog
                window.dispatchEvent(new Event('open-connect-repo'));
              }}
            >
              <GitBranch className="h-4 w-4" />
              <span>Connect Repo</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="shadow-lg rounded-full px-4 h-10 gap-2"
              onClick={() => {
                navigate('/scans');
                setFabExpanded(false);
              }}
            >
              <Search className="h-4 w-4" />
              <span>New Scan</span>
            </Button>
          </div>
        )}

        {/* FAB Button */}
        <Button
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full shadow-lg transition-all duration-200",
            "bg-primary hover:bg-primary/90 text-primary-foreground",
            "active:scale-95 touch-manipulation",
            fabExpanded && "rotate-45 bg-muted text-muted-foreground hover:bg-muted/90"
          )}
          onClick={() => setFabExpanded(!fabExpanded)}
        >
          {fabExpanded ? (
            <X className="h-6 w-6" />
          ) : (
            <Plus className="h-6 w-6" />
          )}
        </Button>
      </div>

      {/* Bottom Navigation Bar */}
      <nav
        id="mobile-nav"
        className={cn(
          "fixed bottom-0 left-0 right-0 z-30",
          "flex items-center justify-around",
          "border-t border-border bg-card/95 backdrop-blur-md",
          "lg:hidden touch-manipulation",
          "safe-area-bottom"
        )}
        style={{ paddingBottom: bottomPadding }}
      >
        {/* Swipe indicator */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-muted-foreground/20" />

        {primaryTabs.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to ||
            (to !== "/dashboard" && location.pathname.startsWith(to));

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center justify-center",
                "min-w-[64px] min-h-[56px] px-3 py-2",
                "text-xs transition-colors duration-200",
                "active:bg-accent/50 touch-manipulation",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5 mb-0.5", active && "scale-110 transition-transform")} />
              <span className={cn("font-medium", active && "font-semibold")}>{label}</span>
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center",
            "min-w-[64px] min-h-[56px] px-3 py-2",
            "text-xs text-muted-foreground transition-colors duration-200",
            "hover:text-foreground active:bg-accent/50 touch-manipulation"
          )}
        >
          <MoreHorizontal className="h-5 w-5 mb-0.5" />
          <span className="font-medium">More</span>
        </button>
      </nav>

      {/* More sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[85vh] overflow-y-auto safe-area-bottom"
        >
          {/* Drag handle */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-muted-foreground/30" />

          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center gap-2">
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
              More Options
            </SheetTitle>
          </SheetHeader>

          {/* Quick navigation grid */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {secondaryItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname.startsWith(to);
              return (
                <button
                  key={to}
                  onClick={() => {
                    navigate(to);
                    setMoreOpen(false);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2",
                    "p-4 rounded-xl transition-all duration-200",
                    "min-h-[88px] touch-manipulation active:scale-95",
                    active
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-muted/50 text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              );
            })}
          </div>

          <Separator className="my-4" />

          {/* Theme and preferences */}
          <div className="flex items-center justify-between px-2 py-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Theme</span>
            </div>
            <ThemeToggle />
          </div>

          <Separator className="my-4" />

          {/* Logout */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-12 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              void logout();
              setMoreOpen(false);
            }}
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">Sign Out</span>
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default MobileNav;
