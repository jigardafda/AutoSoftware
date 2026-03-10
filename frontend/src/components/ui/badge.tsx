import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-sm",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive/15 text-destructive",
        outline: "text-foreground border-border/50",
        success:
          "border-transparent bg-[oklch(0.65_0.18_145_/_0.15)] text-[oklch(0.50_0.18_145)] dark:text-[oklch(0.70_0.16_145)]",
        warning:
          "border-transparent bg-[oklch(0.75_0.15_70_/_0.15)] text-[oklch(0.55_0.15_70)] dark:text-[oklch(0.78_0.14_70)]",
        info:
          "border-transparent bg-[oklch(0.65_0.15_230_/_0.15)] text-[oklch(0.50_0.15_230)] dark:text-[oklch(0.70_0.15_230)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
