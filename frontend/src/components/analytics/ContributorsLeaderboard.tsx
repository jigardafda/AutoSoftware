import { Trophy, Clock, Code, ChevronRight } from 'lucide-react';
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

const rankStyles: Record<number, { bg: string; text: string; ring: string }> = {
  1: { bg: 'bg-amber-400/15', text: 'text-amber-500', ring: 'ring-amber-400/30' },
  2: { bg: 'bg-slate-300/15', text: 'text-slate-400', ring: 'ring-slate-300/30' },
  3: { bg: 'bg-orange-400/15', text: 'text-orange-500', ring: 'ring-orange-400/30' },
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function ContributorsLeaderboard({ contributors, onUserClick }: ContributorsLeaderboardProps) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold">Top Contributors</h3>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-medium">
          <span className="flex items-center gap-1"><Code size={11} /> Lines</span>
          <span className="flex items-center gap-1"><Clock size={11} /> Hours</span>
        </div>
      </div>
      <div className="px-3 pb-3">
        {contributors.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No contributor data available</p>
          </div>
        ) : (
          <ScrollArea className="h-[340px]">
            <div className="space-y-0.5">
              {contributors.map((c) => {
                const style = rankStyles[c.rank];
                return (
                  <button
                    key={c.userId}
                    onClick={() => onUserClick(c.userId)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-muted/50 text-left group"
                  >
                    {/* Rank */}
                    <div className="w-8 flex items-center justify-center shrink-0">
                      {style ? (
                        <div className={cn("h-7 w-7 rounded-full flex items-center justify-center ring-1", style.bg, style.text, style.ring)}>
                          <Trophy size={13} />
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground tabular-nums">{c.rank}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-9 w-9 shrink-0 ring-2 ring-background">
                      {c.userAvatar && <AvatarImage src={c.userAvatar} alt={c.userName} />}
                      <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-primary/20 to-primary/10 text-primary">
                        {getInitials(c.userName)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.userName}</p>
                      <p className="text-[11px] text-muted-foreground">{c.taskCount} tasks</p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-right shrink-0">
                      <div>
                        <p className="text-sm font-semibold tabular-nums">{c.linesChanged.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">lines</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold tabular-nums">{c.hoursSaved.toFixed(1)}</p>
                        <p className="text-[10px] text-muted-foreground">hrs</p>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-all group-hover:translate-x-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
