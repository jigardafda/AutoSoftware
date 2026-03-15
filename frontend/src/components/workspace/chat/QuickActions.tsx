import {
  GitPullRequestArrow,
  ClipboardList,
  MessageSquare,
  Lightbulb,
  Bug,
  Sparkles,
  FileCode2,
  TestTube,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon: typeof Lightbulb;
  color?: string;
}

interface QuickActionsProps {
  actions: QuickAction[];
  onSelect: (prompt: string) => void;
  className?: string;
}

export function QuickActions({ actions, onSelect, className }: QuickActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2 justify-center", className)}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={() => onSelect(action.prompt)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/80 px-3 py-2 text-xs font-medium",
              "hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all duration-200",
              "shadow-sm hover:shadow"
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", action.color || "text-muted-foreground")} />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Build quick actions based on workspace context (linked PR review, task, etc.)
 */
export function buildQuickActions(workspace: any): QuickAction[] {
  const actions: QuickAction[] = [];
  const hasWorkingDir = !!(workspace?.worktreePath || workspace?.localPath);

  if (workspace?.prReview) {
    const review = workspace.prReview;

    actions.push({
      id: "pr-summary",
      label: "Summarize PR findings",
      prompt: "Please summarize the key findings from the PR review and suggest which issues to address first.",
      icon: GitPullRequestArrow,
      color: "text-purple-500",
    });

    if (review.verdict === "request_changes" && hasWorkingDir) {
      actions.push({
        id: "fix-issues",
        label: "Fix review issues",
        prompt: "Please look at the current code and fix the issues that were identified in the PR review. Start with the critical issues first.",
        icon: Bug,
        color: "text-red-500",
      });
    }

    actions.push({
      id: "pr-improvements",
      label: hasWorkingDir ? "Suggest improvements" : "Suggest approach",
      prompt: hasWorkingDir
        ? "Review the code in this workspace and suggest improvements beyond what was found in the PR review."
        : "Based on the PR review findings, suggest an approach for addressing the issues and improving the code.",
      icon: Sparkles,
      color: "text-amber-500",
    });
  }

  if (workspace?.task || workspace?.taskId) {
    const task = workspace.task;

    if (hasWorkingDir) {
      actions.push({
        id: "implement-task",
        label: "Implement this task",
        prompt: `Please analyze the codebase and implement this task. Start by understanding what needs to be done, then make the changes.`,
        icon: ClipboardList,
        color: "text-blue-500",
      });

      if (task?.enhancedPlan) {
        actions.push({
          id: "follow-plan",
          label: "Follow the plan",
          prompt: `There is an implementation plan for this task. Please follow it step by step, starting from where we left off.`,
          icon: Lightbulb,
          color: "text-amber-500",
        });
      } else {
        actions.push({
          id: "task-plan",
          label: "Create implementation plan",
          prompt: `Please create a detailed implementation plan for this task. List the files that need to be changed, the order of changes, and any potential risks or dependencies.`,
          icon: Lightbulb,
          color: "text-amber-500",
        });
      }
    } else {
      // No working directory — offer planning-only actions
      actions.push({
        id: "task-plan",
        label: "Create implementation plan",
        prompt: `Please create a detailed implementation plan for this task based on the description. Include the files that would need to be created or changed, the architecture approach, and step-by-step instructions.`,
        icon: ClipboardList,
        color: "text-blue-500",
      });

      actions.push({
        id: "task-discuss",
        label: "Discuss approach",
        prompt: `Let's discuss the best approach for this task. What are the key considerations, potential challenges, and trade-offs?`,
        icon: MessageSquare,
        color: "text-purple-500",
      });

      actions.push({
        id: "task-pseudocode",
        label: "Write pseudocode",
        prompt: `Please write detailed pseudocode or code snippets for implementing this task. Include the key functions, data structures, and logic flow.`,
        icon: FileCode2,
        color: "text-amber-500",
      });
    }
  }

  // Generic actions (always available)
  if (actions.length === 0) {
    if (hasWorkingDir) {
      actions.push(
        {
          id: "explore",
          label: "Explore codebase",
          prompt: "Help me understand this codebase. What's the project structure, main technologies used, and key files?",
          icon: FileCode2,
          color: "text-blue-500",
        },
        {
          id: "find-bugs",
          label: "Find bugs",
          prompt: "Scan the codebase for potential bugs, security issues, or code quality problems. Focus on the most impactful issues.",
          icon: Bug,
          color: "text-red-500",
        },
        {
          id: "write-tests",
          label: "Write tests",
          prompt: "Identify the most critical code paths that lack test coverage and write tests for them.",
          icon: TestTube,
          color: "text-green-500",
        },
        {
          id: "review-code",
          label: "Review recent changes",
          prompt: "Review the recent changes in this workspace. Check for bugs, performance issues, and suggest improvements.",
          icon: MessageSquare,
          color: "text-purple-500",
        },
      );
    } else {
      actions.push(
        {
          id: "discuss",
          label: "Start a discussion",
          prompt: "Let's discuss what needs to be done in this workspace. What would you like to work on?",
          icon: MessageSquare,
          color: "text-blue-500",
        },
        {
          id: "brainstorm",
          label: "Brainstorm ideas",
          prompt: "Help me brainstorm ideas and approaches for this project.",
          icon: Lightbulb,
          color: "text-amber-500",
        },
      );
    }
  }

  return actions;
}
