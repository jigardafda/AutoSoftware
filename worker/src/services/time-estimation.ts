import { TaskType } from '@autosoftware/shared';

// Base rate: 0.5 minutes per effective line (realistic estimate)
// Industry studies show 10-50 LOC/hour for complex work, we use a moderate estimate
const BASE_MINUTES_PER_LOC = 0.5;

// Task type multipliers - some tasks take more time per LOC
const TASK_TYPE_MULTIPLIERS: Record<string, number> = {
  bugfix: 1.5,      // Bug fixes require investigation
  security: 2.0,    // Security fixes need careful review
  refactor: 0.6,    // Refactoring is more mechanical
  improvement: 1.0, // Standard baseline
  feature: 1.3,     // New features need design thinking
};

// File complexity multipliers - more files = more context switching
const FILES_COMPLEXITY_MULTIPLIERS = [
  { maxFiles: 2, multiplier: 1.0 },
  { maxFiles: 5, multiplier: 1.1 },
  { maxFiles: 10, multiplier: 1.2 },
  { maxFiles: 20, multiplier: 1.4 },
  { maxFiles: Infinity, multiplier: 1.6 },
];

export interface TimeEstimationInput {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  taskType: string;
}

export interface TimeEstimationResult {
  estimatedMinutesSaved: number;
  locFactor: number;
  complexityFactor: number;
  contextFactor: number;
  methodologyVersion: number;
}

export function calculateTimeSaved(input: TimeEstimationInput): TimeEstimationResult {
  const totalLinesChanged = input.linesAdded + input.linesDeleted;

  // Get task type multiplier
  const taskTypeMultiplier = TASK_TYPE_MULTIPLIERS[input.taskType] || 1.0;

  // Get files complexity multiplier
  const filesComplexity = FILES_COMPLEXITY_MULTIPLIERS.find(
    fc => input.filesChanged <= fc.maxFiles
  );
  const filesMultiplier = filesComplexity?.multiplier || 1.6;

  // Apply diminishing returns for large changes using logarithmic scaling
  // - Small changes (< 100 LOC): near-linear scaling
  // - Medium changes (100-1000 LOC): moderate diminishing returns
  // - Large changes (1000+ LOC): significant diminishing returns (bulk/auto-generated)
  let effectiveLines: number;
  if (totalLinesChanged <= 100) {
    effectiveLines = totalLinesChanged;
  } else if (totalLinesChanged <= 1000) {
    // First 100 lines count fully, rest at 50%
    effectiveLines = 100 + (totalLinesChanged - 100) * 0.5;
  } else {
    // First 100 full, next 900 at 50%, rest at 10%
    effectiveLines = 100 + 450 + (totalLinesChanged - 1000) * 0.1;
  }

  // Calculate LOC factor for record keeping
  const locFactor = effectiveLines / Math.max(totalLinesChanged, 1);

  // Calculate estimated minutes using effective lines
  const estimatedMinutes = Math.round(
    BASE_MINUTES_PER_LOC * effectiveLines * taskTypeMultiplier * filesMultiplier
  );

  return {
    estimatedMinutesSaved: estimatedMinutes,
    locFactor,
    complexityFactor: taskTypeMultiplier,
    contextFactor: filesMultiplier,
    methodologyVersion: 2, // Updated methodology
  };
}

export function formatTimeSaved(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  }
  return `${hours} hr${hours > 1 ? 's' : ''} ${remainingMinutes} min`;
}
