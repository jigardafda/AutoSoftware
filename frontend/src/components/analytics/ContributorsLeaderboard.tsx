import { Trophy, Clock, Code, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ContributorData {
  rank: number;
  userId: string;
  userName: string;
  userAvatar?: string;
  taskCount: number;
  hoursSaved: number;
  linesChanged: number;
}

interface ContributorsLeaderboardProps {
  contributors: ContributorData[];
  onUserClick: (userId: string) => void;
}

function getRankBadge(rank: number) {
  switch (rank) {
    case 1:
      return {
        color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        icon: Trophy,
      };
    case 2:
      return {
        color: 'bg-slate-400/10 text-slate-400 border-slate-400/20',
        icon: Trophy,
      };
    case 3:
      return {
        color: 'bg-amber-600/10 text-amber-600 border-amber-600/20',
        icon: Trophy,
      };
    default:
      return null;
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ContributorsLeaderboard({ contributors, onUserClick }: ContributorsLeaderboardProps) {
  if (contributors.length === 0) {
    return (
      <Card>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="text-sm">Top Contributors</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-4">
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No contributor data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Top Contributors</CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Code size={12} />
              Lines
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              Hours
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <ScrollArea className="h-[320px]">
          <div className="space-y-1">
            {contributors.map((contributor) => {
              const rankBadge = getRankBadge(contributor.rank);

              return (
                <button
                  key={contributor.userId}
                  onClick={() => onUserClick(contributor.userId)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg transition-colors",
                    "hover:bg-muted/50 text-left group"
                  )}
                >
                  {/* Rank */}
                  <div className="w-8 flex items-center justify-center shrink-0">
                    {rankBadge ? (
                      <div className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center border",
                        rankBadge.color
                      )}>
                        <rankBadge.icon size={14} />
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground">
                        {contributor.rank}
                      </span>
                    )}
                  </div>

                  {/* Avatar */}
                  <Avatar className="h-9 w-9 shrink-0">
                    {contributor.userAvatar && (
                      <AvatarImage src={contributor.userAvatar} alt={contributor.userName} />
                    )}
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {getInitials(contributor.userName)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name and Tasks */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{contributor.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {contributor.taskCount} tasks completed
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div>
                      <p className="text-sm font-medium">{contributor.linesChanged.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">lines</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{contributor.hoursSaved.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">hrs</p>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
