import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Lightbulb,
  Check,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
  Scale,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ApproachTradeoff {
  pros: string[];
  cons: string[];
}

interface ImplementationApproach {
  name: string;
  description: string;
  tradeoffs: ApproachTradeoff;
  complexity: "low" | "medium" | "high";
  estimatedTime: string;
  affectedAreas: string[];
  isRecommended: boolean;
  reasoning: string;
}

interface ApproachSelectorProps {
  taskId: string;
  approaches: ImplementationApproach[];
  selectedIndex: number | null;
  analysisContext?: string;
  onSelected: () => void;
}

const complexityConfig = {
  low: {
    label: "Low",
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: Zap,
  },
  medium: {
    label: "Medium",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    icon: Scale,
  },
  high: {
    label: "High",
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: AlertTriangle,
  },
};

export function ApproachSelector({
  taskId,
  approaches,
  selectedIndex,
  analysisContext,
  onSelected,
}: ApproachSelectorProps) {
  const [selected, setSelected] = useState<number>(
    selectedIndex !== null ? selectedIndex : approaches.findIndex((a) => a.isRecommended)
  );
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const selectMutation = useMutation({
    mutationFn: (index: number) => api.tasks.selectApproach(taskId, index),
    onSuccess: () => {
      toast.success("Approach selected! Continuing with planning...");
      onSelected();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to select approach");
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => api.tasks.regenerateApproaches(taskId),
    onSuccess: () => {
      toast.success("Regenerating approaches...");
      onSelected();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to regenerate approaches");
    },
  });

  const handleSelect = (index: number) => {
    setSelected(index);
  };

  const handleConfirm = () => {
    if (selected >= 0) {
      selectMutation.mutate(selected);
    }
  };

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <Card className="border-indigo-500/30 bg-indigo-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-base text-indigo-500">
              Choose Implementation Approach
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-1", regenerateMutation.isPending && "animate-spin")}
            />
            Regenerate
          </Button>
        </div>
        <CardDescription>
          The AI has analyzed your task and generated {approaches.length} possible approaches.
          Review the tradeoffs and select the one that best fits your needs.
        </CardDescription>
        {analysisContext && (
          <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded">
            <strong>Analysis:</strong> {analysisContext}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {approaches.map((approach, index) => {
          const isSelected = selected === index;
          const isExpanded = expandedIndex === index;
          const complexity = complexityConfig[approach.complexity];
          const ComplexityIcon = complexity.icon;

          return (
            <div
              key={index}
              className={cn(
                "border rounded-lg transition-all cursor-pointer",
                isSelected
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-border hover:border-muted-foreground/50"
              )}
              onClick={() => handleSelect(index)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm">{approach.name}</h3>
                      {approach.isRecommended && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Star className="h-3 w-3" />
                          Recommended
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn("text-xs", complexity.color)}>
                        <ComplexityIcon className="h-3 w-3 mr-1" />
                        {complexity.label} Complexity
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {approach.estimatedTime}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {approach.description}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                      isSelected
                        ? "border-indigo-500 bg-indigo-500"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </div>

                <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(index)}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 w-full justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(index);
                      }}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Hide Details
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Show Tradeoffs
                        </>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-3">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                        <h4 className="text-xs font-medium text-green-500 mb-2 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Pros
                        </h4>
                        <ul className="space-y-1">
                          {approach.tradeoffs?.pros?.map((pro, i) => (
                            <li
                              key={i}
                              className="text-xs text-muted-foreground flex items-start gap-1"
                            >
                              <span className="text-green-500 mt-0.5">+</span>
                              {pro}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                        <h4 className="text-xs font-medium text-red-500 mb-2 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Cons
                        </h4>
                        <ul className="space-y-1">
                          {approach.tradeoffs?.cons?.map((con, i) => (
                            <li
                              key={i}
                              className="text-xs text-muted-foreground flex items-start gap-1"
                            >
                              <span className="text-red-500 mt-0.5">-</span>
                              {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {approach.affectedAreas && approach.affectedAreas.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-1">
                          Affected Areas
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {approach.affectedAreas.map((area, i) => (
                            <Badge key={i} variant="outline" className="text-xs font-mono">
                              {area}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {approach.reasoning && (
                      <div className="bg-muted/50 rounded p-2">
                        <p className="text-xs text-muted-foreground">
                          <strong>Reasoning:</strong> {approach.reasoning}
                        </p>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          );
        })}

        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1"
            disabled={selected < 0 || selectMutation.isPending}
            onClick={handleConfirm}
          >
            {selectMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Confirm Selection & Continue
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
