/**
 * GitHub Label Mapping Configuration
 *
 * Defines how GitHub issue/PR labels map to task properties:
 * - Priority: critical, high, medium, low
 * - Type: bugfix, feature, improvement, refactor, security
 *
 * Users can override these mappings in their settings.
 */

import type { TaskPriority, TaskType } from "@autosoftware/shared";

// ============================================================================
// Types
// ============================================================================

export interface LabelMapping {
  // Exact label matches (case-insensitive)
  exactMatches: Record<string, TaskPriority | TaskType>;
  // Pattern matches (regex)
  patterns: Array<{
    pattern: RegExp;
    value: TaskPriority | TaskType;
    description: string;
  }>;
}

export interface LabelMappingConfig {
  priority: LabelMapping;
  type: LabelMapping;
}

// ============================================================================
// Default Priority Mappings
// ============================================================================

export const DEFAULT_PRIORITY_MAPPING: LabelMapping = {
  exactMatches: {
    // Direct priority labels
    "priority: critical": "critical",
    "priority: high": "high",
    "priority: medium": "medium",
    "priority: low": "low",
    "priority-critical": "critical",
    "priority-high": "high",
    "priority-medium": "medium",
    "priority-low": "low",

    // P0-P3 labels (common in enterprise)
    "p0": "critical",
    "p1": "high",
    "p2": "medium",
    "p3": "low",

    // Severity labels
    "critical": "critical",
    "blocker": "critical",
    "urgent": "critical",
    "high-priority": "high",
    "important": "high",
    "low-priority": "low",
    "nice-to-have": "low",
    "minor": "low",

    // Impact labels
    "breaking": "critical",
    "regression": "critical",
    "production-down": "critical",
  },

  patterns: [
    {
      pattern: /priority[:\-_\s]*(critical|p0|urgent)/i,
      value: "critical",
      description: "Priority critical/urgent patterns",
    },
    {
      pattern: /priority[:\-_\s]*(high|p1|important)/i,
      value: "high",
      description: "Priority high/important patterns",
    },
    {
      pattern: /priority[:\-_\s]*(medium|p2|normal)/i,
      value: "medium",
      description: "Priority medium/normal patterns",
    },
    {
      pattern: /priority[:\-_\s]*(low|p3|minor)/i,
      value: "low",
      description: "Priority low/minor patterns",
    },
    {
      pattern: /^p[:\-_\s]*0$/i,
      value: "critical",
      description: "P0 standalone",
    },
    {
      pattern: /^p[:\-_\s]*1$/i,
      value: "high",
      description: "P1 standalone",
    },
    {
      pattern: /^p[:\-_\s]*2$/i,
      value: "medium",
      description: "P2 standalone",
    },
    {
      pattern: /^p[:\-_\s]*3$/i,
      value: "low",
      description: "P3 standalone",
    },
  ],
};

// ============================================================================
// Default Type Mappings
// ============================================================================

export const DEFAULT_TYPE_MAPPING: LabelMapping = {
  exactMatches: {
    // Bug labels
    "bug": "bugfix",
    "fix": "bugfix",
    "bugfix": "bugfix",
    "defect": "bugfix",
    "issue": "bugfix",
    "error": "bugfix",

    // Feature labels
    "feature": "feature",
    "enhancement": "feature",
    "new-feature": "feature",
    "feature-request": "feature",
    "new": "feature",
    "addition": "feature",

    // Improvement labels
    "improvement": "improvement",
    "update": "improvement",
    "upgrade": "improvement",
    "optimize": "improvement",
    "optimization": "improvement",
    "performance": "improvement",

    // Refactor labels
    "refactor": "refactor",
    "refactoring": "refactor",
    "tech-debt": "refactor",
    "technical-debt": "refactor",
    "cleanup": "refactor",
    "code-quality": "refactor",

    // Security labels
    "security": "security",
    "vulnerability": "security",
    "cve": "security",
    "security-fix": "security",
    "security-patch": "security",
    "dependabot": "security",
  },

  patterns: [
    {
      pattern: /bug|defect|issue|error|crash/i,
      value: "bugfix",
      description: "Bug-related patterns",
    },
    {
      pattern: /feature|enhancement|new[\-_\s]*feature/i,
      value: "feature",
      description: "Feature-related patterns",
    },
    {
      pattern: /security|vuln|cve|dependabot|snyk/i,
      value: "security",
      description: "Security-related patterns",
    },
    {
      pattern: /refactor|tech[\-_\s]*debt|cleanup|rewrite/i,
      value: "refactor",
      description: "Refactor-related patterns",
    },
    {
      pattern: /improve|optimize|performance|update|upgrade/i,
      value: "improvement",
      description: "Improvement-related patterns",
    },
  ],
};

