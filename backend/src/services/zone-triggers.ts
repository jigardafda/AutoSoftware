/**
 * Zone Triggers Service
 *
 * Workflow automation based on conditions. Supports:
 * - Trigger types: task_status_change, scan_complete, time_based, file_change
 * - Actions: notify, auto_assign, run_task, webhook, email
 * - Complex condition evaluation with AND/OR groups
 * - Retry logic for failed executions
 */

import { prisma } from "../db.js";
import { schedulerService } from "./scheduler.js";

// ============================================================================
// Types
// ============================================================================

export type TriggerType =
  | "task_status_change"
  | "scan_complete"
  | "time_based"
  | "file_change";

export type ActionType =
  | "notify"
  | "auto_assign"
  | "run_task"
  | "webhook"
  | "email";

export type ConditionOperator =
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

export type GroupOperator = "AND" | "OR";

export interface Condition {
  type: "condition";
  field: string;
  operator: ConditionOperator;
  value: any;
}

export interface ConditionGroup {
  type: "group";
  operator: GroupOperator;
  conditions: (Condition | ConditionGroup)[];
}

export type ConditionTree = Condition | ConditionGroup;

export interface ActionConfig {
  type: ActionType;
  config: Record<string, any>;
}

export interface TriggerEvent {
  type: TriggerType;
  data: Record<string, any>;
  userId: string;
  repositoryId?: string;
  projectId?: string;
  timestamp: Date;
}

export interface ExecutionResult {
  success: boolean;
  actionResults: {
    type: ActionType;
    success: boolean;
    output?: any;
    error?: string;
  }[];
  error?: string;
  durationMs: number;
}

// ============================================================================
// Condition Evaluation Engine
// ============================================================================

/**
 * Evaluates a condition tree against event data
 */
export function evaluateConditions(
  conditionTree: ConditionTree,
  data: Record<string, any>
): boolean {
  if (conditionTree.type === "condition") {
    return evaluateSingleCondition(conditionTree, data);
  }

  // It's a group
  const group = conditionTree as ConditionGroup;
  const results = group.conditions.map((c) => evaluateConditions(c, data));

  if (group.operator === "AND") {
    return results.every((r) => r);
  } else {
    return results.some((r) => r);
  }
}

/**
 * Evaluates a single condition against event data
 */
function evaluateSingleCondition(
  condition: Condition,
  data: Record<string, any>
): boolean {
  const value = getNestedValue(data, condition.field);
  const targetValue = condition.value;

  switch (condition.operator) {
    case "equals":
      return value === targetValue;

    case "not_equals":
      return value !== targetValue;

    case "contains":
      if (typeof value === "string") {
        return value.includes(targetValue);
      }
      if (Array.isArray(value)) {
        return value.includes(targetValue);
      }
      return false;

    case "not_contains":
      if (typeof value === "string") {
        return !value.includes(targetValue);
      }
      if (Array.isArray(value)) {
        return !value.includes(targetValue);
      }
      return true;

    case "greater_than":
      return typeof value === "number" && value > targetValue;

    case "less_than":
      return typeof value === "number" && value < targetValue;

    case "in":
      return Array.isArray(targetValue) && targetValue.includes(value);

    case "not_in":
      return Array.isArray(targetValue) && !targetValue.includes(value);

    case "regex":
      try {
        const regex = new RegExp(targetValue);
        return typeof value === "string" && regex.test(value);
      } catch {
        return false;
      }

    case "exists":
      return value !== undefined && value !== null;

    case "not_exists":
      return value === undefined || value === null;

    default:
      return false;
  }
}

