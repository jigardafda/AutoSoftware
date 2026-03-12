import { useState, useEffect, useCallback } from 'react';

/**
 * Breakpoint constants following Tailwind CSS defaults
 */
export const BREAKPOINTS = {
  xs: 320,   // Extra small phones
  sm: 640,   // Small phones / landscape
  md: 768,   // Tablets
  lg: 1024,  // Desktops / laptops
  xl: 1280,  // Large desktops
  '2xl': 1536, // Extra large screens
} as const;

/**
 * Media query strings for each breakpoint
 */
export const MEDIA_QUERIES = {
  xs: `(min-width: ${BREAKPOINTS.xs}px)`,
  sm: `(min-width: ${BREAKPOINTS.sm}px)`,
  md: `(min-width: ${BREAKPOINTS.md}px)`,
  lg: `(min-width: ${BREAKPOINTS.lg}px)`,
  xl: `(min-width: ${BREAKPOINTS.xl}px)`,
  '2xl': `(min-width: ${BREAKPOINTS['2xl']}px)`,
  // Special queries
  mobile: `(max-width: ${BREAKPOINTS.md - 1}px)`,
  tablet: `(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`,
  desktop: `(min-width: ${BREAKPOINTS.lg}px)`,
  touch: '(hover: none) and (pointer: coarse)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
  darkMode: '(prefers-color-scheme: dark)',
  portrait: '(orientation: portrait)',
  landscape: '(orientation: landscape)',
  highContrast: '(prefers-contrast: high)',
} as const;

/**
 * Custom hook for responsive media queries
 *
 * @param query - CSS media query string
 * @returns boolean indicating if the query matches
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 768px)');
 * const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQueryList = window.matchMedia(query);

    // Update state if it differs from initial
    if (mediaQueryList.matches !== matches) {
      setMatches(mediaQueryList.matches);
    }

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern browsers
    mediaQueryList.addEventListener('change', handleChange);

    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [query, matches]);

  return matches;
}

/**
 * Hook to detect if the device is mobile (< 768px)
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MEDIA_QUERIES.mobile);
}

/**
 * Hook to detect if the device is a tablet (768px - 1023px)
 */
export function useIsTablet(): boolean {
  return useMediaQuery(MEDIA_QUERIES.tablet);
}

/**
 * Hook to detect if the device is a desktop (>= 1024px)
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(MEDIA_QUERIES.desktop);
}

/**
 * Hook to detect if the device supports touch
 */
export function useIsTouchDevice(): boolean {
  return useMediaQuery(MEDIA_QUERIES.touch);
}

/**
 * Hook to detect if user prefers reduced motion
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(MEDIA_QUERIES.reducedMotion);
}

/**
 * Hook that returns current breakpoint
 */
export function useBreakpoint(): 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' {
  const isXl2 = useMediaQuery(MEDIA_QUERIES['2xl']);
  const isXl = useMediaQuery(MEDIA_QUERIES.xl);
  const isLg = useMediaQuery(MEDIA_QUERIES.lg);
  const isMd = useMediaQuery(MEDIA_QUERIES.md);
  const isSm = useMediaQuery(MEDIA_QUERIES.sm);

  if (isXl2) return '2xl';
  if (isXl) return 'xl';
  if (isLg) return 'lg';
  if (isMd) return 'md';
  if (isSm) return 'sm';
  return 'xs';
}

/**
 * Hook that returns responsive state object
 */
export function useResponsive() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isDesktop = useIsDesktop();
  const isTouchDevice = useIsTouchDevice();
  const prefersReducedMotion = usePrefersReducedMotion();
  const breakpoint = useBreakpoint();
  const isPortrait = useMediaQuery(MEDIA_QUERIES.portrait);

  return {
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    prefersReducedMotion,
    breakpoint,
    isPortrait,
    // Helper computed values
    isSmallScreen: isMobile || isTablet,
    showMobileNav: isMobile,
    showSidebar: isDesktop,
    useCardView: isMobile,
  };
}

/**
 * Hook for safe area insets (for notch devices)
 */
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !CSS.supports('padding', 'env(safe-area-inset-top)')) {
      return;
    }

    const updateInsets = () => {
      const computedStyle = getComputedStyle(document.documentElement);
      setInsets({
        top: parseInt(computedStyle.getPropertyValue('--sat') || '0', 10),
        right: parseInt(computedStyle.getPropertyValue('--sar') || '0', 10),
        bottom: parseInt(computedStyle.getPropertyValue('--sab') || '0', 10),
        left: parseInt(computedStyle.getPropertyValue('--sal') || '0', 10),
      });
    };

    // Set CSS variables for safe area insets
    document.documentElement.style.setProperty('--sat', 'env(safe-area-inset-top)');
    document.documentElement.style.setProperty('--sar', 'env(safe-area-inset-right)');
    document.documentElement.style.setProperty('--sab', 'env(safe-area-inset-bottom)');
    document.documentElement.style.setProperty('--sal', 'env(safe-area-inset-left)');

    updateInsets();

    window.addEventListener('resize', updateInsets);
    window.addEventListener('orientationchange', updateInsets);

    return () => {
      window.removeEventListener('resize', updateInsets);
      window.removeEventListener('orientationchange', updateInsets);
    };
  }, []);

  return insets;
}

export default useMediaQuery;
