import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  isOnline: boolean;
  currentActivity: string | null;
  currentEntityId: string | null;
  currentEntityType: string | null;
  lastActivityAt: string | null;
  taskCount: number;
  completedToday: number;
}

interface TeamActivityMapProps {
  members?: TeamMember[];
  onMemberClick?: (member: TeamMember) => void;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.charAt(0).toUpperCase();
}

// Generate positions for members in a circular/grid layout
function generatePositions(
  count: number,
  width: number,
  height: number
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const padding = 80;

  if (count <= 6) {
    // Circular layout for small teams
    const radius = Math.min(width, height) / 2 - padding;
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      positions.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    }
  } else {
    // Grid layout for larger teams
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const cellWidth = (width - padding * 2) / cols;
    const cellHeight = (height - padding * 2) / rows;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.push({
        x: padding + cellWidth * (col + 0.5),
        y: padding + cellHeight * (row + 0.5),
      });
    }
  }

  return positions;
}

// Find collaborators based on shared entity work
function findCollaborators(
  members: TeamMember[]
): Array<{ from: number; to: number; entityId: string }> {
  const collaborations: Array<{ from: number; to: number; entityId: string }> =
    [];
  const entityWorkers = new Map<string, number[]>();

  members.forEach((member, index) => {
    if (member.currentEntityId && member.isOnline) {
      const workers = entityWorkers.get(member.currentEntityId) || [];
      workers.push(index);
      entityWorkers.set(member.currentEntityId, workers);
    }
  });

  for (const [entityId, workers] of entityWorkers) {
    if (workers.length >= 2) {
      for (let i = 0; i < workers.length - 1; i++) {
        for (let j = i + 1; j < workers.length; j++) {
          collaborations.push({
            from: workers[i],
            to: workers[j],
            entityId,
          });
        }
      }
    }
  }

  return collaborations;
}

// Get activity intensity color
function getActivityIntensity(member: TeamMember): string {
  if (!member.isOnline) return "bg-gray-300 dark:bg-gray-600";

  const now = Date.now();
  const lastActivity = member.lastActivityAt
    ? new Date(member.lastActivityAt).getTime()
    : 0;
  const minutesAgo = (now - lastActivity) / (1000 * 60);

  if (minutesAgo < 2) return "bg-green-500"; // Very active
  if (minutesAgo < 5) return "bg-green-400"; // Active
  if (minutesAgo < 15) return "bg-yellow-400"; // Somewhat active
  if (minutesAgo < 30) return "bg-orange-400"; // Less active
  return "bg-gray-400"; // Idle
}

export function TeamActivityMap({ members, onMemberClick }: TeamActivityMapProps) {
  const [zoom, setZoom] = useState(1);
  const [dimensions] = useState({ width: 600, height: 400 });

  const { data: teamMembers } = useQuery({
    queryKey: ["team-members"],
    queryFn: api.team.getMembers,
    refetchInterval: 10000,
    enabled: !members,
  });

  const displayMembers = members || teamMembers?.data || [];
  const positions = useMemo(
    () => generatePositions(displayMembers.length, dimensions.width, dimensions.height),
    [displayMembers.length, dimensions.width, dimensions.height]
  );
  const collaborations = useMemo(
    () => findCollaborators(displayMembers),
    [displayMembers]
  );

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.25, 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.25, 0.5));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Team Activity Map</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Active
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            Away
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            Offline
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <div
          className="relative overflow-hidden rounded-lg bg-muted/30 border"
          style={{
            width: "100%",
            height: dimensions.height * zoom,
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            className="absolute inset-0"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
          >
            {/* Collaboration lines */}
            {collaborations.map((collab, idx) => (
              <line
                key={`collab-${idx}`}
                x1={positions[collab.from]?.x || 0}
                y1={positions[collab.from]?.y || 0}
                x2={positions[collab.to]?.x || 0}
                y2={positions[collab.to]?.y || 0}
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray="4 4"
                className="text-primary/40 animate-pulse"
              />
            ))}
          </svg>

          {/* Member bubbles */}
          <TooltipProvider>
            {displayMembers.map((member, index) => {
              const pos = positions[index];
              if (!pos) return null;

              const intensityClass = getActivityIntensity(member);

              return (
                <Tooltip key={member.id}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300",
                        "hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
                      )}
                      style={{
                        left: `${(pos.x / dimensions.width) * 100}%`,
                        top: `${(pos.y / dimensions.height) * 100}%`,
                      }}
                      onClick={() => onMemberClick?.(member)}
                    >
                      <div className="relative">
                        {/* Activity intensity ring */}
                        <div
                          className={cn(
                            "absolute -inset-1 rounded-full opacity-30",
                            intensityClass,
                            member.isOnline && "animate-pulse"
                          )}
                        />
                        <Avatar className="h-10 w-10 border-2 border-background shadow-md">
                          {member.avatarUrl && (
                            <AvatarImage
                              src={member.avatarUrl}
                              alt={member.name || ""}
                            />
                          )}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(member.name, member.email)}
                          </AvatarFallback>
                        </Avatar>
                        {/* Online indicator */}
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                            member.isOnline ? "bg-green-500" : "bg-gray-400"
                          )}
                        />
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-medium">{member.name || member.email}</p>
                      {member.currentActivity && (
                        <p className="text-xs text-muted-foreground">
                          {member.currentActivity.replace(/_/g, " ")}
                        </p>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Badge variant="secondary" className="text-xs">
                          {member.taskCount} active
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-xs text-green-600"
                        >
                          {member.completedToday} done
                        </Badge>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>

        {/* Legend for collaboration lines */}
        {collaborations.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Dashed lines connect team members working on the same item
          </p>
        )}
      </CardContent>
    </Card>
  );
}
