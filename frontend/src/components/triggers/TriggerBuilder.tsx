/**
 * TriggerBuilder Component
 *
 * Visual trigger builder with drag-drop conditions:
 * - IF/THEN/ELSE logic blocks
 * - Condition groups (AND/OR)
 * - Action configuration with parameters
 * - Preview and test mode
 */

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Play,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Zap,
  Filter,
  GitBranch,
  Bell,
  Mail,
  Webhook,
  UserPlus,
  PlayCircle,
  GripVertical,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ============================================================================
// Types
// ============================================================================

type TriggerType =
  | "task_status_change"
  | "scan_complete"
  | "time_based"
  | "file_change";

type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "less_than"
  | "in"
  | "not_in"
  | "regex"
  | "exists"
  | "not_exists";

type GroupOperator = "AND" | "OR";

type ActionType = "notify" | "auto_assign" | "run_task" | "webhook" | "email";

interface Condition {
  type: "condition";
  field: string;
  operator: ConditionOperator;
  value: any;
}

interface ConditionGroup {
  type: "group";
  operator: GroupOperator;
  conditions: (Condition | ConditionGroup)[];
}

type ConditionTree = Condition | ConditionGroup;

interface ActionConfig {
  type: ActionType;
  config: Record<string, any>;
}

interface TriggerData {
  id?: string;
  name: string;
  description: string;
  triggerType: TriggerType;
  conditions: ConditionTree;
  actions: ActionConfig[];
  enabled: boolean;
  repositoryId?: string;
  projectId?: string;
}

interface TriggerBuilderProps {
  trigger?: TriggerData;
  onSave?: (trigger: TriggerData) => void;
  onCancel?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const TRIGGER_TYPE_OPTIONS: { value: TriggerType; label: string; icon: React.ReactNode }[] = [
  {
    value: "task_status_change",
    label: "Task Status Change",
    icon: <Zap className="h-4 w-4" />,
  },
  {
    value: "scan_complete",
    label: "Scan Complete",
    icon: <Filter className="h-4 w-4" />,
  },
  {
    value: "time_based",
    label: "Time Based",
    icon: <GitBranch className="h-4 w-4" />,
  },
  {
    value: "file_change",
    label: "File Change",
    icon: <GitBranch className="h-4 w-4" />,
  },
];

const OPERATOR_OPTIONS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "in", label: "is in" },
  { value: "not_in", label: "is not in" },
  { value: "regex", label: "matches regex" },
  { value: "exists", label: "exists" },
  { value: "not_exists", label: "does not exist" },
];

const ACTION_TYPE_OPTIONS: { value: ActionType; label: string; icon: React.ReactNode }[] = [
  { value: "notify", label: "Send Notification", icon: <Bell className="h-4 w-4" /> },
  { value: "email", label: "Send Email", icon: <Mail className="h-4 w-4" /> },
  { value: "webhook", label: "Call Webhook", icon: <Webhook className="h-4 w-4" /> },
  { value: "auto_assign", label: "Auto Assign", icon: <UserPlus className="h-4 w-4" /> },
  { value: "run_task", label: "Run Task", icon: <PlayCircle className="h-4 w-4" /> },
];

const FIELD_OPTIONS: Record<TriggerType, { value: string; label: string }[]> = {
  task_status_change: [
    { value: "newStatus", label: "New Status" },
    { value: "oldStatus", label: "Old Status" },
    { value: "taskType", label: "Task Type" },
    { value: "priority", label: "Priority" },
    { value: "taskTitle", label: "Task Title" },
    { value: "repositoryName", label: "Repository" },
  ],
  scan_complete: [
    { value: "status", label: "Status" },
    { value: "tasksCreated", label: "Tasks Created" },
    { value: "branch", label: "Branch" },
    { value: "repositoryName", label: "Repository" },
  ],
  time_based: [
    { value: "hour", label: "Hour" },
    { value: "dayOfWeek", label: "Day of Week" },
    { value: "dayOfMonth", label: "Day of Month" },
  ],
  file_change: [
    { value: "filePath", label: "File Path" },
    { value: "fileName", label: "File Name" },
    { value: "extension", label: "Extension" },
    { value: "changeType", label: "Change Type" },
  ],
};

