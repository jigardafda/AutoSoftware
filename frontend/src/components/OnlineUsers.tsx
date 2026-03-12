import { useOnlineUsers } from '@/lib/websocket';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';

export function OnlineUsers() {
  const onlineUserIds = useOnlineUsers();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="w-4 h-4" />
          Team Online
          <Badge variant="secondary" className="ml-auto">
            {onlineUserIds.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {onlineUserIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members online</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {onlineUserIds.map((userId) => (
              <OnlineUserBadge key={userId} userId={userId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OnlineUserBadge({ userId }: { userId: string }) {
  const initials = userId.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-muted rounded-full">
      <div className="relative">
        <Avatar className="w-5 h-5">
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-background" />
      </div>
      <span className="text-xs truncate max-w-[80px]">
        {userId.slice(0, 8)}...
      </span>
    </div>
  );
}
