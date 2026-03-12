import { useState, useEffect, createContext, useContext, useCallback, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useResponsive, useSafeAreaInsets } from '@/hooks/useMediaQuery';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import { AiChat } from '@/components/AiChat';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';

// Touch-friendly minimum target size (44px as per WCAG 2.1)
export const TOUCH_TARGET_SIZE = 44;

// Responsive context for components that need layout info
interface ResponsiveContextValue {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  breakpoint: string;
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

const ResponsiveContext = createContext<ResponsiveContextValue | null>(null);

export function useResponsiveContext() {
  const context = useContext(ResponsiveContext);
  if (!context) {
    throw new Error('useResponsiveContext must be used within ResponsiveLayout');
  }
  return context;
}

interface ResponsiveLayoutProps {
  children?: ReactNode;
}

export function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  const {
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    breakpoint,
  } = useResponsive();
  const safeAreaInsets = useSafeAreaInsets();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar when switching to desktop
  useEffect(() => {
    if (isDesktop) {
      setSidebarOpen(false);
    }
  }, [isDesktop]);

  // Handle sidebar toggle from header
  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  // Listen for sidebar toggle events
  useEffect(() => {
    const handleToggle = () => handleSidebarToggle();
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-sidebar', handleToggle);
  }, [handleSidebarToggle]);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    if (isMobile || isTablet) {
      setSidebarOpen(false);
    }
  }, [isMobile, isTablet]);

  const contextValue: ResponsiveContextValue = {
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    sidebarOpen,
    setSidebarOpen,
    breakpoint,
    safeAreaInsets,
  };

  return (
    <ResponsiveContext.Provider value={contextValue}>
      <div
        className={cn(
          "flex h-screen overflow-hidden bg-background",
          "transition-all duration-200"
        )}
      >
        {/* Desktop sidebar - always visible on large screens */}
        {isDesktop && <Sidebar />}

        {/* Mobile/Tablet sidebar drawer */}
        {!isDesktop && (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side="left"
              className="w-[280px] p-0 border-r-0"
            >
              <Sidebar mobile onClose={() => setSidebarOpen(false)} />
            </SheetContent>
          </Sheet>
        )}

        {/* Main content wrapper */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content area */}
          <div className="flex flex-1 flex-col overflow-hidden min-w-0">
            {/* Header */}
            <Header />

            {/* Main content */}
            <main
              className={cn(
                "flex-1 overflow-y-auto",
                // Responsive padding
                "p-3 sm:p-4 lg:p-6",
                // Bottom padding for mobile nav
                isMobile && "pb-24",
                // Safe area support
                "safe-area-left safe-area-right"
              )}
              style={{
                // Add extra bottom padding for safe area on mobile
                paddingBottom: isMobile
                  ? `calc(5rem + ${safeAreaInsets.bottom}px)`
                  : undefined,
              }}
            >
              {children || <Outlet />}
            </main>

            {/* Mobile bottom navigation */}
            {isMobile && <MobileNav />}
          </div>

          {/* AI Chat panel - renders side-by-side on desktop */}
          <AiChat />
        </div>
      </div>
    </ResponsiveContext.Provider>
  );
}

/**
 * Responsive container that adapts to different screen sizes
 */
interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
  /** Maximum width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Horizontal padding */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function ResponsiveContainer({
  children,
  className,
  maxWidth = 'full',
  padding = 'md',
}: ResponsiveContainerProps) {
  const maxWidthClasses = {
    sm: 'max-w-screen-sm',
    md: 'max-w-screen-md',
    lg: 'max-w-screen-lg',
    xl: 'max-w-screen-xl',
    '2xl': 'max-w-screen-2xl',
    full: 'max-w-full',
  };

  const paddingClasses = {
    none: '',
    sm: 'px-2 sm:px-3 lg:px-4',
    md: 'px-3 sm:px-4 lg:px-6',
    lg: 'px-4 sm:px-6 lg:px-8',
  };

  return (
    <div
      className={cn(
        'w-full mx-auto',
        maxWidthClasses[maxWidth],
        paddingClasses[padding],
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Responsive grid that adapts columns based on screen size
 */
interface ResponsiveGridProps {
  children: ReactNode;
  className?: string;
  /** Number of columns at each breakpoint */
  cols?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  /** Gap between items */
  gap?: 'sm' | 'md' | 'lg';
}

export function ResponsiveGrid({
  children,
  className,
  cols = { default: 1, sm: 2, md: 2, lg: 3, xl: 4 },
  gap = 'md',
}: ResponsiveGridProps) {
  const gapClasses = {
    sm: 'gap-2 sm:gap-3',
    md: 'gap-3 sm:gap-4 lg:gap-6',
    lg: 'gap-4 sm:gap-6 lg:gap-8',
  };

  // Build responsive column classes
  const colClassList = [
    cols.default && `grid-cols-${cols.default}`,
    cols.sm && `sm:grid-cols-${cols.sm}`,
    cols.md && `md:grid-cols-${cols.md}`,
    cols.lg && `lg:grid-cols-${cols.lg}`,
    cols.xl && `xl:grid-cols-${cols.xl}`,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cn(
        'grid',
        gapClasses[gap],
        colClassList,
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Responsive stack that changes direction based on screen size
 */
interface ResponsiveStackProps {
  children: ReactNode;
  className?: string;
  /** Direction at each breakpoint */
  direction?: {
    default?: 'row' | 'col';
    sm?: 'row' | 'col';
    md?: 'row' | 'col';
    lg?: 'row' | 'col';
  };
  /** Gap between items */
  gap?: 'sm' | 'md' | 'lg';
  /** Alignment */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Justify */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
}

export function ResponsiveStack({
  children,
  className,
  direction = { default: 'col', md: 'row' },
  gap = 'md',
  align = 'stretch',
  justify = 'start',
}: ResponsiveStackProps) {
  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-3 sm:gap-4',
    lg: 'gap-4 sm:gap-6',
  };

  const alignClasses = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
  };

  const justifyClasses = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
    around: 'justify-around',
  };

  return (
    <div
      className={cn(
        'flex',
        direction.default === 'col' ? 'flex-col' : 'flex-row',
        direction.sm && (direction.sm === 'col' ? 'sm:flex-col' : 'sm:flex-row'),
        direction.md && (direction.md === 'col' ? 'md:flex-col' : 'md:flex-row'),
        direction.lg && (direction.lg === 'col' ? 'lg:flex-col' : 'lg:flex-row'),
        gapClasses[gap],
        alignClasses[align],
        justifyClasses[justify],
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Component that shows different content based on screen size
 */
interface ResponsiveShowProps {
  children: ReactNode;
  on: 'mobile' | 'tablet' | 'desktop' | 'mobile-tablet' | 'tablet-desktop';
}

export function ResponsiveShow({ children, on }: ResponsiveShowProps) {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  const shouldShow = {
    mobile: isMobile,
    tablet: isTablet,
    desktop: isDesktop,
    'mobile-tablet': isMobile || isTablet,
    'tablet-desktop': isTablet || isDesktop,
  }[on];

  if (!shouldShow) return null;

  return <>{children}</>;
}

/**
 * Component that hides content on specific screen sizes
 */
interface ResponsiveHideProps {
  children: ReactNode;
  on: 'mobile' | 'tablet' | 'desktop' | 'mobile-tablet' | 'tablet-desktop';
}

export function ResponsiveHide({ children, on }: ResponsiveHideProps) {
  const { isMobile, isTablet, isDesktop } = useResponsive();

  const shouldHide = {
    mobile: isMobile,
    tablet: isTablet,
    desktop: isDesktop,
    'mobile-tablet': isMobile || isTablet,
    'tablet-desktop': isTablet || isDesktop,
  }[on];

  if (shouldHide) return null;

  return <>{children}</>;
}

export default ResponsiveLayout;