// ============================================================================
// Helper Components
// ============================================================================

function ConditionEditor({
  condition,
  triggerType,
  onChange,
  onRemove,
}: {
  condition: Condition;
  triggerType: TriggerType;
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const fields = FIELD_OPTIONS[triggerType] || [];

  return (
    <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />

      <Select
        value={condition.field}
        onValueChange={(v) => onChange({ ...condition, field: v })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Field" />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition.operator}
        onValueChange={(v) =>
          onChange({ ...condition, operator: v as ConditionOperator })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Operator" />
        </SelectTrigger>
        <SelectContent>
          {OPERATOR_OPTIONS.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {condition.operator !== "exists" && condition.operator !== "not_exists" && (
        <Input
          value={condition.value ?? ""}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="Value"
          className="flex-1 min-w-[100px]"
        />
      )}

      <Button variant="ghost" size="icon" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function ConditionGroupEditor({
  group,
  triggerType,
  onChange,
  onRemove,
  depth = 0,
}: {
  group: ConditionGroup;
  triggerType: TriggerType;
  onChange: (g: ConditionGroup) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(true);

  const addCondition = () => {
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        { type: "condition", field: "", operator: "equals", value: "" },
      ],
    });
  };

  const addGroup = () => {
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        { type: "group", operator: "AND", conditions: [] },
      ],
    });
  };

  const updateCondition = (index: number, updated: Condition | ConditionGroup) => {
    const newConditions = [...group.conditions];
    newConditions[index] = updated;
    onChange({ ...group, conditions: newConditions });
  };

  const removeCondition = (index: number) => {
    onChange({
      ...group,
      conditions: group.conditions.filter((_, i) => i !== index),
    });
  };

  return (
    <Card className={cn("border-l-4", depth === 0 ? "border-l-primary" : "border-l-muted-foreground/30")}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="py-3">
          <div className="flex items-center gap-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>

            <Select
              value={group.operator}
              onValueChange={(v) =>
                onChange({ ...group, operator: v as GroupOperator })
              }
            >
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND</SelectItem>
                <SelectItem value="OR">OR</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground">
              {group.conditions.length} condition{group.conditions.length !== 1 ? "s" : ""}
            </span>

            <div className="flex-1" />

            {onRemove && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {group.conditions.map((cond, i) => (
              <div key={i}>
                {cond.type === "condition" ? (
                  <ConditionEditor
                    condition={cond}
                    triggerType={triggerType}
                    onChange={(c) => updateCondition(i, c)}
                    onRemove={() => removeCondition(i)}
                  />
                ) : (
                  <ConditionGroupEditor
                    group={cond}
                    triggerType={triggerType}
                    onChange={(g) => updateCondition(i, g)}
                    onRemove={() => removeCondition(i)}
                    depth={depth + 1}
                  />
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="h-3 w-3 mr-1" />
                Condition
              </Button>
              <Button variant="outline" size="sm" onClick={addGroup}>
                <Plus className="h-3 w-3 mr-1" />
                Group
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function ActionEditor({
  action,
  onChange,
  onRemove,
}: {
  action: ActionConfig;
  onChange: (a: ActionConfig) => void;
  onRemove: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  const updateConfig = (key: string, value: any) => {
    onChange({
      ...action,
      config: { ...action.config, [key]: value },
    });
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="py-3">
          <div className="flex items-center gap-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>

            <Select
              value={action.type}
              onValueChange={(v) =>
                onChange({ ...action, type: v as ActionType, config: {} })
              }
            >
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      {opt.icon}
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {action.type === "notify" && (
              <>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select
                    value={action.config.channel || "in_app"}
                    onValueChange={(v) => updateConfig("channel", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_app">In-App</SelectItem>
                      <SelectItem value="push">Push Notification</SelectItem>
                      <SelectItem value="slack">Slack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={action.config.title || ""}
                    onChange={(e) => updateConfig("title", e.target.value)}
                    placeholder="Notification title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea
                    value={action.config.message || ""}
                    onChange={(e) => updateConfig("message", e.target.value)}
                    placeholder="Use {{fieldName}} for dynamic values"
                  />
                </div>
              </>
            )}

            {action.type === "email" && (
              <>
                <div className="space-y-2">
                  <Label>To</Label>
                  <Input
                    value={action.config.to || ""}
                    onChange={(e) => updateConfig("to", e.target.value)}
                    placeholder="email@example.com"
                    type="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={action.config.subject || ""}
                    onChange={(e) => updateConfig("subject", e.target.value)}
                    placeholder="Email subject"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Body</Label>
                  <Textarea
                    value={action.config.body || ""}
                    onChange={(e) => updateConfig("body", e.target.value)}
                    placeholder="Use {{fieldName}} for dynamic values"
                    rows={4}
                  />
                </div>
              </>
            )}

            {action.type === "webhook" && (
              <>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    value={action.config.url || ""}
                    onChange={(e) => updateConfig("url", e.target.value)}
                    placeholder="https://api.example.com/webhook"
                    type="url"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select
                    value={action.config.method || "POST"}
                    onValueChange={(v) => updateConfig("method", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Headers (JSON)</Label>
                  <Textarea
                    value={action.config.headers ? JSON.stringify(action.config.headers, null, 2) : ""}
                    onChange={(e) => {
                      try {
                        updateConfig("headers", JSON.parse(e.target.value));
                      } catch {
                        // Invalid JSON, ignore
                      }
                    }}
                    placeholder='{"Authorization": "Bearer token"}'
                    rows={2}
                  />
                </div>
              </>
            )}

            {action.type === "auto_assign" && (
              <div className="space-y-2">
                <Label>Assign To</Label>
                <Input
                  value={action.config.assignTo || ""}
                  onChange={(e) => updateConfig("assignTo", e.target.value)}
                  placeholder="User or team identifier"
                />
              </div>
            )}

            {action.type === "run_task" && (
              <>
                <div className="space-y-2">
                  <Label>Task ID (optional)</Label>
                  <Input
                    value={action.config.taskId || ""}
                    onChange={(e) => updateConfig("taskId", e.target.value)}
                    placeholder="Leave empty to use triggering task"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select
                    value={action.config.action || "execute"}
                    onValueChange={(v) => updateConfig("action", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="execute">Execute</SelectItem>
                      <SelectItem value="plan">Plan</SelectItem>
                      <SelectItem value="cancel">Cancel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TriggerBuilder({ trigger, onSave, onCancel }: TriggerBuilderProps) {
  const queryClient = useQueryClient();
  const isEditing = !!trigger?.id;

  const [name, setName] = useState(trigger?.name || "");
  const [description, setDescription] = useState(trigger?.description || "");
  const [triggerType, setTriggerType] = useState<TriggerType>(
    trigger?.triggerType || "task_status_change"
  );
  const [conditions, setConditions] = useState<ConditionGroup>(
    (trigger?.conditions as ConditionGroup) || {
      type: "group",
      operator: "AND",
      conditions: [],
    }
  );
  const [actions, setActions] = useState<ActionConfig[]>(
    trigger?.actions || []
  );
  const [enabled, setEnabled] = useState(trigger?.enabled ?? true);

  const [testData, setTestData] = useState("{}");
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (data: TriggerData) => {
      if (isEditing) {
        return api.triggers.update(trigger.id!, data);
      }
      return api.triggers.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triggers"] });
      toast.success(isEditing ? "Trigger updated" : "Trigger created");
      onSave?.({
        name,
        description,
        triggerType,
        conditions,
        actions,
        enabled,
      });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save trigger");
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Please enter a trigger name");
      return;
    }
    if (conditions.conditions.length === 0) {
      toast.error("Please add at least one condition");
      return;
    }
    if (actions.length === 0) {
      toast.error("Please add at least one action");
      return;
    }

    saveMutation.mutate({
      name,
      description,
      triggerType,
      conditions,
      actions,
      enabled,
    });
  };

  const handleTest = useCallback(async () => {
    if (!trigger?.id) {
      toast.error("Please save the trigger before testing");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const data = JSON.parse(testData);
      const result = await api.triggers.test(trigger.id, data);
      setTestResult(result.data);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        toast.error("Invalid JSON in test data");
      } else {
        toast.error(err.message || "Test failed");
      }
    } finally {
      setIsTesting(false);
    }
  }, [trigger?.id, testData]);

  const addAction = () => {
    setActions([
      ...actions,
      { type: "notify", config: { channel: "in_app", title: "", message: "" } },
    ]);
  };

  const updateAction = (index: number, updated: ActionConfig) => {
    const newActions = [...actions];
    newActions[index] = updated;
    setActions(newActions);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {isEditing ? "Edit Trigger" : "Create Trigger"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure automated workflows based on events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Label htmlFor="enabled" className="text-sm">
              Enabled
            </Label>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Trigger"
              />
            </div>
            <div className="space-y-2">
              <Label>Trigger Type</Label>
              <Select
                value={triggerType}
                onValueChange={(v) => setTriggerType(v as TriggerType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        {opt.icon}
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this trigger do?"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* IF - Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="secondary" className="bg-blue-500/10 text-blue-500">
              IF
            </Badge>
            Conditions
          </CardTitle>
          <CardDescription>
            Define when this trigger should fire
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConditionGroupEditor
            group={conditions}
            triggerType={triggerType}
            onChange={setConditions}
          />
        </CardContent>
      </Card>

      {/* THEN - Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-500/10 text-green-500">
                  THEN
                </Badge>
                Actions
              </CardTitle>
              <CardDescription>
                Define what happens when conditions are met
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addAction}>
              <Plus className="h-4 w-4 mr-2" />
              Add Action
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {actions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No actions configured</p>
              <p className="text-sm">Add an action to define what happens when conditions are met</p>
            </div>
          ) : (
            actions.map((action, i) => (
              <ActionEditor
                key={i}
                action={action}
                onChange={(a) => updateAction(i, a)}
                onRemove={() => removeAction(i)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Test Mode */}
      {isEditing && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Test Trigger
                </CardTitle>
                <CardDescription>
                  Test your trigger with sample data
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={isTesting}
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Run Test
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Test Data (JSON)</Label>
              <Textarea
                value={testData}
                onChange={(e) => setTestData(e.target.value)}
                placeholder='{"newStatus": "completed", "taskType": "bugfix"}'
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            {testResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {testResult.conditionsMet ? (
                    <Badge className="bg-green-500/10 text-green-500">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Conditions Met
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-amber-500">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Conditions Not Met
                    </Badge>
                  )}
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm font-medium mb-2">Condition Results:</p>
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(testResult.conditionResults, null, 2)}
                  </pre>
                </div>

                {testResult.conditionsMet && testResult.wouldExecuteActions.length > 0 && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                    <p className="text-sm font-medium mb-2 text-green-600">
                      Would Execute {testResult.wouldExecuteActions.length} Action(s):
                    </p>
                    <ul className="text-sm space-y-1">
                      {testResult.wouldExecuteActions.map((a: ActionConfig, i: number) => (
                        <li key={i} className="flex items-center gap-2">
                          {ACTION_TYPE_OPTIONS.find((opt) => opt.value === a.type)?.icon}
                          {ACTION_TYPE_OPTIONS.find((opt) => opt.value === a.type)?.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TriggerBuilder;