/**
 * Gets a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split(".").reduce((current, key) => {
    return current?.[key];
  }, obj);
}

// ============================================================================
// Action Executors
// ============================================================================

async function executeNotifyAction(
  config: Record<string, any>,
  event: TriggerEvent
): Promise<{ success: boolean; output?: any; error?: string }> {
  try {
    const { channel, message, title } = config;

    // For now, log the notification (in production, integrate with notification system)
    console.log(`[Trigger Notify] ${channel}: ${title} - ${message}`);

    // TODO: Integrate with actual notification channels
    // - In-app notifications via WebSocket
    // - Push notifications
    // - Slack/Discord webhooks

    return {
      success: true,
      output: { channel, message, delivered: true },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Notification failed",
    };
  }
}

async function executeAutoAssignAction(
  config: Record<string, any>,
  event: TriggerEvent
): Promise<{ success: boolean; output?: any; error?: string }> {
  try {
    const { assignTo, taskId } = config;
    const targetTaskId = taskId || event.data.taskId;

    if (!targetTaskId) {
      return { success: false, error: "No task ID provided for auto-assign" };
    }

    // Update task assignment
    await prisma.task.update({
      where: { id: targetTaskId },
      data: {
        // In a real implementation, you'd have an assignedTo field
        metadata: {
          autoAssigned: true,
          assignedTo: assignTo,
          assignedAt: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      output: { taskId: targetTaskId, assignedTo: assignTo },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Auto-assign failed",
    };
  }
}

async function executeRunTaskAction(
  config: Record<string, any>,
  event: TriggerEvent
): Promise<{ success: boolean; output?: any; error?: string }> {
  try {
    const { taskId, action } = config;

    if (!taskId) {
      return { success: false, error: "No task ID provided" };
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return { success: false, error: "Task not found" };
    }

    // Execute based on action type
    switch (action) {
      case "execute":
        await schedulerService.queueTaskExecution(taskId);
        return {
          success: true,
          output: { taskId, action: "queued_for_execution" },
        };

      case "plan":
        await schedulerService.queueTaskPlanning(taskId);
        return {
          success: true,
          output: { taskId, action: "queued_for_planning" },
        };

      case "cancel":
        await prisma.task.update({
          where: { id: taskId },
          data: { status: "cancelled" },
        });
        return { success: true, output: { taskId, action: "cancelled" } };

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Run task failed",
    };
  }
}

async function executeWebhookAction(
  config: Record<string, any>,
  event: TriggerEvent
): Promise<{ success: boolean; output?: any; error?: string }> {
  try {
    const { url, method = "POST", headers = {}, body } = config;

    if (!url) {
      return { success: false, error: "No webhook URL provided" };
    }

    // Interpolate event data into body
    const interpolatedBody = body
      ? JSON.parse(
          JSON.stringify(body).replace(
            /\{\{(\w+(?:\.\w+)*)\}\}/g,
            (_match, path) => {
              const value = getNestedValue(event.data, path);
              return value !== undefined ? String(value) : "";
            }
          )
        )
      : event.data;

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(interpolatedBody),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Webhook returned ${response.status}: ${response.statusText}`,
      };
    }

    const responseData = await response.json().catch(() => ({}));

    return {
      success: true,
      output: {
        status: response.status,
        data: responseData,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Webhook failed",
    };
  }
}

async function executeEmailAction(
  config: Record<string, any>,
  event: TriggerEvent
): Promise<{ success: boolean; output?: any; error?: string }> {
  try {
    const { to, subject, body, template } = config;

    if (!to) {
      return { success: false, error: "No email recipient provided" };
    }

    // Interpolate event data into subject and body
    const interpolate = (str: string) =>
      str.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path) => {
        const value = getNestedValue(event.data, path);
        return value !== undefined ? String(value) : "";
      });

    const emailSubject = interpolate(subject || "Trigger Notification");
    const emailBody = interpolate(body || JSON.stringify(event.data, null, 2));

    // TODO: Integrate with email service (SendGrid, SES, etc.)
    console.log(`[Trigger Email] To: ${to}`);
    console.log(`Subject: ${emailSubject}`);
    console.log(`Body: ${emailBody}`);

    return {
      success: true,
      output: { to, subject: emailSubject, sent: true },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Email failed",
    };
  }
}

// ============================================================================
// Trigger Execution Service
// ============================================================================

/**
 * Execute a single action with retry logic
 */
async function executeActionWithRetry(
  action: ActionConfig,
  event: TriggerEvent,
  maxRetries: number = 3,
  retryDelayMs: number = 1000
): Promise<{ type: ActionType; success: boolean; output?: any; error?: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let result: { success: boolean; output?: any; error?: string };

    switch (action.type) {
      case "notify":
        result = await executeNotifyAction(action.config, event);
        break;
      case "auto_assign":
        result = await executeAutoAssignAction(action.config, event);
        break;
      case "run_task":
        result = await executeRunTaskAction(action.config, event);
        break;
      case "webhook":
        result = await executeWebhookAction(action.config, event);
        break;
      case "email":
        result = await executeEmailAction(action.config, event);
        break;
      default:
        return {
          type: action.type,
          success: false,
          error: `Unknown action type: ${action.type}`,
        };
    }

    if (result.success) {
      return { type: action.type, ...result };
    }

    lastError = result.error;

    // Don't retry on last attempt
    if (attempt < maxRetries) {
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelayMs * attempt)
      );
    }
  }

  return {
    type: action.type,
    success: false,
    error: `Failed after ${maxRetries} attempts: ${lastError}`,
  };
}

