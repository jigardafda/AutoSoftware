import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="relative mb-6">
        {/* Subtle glow behind icon */}
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-xl scale-150" />
        <div className="relative h-16 w-16 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center">
          <Icon className="h-7 w-7 text-muted-foreground/70" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-sm leading-relaxed">{description}</p>
      {action}
    </div>
  );
}
