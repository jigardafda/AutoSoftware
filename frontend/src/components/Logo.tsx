import { cn } from "@/lib/utils";

interface LogoIconProps {
  className?: string;
}

export function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      className={cn("shrink-0", className)}
    >
      <defs>
        {/* New gradient: Teal to Cyan */}
        <linearGradient id="logo-bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0d9488"/>
          <stop offset="100%" stopColor="#06b6d4"/>
        </linearGradient>
        <linearGradient id="logo-shine" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.2"/>
          <stop offset="50%" stopColor="#fff" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="logo-node" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5eead4"/>
          <stop offset="100%" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      {/* Background with rounded corners */}
      <rect width="512" height="512" rx="108" fill="url(#logo-bg)"/>
      <rect width="512" height="512" rx="108" fill="url(#logo-shine)"/>

      {/* Code brackets - slightly adjusted */}
      <path
        d="M152 148 C152 148, 122 148, 122 178 L122 232 C122 232, 122 256, 98 256 C122 256, 122 280, 122 280 L122 334 C122 364, 152 364, 152 364"
        stroke="#fff"
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M360 148 C360 148, 390 148, 390 178 L390 232 C390 232, 390 256, 414 256 C390 256, 390 280, 390 280 L390 334 C390 364, 360 364, 360 364"
        stroke="#fff"
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Central node */}
      <circle cx="256" cy="256" r="18" fill="#fff"/>

      {/* Surrounding nodes */}
      <circle cx="256" cy="186" r="10" fill="url(#logo-node)"/>
      <circle cx="256" cy="326" r="10" fill="url(#logo-node)"/>
      <circle cx="200" cy="224" r="10" fill="url(#logo-node)"/>
      <circle cx="312" cy="224" r="10" fill="url(#logo-node)"/>
      <circle cx="200" cy="288" r="10" fill="url(#logo-node)"/>
      <circle cx="312" cy="288" r="10" fill="url(#logo-node)"/>

      {/* Connecting lines */}
      <line x1="256" y1="238" x2="256" y2="196" stroke="#5eead4" strokeWidth="3" strokeLinecap="round"/>
      <line x1="256" y1="274" x2="256" y2="316" stroke="#5eead4" strokeWidth="3" strokeLinecap="round"/>
      <line x1="240" y1="246" x2="210" y2="228" stroke="#5eead4" strokeWidth="3" strokeLinecap="round"/>
      <line x1="272" y1="246" x2="302" y2="228" stroke="#5eead4" strokeWidth="3" strokeLinecap="round"/>
      <line x1="240" y1="266" x2="210" y2="284" stroke="#5eead4" strokeWidth="3" strokeLinecap="round"/>
      <line x1="272" y1="266" x2="302" y2="284" stroke="#5eead4" strokeWidth="3" strokeLinecap="round"/>

      {/* Outer ring */}
      <circle cx="256" cy="256" r="28" stroke="#fff" strokeWidth="2" fill="none" opacity="0.3"/>
    </svg>
  );
}

interface LogoProps {
  className?: string;
  iconClassName?: string;
  showText?: boolean;
}

export function Logo({ className, iconClassName, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoIcon className={cn("h-7 w-7", iconClassName)} />
      {showText && (
        <span className="font-semibold text-foreground tracking-tight text-[15px]">
          AutoSoftware
        </span>
      )}
    </div>
  );
}
