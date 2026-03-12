import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThumbsUp, ThumbsDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const BASE = "/api";

interface VoteData {
  upvotes: number;
  downvotes: number;
  userVote: "upvote" | "downvote" | null;
}

interface ApproachVotingProps {
  taskId: string;
  approachIdx: number;
  compact?: boolean;
}

async function fetchVotes(taskId: string): Promise<Record<number, VoteData>> {
  const res = await fetch(`${BASE}/collaboration/tasks/${taskId}/votes`, {
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Failed to fetch votes");
  return data.data;
}

async function submitVote(
  taskId: string,
  approachIdx: number,
  voteType: "upvote" | "downvote"
): Promise<{ vote: any; counts: VoteData }> {
  const res = await fetch(`${BASE}/collaboration/tasks/${taskId}/votes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approachIdx, voteType }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Failed to vote");
  return data.data;
}

async function removeVote(taskId: string, approachIdx: number): Promise<void> {
  const res = await fetch(
    `${BASE}/collaboration/tasks/${taskId}/votes/${approachIdx}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || "Failed to remove vote");
  }
}

export function ApproachVoting({
  taskId,
  approachIdx,
  compact = false,
}: ApproachVotingProps) {
  const queryClient = useQueryClient();
  const { addMessageHandler, subscribe, unsubscribe } = useWebSocket();

  const [localVotes, setLocalVotes] = useState<VoteData>({
    upvotes: 0,
    downvotes: 0,
    userVote: null,
  });

  // Fetch initial votes
  const { data: allVotes, isLoading } = useQuery({
    queryKey: ["approach-votes", taskId],
    queryFn: () => fetchVotes(taskId),
    staleTime: 30000,
  });

  // Update local state when data loads
  useEffect(() => {
    if (allVotes && allVotes[approachIdx]) {
      setLocalVotes(allVotes[approachIdx]);
    }
  }, [allVotes, approachIdx]);

  // Subscribe to real-time vote updates
  useEffect(() => {
    const resource = `task:${taskId}:planning`;
    subscribe(resource);

    const cleanupVote = addMessageHandler("planning:vote", (payload) => {
      if (payload.approachIdx === approachIdx) {
        setLocalVotes((prev) => ({
          ...prev,
          upvotes: payload.counts.upvotes,
          downvotes: payload.counts.downvotes,
        }));
      }
    });

    const cleanupRemove = addMessageHandler("planning:vote:remove", (payload) => {
      if (payload.approachIdx === approachIdx) {
        setLocalVotes((prev) => ({
          ...prev,
          upvotes: payload.counts.upvotes,
          downvotes: payload.counts.downvotes,
        }));
      }
    });

    return () => {
      unsubscribe(resource);
      cleanupVote();
      cleanupRemove();
    };
  }, [taskId, approachIdx, subscribe, unsubscribe, addMessageHandler]);

  const voteMutation = useMutation({
    mutationFn: (voteType: "upvote" | "downvote") =>
      submitVote(taskId, approachIdx, voteType),
    onMutate: async (voteType) => {
      // Optimistic update
      const previousVote = localVotes.userVote;

      setLocalVotes((prev) => {
        const next = { ...prev };

        // Remove previous vote counts
        if (previousVote === "upvote") next.upvotes--;
        if (previousVote === "downvote") next.downvotes--;

        // Add new vote
        if (voteType === "upvote") next.upvotes++;
        if (voteType === "downvote") next.downvotes++;

        next.userVote = voteType;
        return next;
      });

      return { previousVote };
    },
    onError: (err: Error, voteType, context) => {
      // Rollback on error
      if (context?.previousVote !== undefined) {
        setLocalVotes((prev) => {
          const next = { ...prev };

          // Remove the optimistic vote
          if (voteType === "upvote") next.upvotes--;
          if (voteType === "downvote") next.downvotes--;

          // Restore previous vote
          if (context.previousVote === "upvote") next.upvotes++;
          if (context.previousVote === "downvote") next.downvotes++;

          next.userVote = context.previousVote;
          return next;
        });
      }
      toast.error(err.message);
    },
    onSuccess: (data) => {
      // Ensure we have the latest server counts
      setLocalVotes((prev) => ({
        ...prev,
        upvotes: data.counts.upvotes,
        downvotes: data.counts.downvotes,
      }));
      queryClient.invalidateQueries({ queryKey: ["approach-votes", taskId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeVote(taskId, approachIdx),
    onMutate: async () => {
      const previousVote = localVotes.userVote;

      setLocalVotes((prev) => {
        const next = { ...prev };
        if (previousVote === "upvote") next.upvotes--;
        if (previousVote === "downvote") next.downvotes--;
        next.userVote = null;
        return next;
      });

      return { previousVote };
    },
    onError: (err: Error, _, context) => {
      if (context?.previousVote) {
        setLocalVotes((prev) => {
          const next = { ...prev };
          if (context.previousVote === "upvote") next.upvotes++;
          if (context.previousVote === "downvote") next.downvotes++;
          next.userVote = context.previousVote;
          return next;
        });
      }
      toast.error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approach-votes", taskId] });
    },
  });

  const handleVote = (voteType: "upvote" | "downvote") => {
    if (localVotes.userVote === voteType) {
      // Remove vote if clicking the same button
      removeMutation.mutate();
    } else {
      // Submit new vote
      voteMutation.mutate(voteType);
    }
  };

  const score = localVotes.upvotes - localVotes.downvotes;
  const totalVotes = localVotes.upvotes + localVotes.downvotes;

  if (isLoading) {
    return (
      <div className="flex items-center gap-1">
        <div className="h-6 w-6 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        <div className="h-6 w-6 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7",
                  localVotes.userVote === "upvote" &&
                    "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                )}
                onClick={() => handleVote("upvote")}
                disabled={voteMutation.isPending || removeMutation.isPending}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Upvote ({localVotes.upvotes})</p>
            </TooltipContent>
          </Tooltip>

          <span
            className={cn(
              "min-w-[1.5rem] text-center text-sm font-medium",
              score > 0 && "text-green-500",
              score < 0 && "text-red-500",
              score === 0 && "text-muted-foreground"
            )}
          >
            {score > 0 ? `+${score}` : score}
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7",
                  localVotes.userVote === "downvote" &&
                    "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                )}
                onClick={() => handleVote("downvote")}
                disabled={voteMutation.isPending || removeMutation.isPending}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Downvote ({localVotes.downvotes})</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1",
            localVotes.userVote === "upvote" &&
              "border-green-500 bg-green-500/10 text-green-500 hover:bg-green-500/20"
          )}
          onClick={() => handleVote("upvote")}
          disabled={voteMutation.isPending || removeMutation.isPending}
        >
          <ThumbsUp className="h-4 w-4" />
          <span>{localVotes.upvotes}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1",
            localVotes.userVote === "downvote" &&
              "border-red-500 bg-red-500/10 text-red-500 hover:bg-red-500/20"
          )}
          onClick={() => handleVote("downvote")}
          disabled={voteMutation.isPending || removeMutation.isPending}
        >
          <ThumbsDown className="h-4 w-4" />
          <span>{localVotes.downvotes}</span>
        </Button>
      </div>

      {totalVotes > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
        </div>
      )}
    </div>
  );
}

// Summary component showing vote distribution for all approaches
export function ApproachVoteSummary({ taskId }: { taskId: string }) {
  const { data: allVotes, isLoading } = useQuery({
    queryKey: ["approach-votes", taskId],
    queryFn: () => fetchVotes(taskId),
    staleTime: 30000,
  });

  if (isLoading || !allVotes) {
    return null;
  }

  const approaches = Object.entries(allVotes).map(([idx, votes]) => ({
    idx: parseInt(idx, 10),
    score: votes.upvotes - votes.downvotes,
    total: votes.upvotes + votes.downvotes,
  }));

  if (approaches.length === 0) {
    return null;
  }

  // Find the leading approach
  const leader = approaches.reduce((max, curr) =>
    curr.score > max.score ? curr : max
  );

  if (leader.total === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Team preference:</span>
      <span className="font-medium">
        Approach {leader.idx + 1}
        {leader.score > 0 && (
          <span className="ml-1 text-green-500">(+{leader.score})</span>
        )}
      </span>
    </div>
  );
}
