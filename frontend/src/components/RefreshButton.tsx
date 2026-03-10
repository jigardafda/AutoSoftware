import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  queryKeys: (string | string[])[];
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
  showLabel?: boolean;
}

export function RefreshButton({
  queryKeys,
  size = "sm",
  variant = "outline",
  className,
  showLabel = false,
}: RefreshButtonProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all(
      queryKeys.map((key) =>
        queryClient.invalidateQueries({
          queryKey: Array.isArray(key) ? key : [key],
        })
      )
    );
    // Brief delay to show animation
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRefresh}
      disabled={isRefreshing}
      className={cn("gap-1.5", className)}
    >
      <RefreshCw
        className={cn("h-4 w-4", isRefreshing && "animate-spin")}
      />
      {showLabel && <span>Refresh</span>}
    </Button>
  );
}
