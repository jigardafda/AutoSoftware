import { usePresence } from '@/lib/websocket';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ViewerBadgesProps {
  resource: string;
  currentUserId?: string;
}

export function ViewerBadges({ resource, currentUserId }: ViewerBadgesProps) {
  const viewerIds = usePresence(resource);

  // Filter out current user
  const otherViewers = viewerIds.filter(id => id !== currentUserId);

  if (otherViewers.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">Viewing:</span>
        <div className="flex -space-x-2">
          {otherViewers.slice(0, 3).map((userId) => (
            <ViewerAvatar key={userId} userId={userId} />
          ))}
          {otherViewers.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium border-2 border-background">
              +{otherViewers.length - 3}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ViewerAvatar({ userId }: { userId: string }) {
  // You could fetch user info here, for now show initials
  const initials = userId.slice(0, 2).toUpperCase();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar className="w-6 h-6 border-2 border-background cursor-pointer">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>
        <p>User {userId.slice(0, 8)}...</p>
      </TooltipContent>
    </Tooltip>
  );
}