/**
 * Execute a trigger with all its actions
 */
async function executeTrigger(
  triggerId: string,
  event: TriggerEvent
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    const trigger = await prisma.trigger.findUnique({
      where: { id: triggerId },
    });

    if (!trigger || !trigger.enabled) {
      return {
        success: false,
        actionResults: [],
        error: "Trigger not found or disabled",
        durationMs: Date.now() - startTime,
      };
    }

    // Evaluate conditions
    const conditions = trigger.conditions as ConditionTree;
    if (!evaluateConditions(conditions, event.data)) {
      // Record skipped execution
      await prisma.triggerExecution.create({
        data: {
          triggerId,
          status: "skipped",
          inputData: event.data,
          durationMs: Date.now() - startTime,
        },
      });

      return {
        success: true,
        actionResults: [],
        error: "Conditions not met - skipped",
        durationMs: Date.now() - startTime,
      };
    }

    // Execute all actions
    const actions = trigger.actions as ActionConfig[];
    const actionResults = await Promise.all(
      actions.map((action) => executeActionWithRetry(action, event))
    );

    const allSuccess = actionResults.every((r) => r.success);
    const executionStatus = allSuccess ? "success" : "failed";

    // Update trigger metadata
    await prisma.trigger.update({
      where: { id: triggerId },
      data: {
        lastTriggeredAt: new Date(),
        triggerCount: { increment: 1 },
      },
    });

    // Record execution
    await prisma.triggerExecution.create({
      data: {
        triggerId,
        status: executionStatus,
        inputData: event.data,
        outputData: actionResults,
        error: allSuccess ? null : actionResults.find((r) => r.error)?.error,
        durationMs: Date.now() - startTime,
      },
    });

    return {
      success: allSuccess,
      actionResults,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Record failed execution
    await prisma.triggerExecution.create({
      data: {
        triggerId,
        status: "failed",
        inputData: event.data,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      },
    });

    return {
      success: false,
      actionResults: [],
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Public API
// ============================================================================

export const zoneTriggerService = {
  /**
   * Process an event and execute matching triggers
   */
  async processEvent(event: TriggerEvent): Promise<ExecutionResult[]> {
    // Find all enabled triggers that match the event type
    const triggers = await prisma.trigger.findMany({
      where: {
        userId: event.userId,
        triggerType: event.type,
        enabled: true,
        // Optional scoping
        ...(event.repositoryId && {
          OR: [{ repositoryId: event.repositoryId }, { repositoryId: null }],
        }),
        ...(event.projectId && {
          OR: [{ projectId: event.projectId }, { projectId: null }],
        }),
      },
    });

    // Execute all matching triggers
    const results = await Promise.all(
      triggers.map((trigger) => executeTrigger(trigger.id, event))
    );

    return results;
  },

  /**
   * Test a trigger without persisting execution
   */
  async testTrigger(
    triggerId: string,
    testData: Record<string, any>
  ): Promise<{
    conditionsMet: boolean;
    conditionResults: any;
    wouldExecuteActions: ActionConfig[];
  }> {
    const trigger = await prisma.trigger.findUnique({
      where: { id: triggerId },
    });

    if (!trigger) {
      throw new Error("Trigger not found");
    }

    const conditions = trigger.conditions as ConditionTree;
    const conditionsMet = evaluateConditions(conditions, testData);

    // Recursively evaluate conditions for debugging
    const evaluateWithDetails = (
      tree: ConditionTree,
      data: Record<string, any>
    ): any => {
      if (tree.type === "condition") {
        const value = getNestedValue(data, tree.field);
        const result = evaluateSingleCondition(tree, data);
        return {
          ...tree,
          actualValue: value,
          result,
        };
      }

      const group = tree as ConditionGroup;
      return {
        type: "group",
        operator: group.operator,
        result: evaluateConditions(tree, data),
        conditions: group.conditions.map((c) =>
          evaluateWithDetails(c, data)
        ),
      };
    };

    return {
      conditionsMet,
      conditionResults: evaluateWithDetails(conditions, testData),
      wouldExecuteActions: conditionsMet
        ? (trigger.actions as ActionConfig[])
        : [],
    };
  },

  /**
   * Emit a task status change event
   */
  async emitTaskStatusChange(
    taskId: string,
    oldStatus: string,
    newStatus: string,
    userId: string,
    repositoryId?: string,
    projectId?: string
  ): Promise<void> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { repository: true },
    });

    if (!task) return;

    await this.processEvent({
      type: "task_status_change",
      data: {
        taskId,
        taskTitle: task.title,
        oldStatus,
        newStatus,
        taskType: task.type,
        priority: task.priority,
        repositoryName: task.repository?.fullName,
      },
      userId,
      repositoryId: repositoryId || task.repositoryId,
      projectId: projectId || task.projectId || undefined,
      timestamp: new Date(),
    });
  },

  /**
   * Emit a scan complete event
   */
  async emitScanComplete(
    scanId: string,
    userId: string,
    repositoryId: string,
    projectId?: string
  ): Promise<void> {
    const scan = await prisma.scanResult.findUnique({
      where: { id: scanId },
      include: { repository: true },
    });

    if (!scan) return;

    await this.processEvent({
      type: "scan_complete",
      data: {
        scanId,
        status: scan.status,
        tasksCreated: scan.tasksCreated,
        branch: scan.branch,
        repositoryName: scan.repository?.fullName,
        summary: scan.summary,
      },
      userId,
      repositoryId,
      projectId,
      timestamp: new Date(),
    });
  },

  /**
   * Emit a file change event
   */
  async emitFileChange(
    filePath: string,
    changeType: "created" | "modified" | "deleted",
    userId: string,
    repositoryId: string,
    projectId?: string
  ): Promise<void> {
    await this.processEvent({
      type: "file_change",
      data: {
        filePath,
        changeType,
        fileName: filePath.split("/").pop(),
        extension: filePath.split(".").pop(),
      },
      userId,
      repositoryId,
      projectId,
      timestamp: new Date(),
    });
  },

  // Helper: Validate trigger conditions structure
  validateConditions(conditions: ConditionTree): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const validate = (tree: ConditionTree, path: string = "root"): void => {
      if (!tree.type) {
        errors.push(`${path}: Missing 'type' field`);
        return;
      }

      if (tree.type === "condition") {
        const cond = tree as Condition;
        if (!cond.field) {
          errors.push(`${path}: Missing 'field' in condition`);
        }
        if (!cond.operator) {
          errors.push(`${path}: Missing 'operator' in condition`);
        }
        const validOperators: ConditionOperator[] = [
          "equals", "not_equals", "contains", "not_contains",
          "greater_than", "less_than", "in", "not_in",
          "regex", "exists", "not_exists"
        ];
        if (cond.operator && !validOperators.includes(cond.operator)) {
          errors.push(`${path}: Invalid operator '${cond.operator}'`);
        }
      } else if (tree.type === "group") {
        const group = tree as ConditionGroup;
        if (!group.operator || !["AND", "OR"].includes(group.operator)) {
          errors.push(`${path}: Invalid group operator '${group.operator}'`);
        }
        if (!Array.isArray(group.conditions)) {
          errors.push(`${path}: 'conditions' must be an array`);
        } else {
          group.conditions.forEach((c, i) => {
            validate(c, `${path}.conditions[${i}]`);
          });
        }
      } else {
        errors.push(`${path}: Invalid type '${tree.type}'`);
      }
    };

    validate(conditions);

    return { valid: errors.length === 0, errors };
  },

  // Helper: Validate actions structure
  validateActions(actions: ActionConfig[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const validTypes: ActionType[] = ["notify", "auto_assign", "run_task", "webhook", "email"];

    actions.forEach((action, i) => {
      if (!action.type) {
        errors.push(`actions[${i}]: Missing 'type' field`);
      } else if (!validTypes.includes(action.type)) {
        errors.push(`actions[${i}]: Invalid action type '${action.type}'`);
      }

      if (!action.config || typeof action.config !== "object") {
        errors.push(`actions[${i}]: Missing or invalid 'config' object`);
      }

      // Validate specific action configs
      if (action.type === "webhook" && !action.config?.url) {
        errors.push(`actions[${i}]: Webhook action requires 'url' in config`);
      }
      if (action.type === "email" && !action.config?.to) {
        errors.push(`actions[${i}]: Email action requires 'to' in config`);
      }
    });

    return { valid: errors.length === 0, errors };
  },
};

export default zoneTriggerService;
