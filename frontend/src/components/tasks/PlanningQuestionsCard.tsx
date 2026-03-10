import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

interface PlanningQuestionDTO {
  id: string;
  questionKey: string;
  round: number;
  label: string;
  type: "select" | "multi_select" | "confirm";
  options: { value: string; label: string }[];
  answer: string | string[] | boolean | null;
  required: boolean;
  sortOrder: number;
}

interface PlanningQuestionsCardProps {
  taskId: string;
  questions: PlanningQuestionDTO[];
  currentRound: number;
  onSubmitted: () => void;
}

export function PlanningQuestionsCard({
  taskId,
  questions,
  currentRound,
  onSubmitted,
}: PlanningQuestionsCardProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>(() => {
    const initial: Record<string, string | string[] | boolean> = {};
    for (const q of questions) {
      if (q.type === "multi_select") {
        initial[q.questionKey] = (q.answer as string[] | null) ?? [];
      } else if (q.type === "confirm") {
        initial[q.questionKey] = (q.answer as boolean | null) ?? false;
      } else {
        initial[q.questionKey] = (q.answer as string | null) ?? "";
      }
    }
    return initial;
  });

  const submitMutation = useMutation({
    mutationFn: () => api.tasks.submitAnswers(taskId, { answers }),
    onSuccess: () => {
      toast.success("Answers submitted successfully");
      onSubmitted();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit answers");
    },
  });

  const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);

  const allRequiredAnswered = sorted
    .filter((q) => q.required)
    .every((q) => {
      const val = answers[q.questionKey];
      if (q.type === "multi_select") {
        return Array.isArray(val) && val.length > 0;
      }
      if (q.type === "confirm") {
        return typeof val === "boolean";
      }
      return typeof val === "string" && val.length > 0;
    });

  function handleSelectChange(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function handleMultiSelectToggle(key: string, optionValue: string, checked: boolean) {
    setAnswers((prev) => {
      const current = (prev[key] as string[]) || [];
      const next = checked
        ? [...current, optionValue]
        : current.filter((v) => v !== optionValue);
      return { ...prev, [key]: next };
    });
  }

  function handleConfirmChange(key: string, checked: boolean) {
    setAnswers((prev) => ({ ...prev, [key]: checked }));
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-amber-500" />
          <span className="text-amber-500">Planning — Round {currentRound}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Please answer the following questions to help the AI plan your task.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {sorted.map((q) => (
          <div key={q.id} className="space-y-2">
            <Label className="text-sm">
              {q.label}
              {q.required && <span className="text-red-500 ml-1">*</span>}
            </Label>

            {q.type === "select" && (
              <Select
                value={(answers[q.questionKey] as string) || ""}
                onValueChange={(v) => handleSelectChange(q.questionKey, v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {q.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {q.type === "multi_select" && (
              <div className="space-y-2">
                {q.options.map((opt) => {
                  const currentArr = (answers[q.questionKey] as string[]) || [];
                  return (
                    <div key={opt.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`${q.questionKey}-${opt.value}`}
                        checked={currentArr.includes(opt.value)}
                        onCheckedChange={(checked) =>
                          handleMultiSelectToggle(q.questionKey, opt.value, !!checked)
                        }
                      />
                      <Label
                        htmlFor={`${q.questionKey}-${opt.value}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {opt.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}

            {q.type === "confirm" && (
              <div className="flex items-center gap-2">
                <Switch
                  id={q.questionKey}
                  checked={!!answers[q.questionKey]}
                  onCheckedChange={(checked) => handleConfirmChange(q.questionKey, !!checked)}
                />
                <Label htmlFor={q.questionKey} className="text-sm font-normal cursor-pointer">
                  {answers[q.questionKey] ? "Yes" : "No"}
                </Label>
              </div>
            )}
          </div>
        ))}

        <Button
          className="w-full"
          disabled={!allRequiredAnswered || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending ? "Submitting..." : "Submit Answers"}
        </Button>
      </CardContent>
    </Card>
  );
}
