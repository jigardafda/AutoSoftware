import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Activity, BarChart3, Lightbulb, Bell } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshButton } from "@/components/RefreshButton";
import { TeamActivityMap } from "@/components/team/TeamActivityMap";
import { TeamMemberCard } from "@/components/team/TeamMemberCard";
import { WorkloadChart } from "@/components/team/WorkloadChart";
import { ActivityTimeline } from "@/components/team/ActivityTimeline";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CollaborationSuggestion {
  type: "pair" | "review" | "handoff" | "sync";
  users: Array<{ id: string; name: string | null; avatarUrl: string | null }>;
  reason: string;
  entityId: string | null;
  entityType: string | null;
  priority: "low" | "medium" | "high";
}

const suggestionTypeLabels: Record<string, string> = {
  pair: "Pairing Opportunity",
  review: "Review Needed",
  handoff: "Workload Rebalance",
  sync: "Team Sync Suggested",
};

const suggestionPriorityColors: Record<string, string> = {
  high: "text-red-500 bg-red-500/10 border-red-500/20",
  medium: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
  low: "text-blue-500 bg-blue-500/10 border-blue-500/20",
};

function getInitials(name: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return "?";
}

function TeamPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-7 w-12" />
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <Skeleton className="h-[400px]" />
        </Card>
        <Card className="p-4">
          <Skeleton className="h-[400px]" />
        </Card>
      </div>
    </div>
  );
}

export function Team() {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: api.team.getMembers,
    refetchInterval: 10000,
  });

  const { data: workloadData, isLoading: workloadLoading } = useQuery({
    queryKey: ["team-workload"],
    queryFn: api.team.getWorkload,
  });

  const { data: suggestionsData } = useQuery({
    queryKey: ["team-collaboration"],
    queryFn: api.team.getCollaborationSuggestions,
  });

  const { data: pingsData } = useQuery({
    queryKey: ["team-pings"],
    queryFn: api.team.getPings,
    refetchInterval: 30000,
  });

  const isLoading = membersLoading || workloadLoading;
  const members = membersData?.data || [];
  const workload = workloadData?.data || [];
  const suggestions: CollaborationSuggestion[] = suggestionsData?.data || [];
  const pings = pingsData?.data || [];

  // Calculate stats
  const onlineCount = members.filter((m) => m.isOnline).length;
  const activeCount = members.filter(
    (m) => m.isOnline && m.currentActivity && m.currentActivity !== "idle"
  ).length;
  const totalInProgress = workload.reduce((sum, w) => sum + w.inProgress, 0);
  const totalCompleted = workload.reduce((sum, w) => sum + w.completed, 0);

  if (isLoading) {
    return <TeamPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Team</h2>
          <Badge variant="outline" className="gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            {onlineCount} online
          </Badge>
          <RefreshButton
            queryKeys={["team-members", "team-workload", "team-activity"]}
          />
        </div>

        {/* Unread pings indicator */}
        {pings.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2">
            <Bell className="h-4 w-4" />
            <Badge variant="destructive" className="text-xs">
              {pings.length}
            </Badge>
            pings
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Users className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{onlineCount}</p>
              <p className="text-xs text-muted-foreground">Online</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active Now</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <BarChart3 className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalInProgress}</p>
              <p className="text-xs text-muted-foreground">Tasks In Progress</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Lightbulb className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{suggestions.length}</p>
              <p className="text-xs text-muted-foreground">Suggestions</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main content tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Activity Map */}
            <TeamActivityMap
              members={members}
              onMemberClick={(member) => setSelectedMemberId(member.id)}
            />

            {/* Activity Timeline */}
            <ActivityTimeline showFilters={false} limit={20} />
          </div>

          {/* Quick member cards */}
          <div>
            <h3 className="text-sm font-medium mb-3">Online Team Members</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {members
                .filter((m) => m.isOnline)
                .slice(0, 4)
                .map((member) => (
                  <TeamMemberCard
                    key={member.id}
                    member={member}
                    onViewDetails={setSelectedMemberId}
                  />
                ))}
            </div>
          </div>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {members.map((member) => (
              <TeamMemberCard
                key={member.id}
                member={member}
                onViewDetails={setSelectedMemberId}
              />
            ))}
          </div>
        </TabsContent>

        {/* Workload Tab */}
        <TabsContent value="workload" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <WorkloadChart data={workload} />
            <ActivityTimeline limit={30} />
          </div>
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions">
          {suggestions.length === 0 ? (
            <Card className="p-8 text-center">
              <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No suggestions right now</h3>
              <p className="text-sm text-muted-foreground">
                Collaboration suggestions will appear here based on team activity patterns.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((suggestion, idx) => (
                <Card
                  key={idx}
                  className={cn(
                    "border",
                    suggestionPriorityColors[suggestion.priority]
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {suggestionTypeLabels[suggestion.type] || suggestion.type}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs capitalize",
                          suggestionPriorityColors[suggestion.priority]
                        )}
                      >
                        {suggestion.priority}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      {suggestion.reason}
                    </p>
                    <div className="flex items-center gap-2">
                      {suggestion.users.map((user) => (
                        <Avatar key={user.id} className="h-8 w-8">
                          {user.avatarUrl && (
                            <AvatarImage src={user.avatarUrl} />
                          )}
                          <AvatarFallback className="text-xs">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      <span className="text-sm text-muted-foreground ml-1">
                        {suggestion.users.map((u) => u.name || "User").join(" & ")}
                      </span>
                    </div>
                    {suggestion.entityId && (
                      <Button variant="link" size="sm" className="mt-2 p-0 h-auto">
                        View {suggestion.entityType}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