// ============================================================================
// Combined Default Config
// ============================================================================

export const DEFAULT_LABEL_CONFIG: LabelMappingConfig = {
  priority: DEFAULT_PRIORITY_MAPPING,
  type: DEFAULT_TYPE_MAPPING,
};

// ============================================================================
// Mapping Functions
// ============================================================================

/**
 * Map a list of labels to a priority using the provided config
 */
export function mapLabelsToPriority(
  labels: string[],
  config: LabelMapping = DEFAULT_PRIORITY_MAPPING
): TaskPriority {
  // Check exact matches first (highest confidence)
  for (const label of labels) {
    const normalized = label.toLowerCase().trim();
    const match = config.exactMatches[normalized];
    if (match && isPriority(match)) {
      return match;
    }
  }

  // Check pattern matches
  for (const label of labels) {
    for (const { pattern, value } of config.patterns) {
      if (pattern.test(label) && isPriority(value)) {
        return value;
      }
    }
  }

  // Default priority
  return "medium";
}

/**
 * Map a list of labels to a task type using the provided config
 */
export function mapLabelsToType(
  labels: string[],
  config: LabelMapping = DEFAULT_TYPE_MAPPING
): TaskType {
  // Check exact matches first
  for (const label of labels) {
    const normalized = label.toLowerCase().trim();
    const match = config.exactMatches[normalized];
    if (match && isType(match)) {
      return match;
    }
  }

  // Check pattern matches
  for (const label of labels) {
    for (const { pattern, value } of config.patterns) {
      if (pattern.test(label) && isType(value)) {
        return value;
      }
    }
  }

  // Default type
  return "improvement";
}

/**
 * Parse and merge custom label mappings from user settings
 */
export function mergeCustomMappings(
  baseConfig: LabelMappingConfig,
  customMappings: Partial<{
    priorityLabels: Record<string, TaskPriority>;
    typeLabels: Record<string, TaskType>;
  }>
): LabelMappingConfig {
  const merged: LabelMappingConfig = {
    priority: {
      exactMatches: { ...baseConfig.priority.exactMatches },
      patterns: [...baseConfig.priority.patterns],
    },
    type: {
      exactMatches: { ...baseConfig.type.exactMatches },
      patterns: [...baseConfig.type.patterns],
    },
  };

  if (customMappings.priorityLabels) {
    for (const [label, priority] of Object.entries(customMappings.priorityLabels)) {
      merged.priority.exactMatches[label.toLowerCase()] = priority;
    }
  }

  if (customMappings.typeLabels) {
    for (const [label, type] of Object.entries(customMappings.typeLabels)) {
      merged.type.exactMatches[label.toLowerCase()] = type;
    }
  }

  return merged;
}

// ============================================================================
// Type Guards
// ============================================================================

function isPriority(value: string): value is TaskPriority {
  return ["low", "medium", "high", "critical"].includes(value);
}

function isType(value: string): value is TaskType {
  return ["improvement", "bugfix", "feature", "refactor", "security"].includes(value);
}

// ============================================================================
// Export all utilities
// ============================================================================

export const githubLabelUtils = {
  mapLabelsToPriority,
  mapLabelsToType,
  mergeCustomMappings,
  DEFAULT_LABEL_CONFIG,
  DEFAULT_PRIORITY_MAPPING,
  DEFAULT_TYPE_MAPPING,
};

export default githubLabelUtils;
