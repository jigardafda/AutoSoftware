import { simpleGit, SimpleGit } from "simple-git";
import { randomBytes } from "crypto";

export interface ChangeBatch {
  id: string;
  name: string;
  rollbackRef: string; // Git ref (stash or branch) to rollback to
  changes: FileChange[];
  validated: boolean;
  appliedAt?: Date;
  rolledBackAt?: Date;
}

export interface FileChange {
  path: string;
  operation: "create" | "modify" | "delete";
  previousContent?: string; // For modify/delete operations
}

export interface ChangeBatcherOptions {
  workDir: string;
  useBranches?: boolean; // Use branches instead of stashes for rollback
  validateAfterApply?: boolean;
  onLog?: (level: string, message: string, metadata?: Record<string, unknown>) => Promise<void>;
}

export interface BatchValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RollbackResult {
  success: boolean;
  restoredFiles: string[];
  error?: string;
}

/**
 * Manages atomic change sets with rollback capability
 */
export class ChangeBatcher {
  private git: SimpleGit;
  private workDir: string;
  private useBranches: boolean;
  private validateAfterApply: boolean;
  private batches: Map<string, ChangeBatch> = new Map();
  private originalBranch: string = "";
  private onLog?: (level: string, message: string, metadata?: Record<string, unknown>) => Promise<void>;

  constructor(options: ChangeBatcherOptions) {
    this.workDir = options.workDir;
    this.git = simpleGit(options.workDir);
    this.useBranches = options.useBranches ?? false;
    this.validateAfterApply = options.validateAfterApply ?? true;
    this.onLog = options.onLog;
  }

  /**
   * Initialize the batcher - call before starting changes
   */
  async initialize(): Promise<void> {
    try {
      // Get current branch
      const status = await this.git.status();
      this.originalBranch = status.current || "main";

      // Ensure clean working directory or stash existing changes
      if (status.files.length > 0) {
        await this.onLog?.("info", "Stashing existing uncommitted changes before batching");
        await this.git.stash(["push", "-m", "pre-batch-changes"]);
      }
    } catch (err) {
      await this.onLog?.("error", `Failed to initialize batcher: ${err}`);
      throw err;
    }
  }

  /**
   * Create a new rollback point before making changes
   */
  async createRollbackPoint(batchName: string): Promise<ChangeBatch> {
    const batchId = randomBytes(8).toString("hex");
    let rollbackRef: string;

    try {
      if (this.useBranches) {
        // Create a branch for rollback
        const branchName = `rollback/${batchId}`;
        await this.git.checkoutLocalBranch(branchName);
        await this.git.checkout(this.originalBranch);
        rollbackRef = branchName;
      } else {
        // Use stash for rollback point
        // First, commit any staged changes temporarily
        const status = await this.git.status();
        if (status.staged.length > 0 || status.files.length > 0) {
          // Stash all changes with untracked files
          await this.git.stash(["push", "-u", "-m", `rollback-point-${batchId}`]);
          rollbackRef = `stash@{0}`;
          // Pop the stash to restore working state
          await this.git.stash(["pop"]);
        } else {
          // No changes to stash - create empty marker
          rollbackRef = await this.git.revparse(["HEAD"]);
        }
      }

      const batch: ChangeBatch = {
        id: batchId,
        name: batchName,
        rollbackRef,
        changes: [],
        validated: false,
      };

      this.batches.set(batchId, batch);
      await this.onLog?.("info", `Created rollback point: ${batchName} (${batchId})`);

      return batch;
    } catch (err) {
      await this.onLog?.("error", `Failed to create rollback point: ${err}`);
      throw err;
    }
  }

  /**
   * Record a file change in the current batch
   */
  recordChange(batchId: string, change: FileChange): void {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    batch.changes.push(change);
  }

  /**
   * Create a checkpoint commit for the current batch
   */
  async commitBatch(batchId: string, message: string): Promise<string> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    try {
      // Stage all changes
      await this.git.add(".");

      // Create commit
      const result = await this.git.commit(message);
      batch.appliedAt = new Date();

      await this.onLog?.("info", `Committed batch ${batch.name}: ${result.commit}`);

      return result.commit;
    } catch (err) {
      await this.onLog?.("error", `Failed to commit batch: ${err}`);
      throw err;
    }
  }

  /**
   * Validate a batch by running build/tests
   */
  async validateBatch(
    batchId: string,
    validator: () => Promise<BatchValidationResult>
  ): Promise<BatchValidationResult> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    try {
      await this.onLog?.("info", `Validating batch: ${batch.name}`);
      const result = await validator();
      batch.validated = result.valid;

      if (result.valid) {
        await this.onLog?.("success", `Batch ${batch.name} validated successfully`);
      } else {
        await this.onLog?.(
          "error",
          `Batch ${batch.name} validation failed: ${result.errors.join(", ")}`
        );
      }

      return result;
    } catch (err) {
      await this.onLog?.("error", `Validation threw error: ${err}`);
      return {
        valid: false,
        errors: [err instanceof Error ? err.message : "Unknown validation error"],
        warnings: [],
      };
    }
  }

  /**
   * Rollback a specific batch
   */
  async rollbackBatch(batchId: string): Promise<RollbackResult> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      return {
        success: false,
        restoredFiles: [],
        error: `Batch ${batchId} not found`,
      };
    }

    try {
      await this.onLog?.("info", `Rolling back batch: ${batch.name}`);

      if (this.useBranches) {
        // Checkout the rollback branch
        await this.git.checkout(batch.rollbackRef);
        // Delete the feature branch changes
        await this.git.checkout(this.originalBranch);
        await this.git.reset(["--hard", batch.rollbackRef]);
      } else {
        // Reset to the rollback commit
        if (batch.rollbackRef.startsWith("stash@")) {
          // If we have a stash reference, we need to hard reset
          // and apply the stash
          await this.git.reset(["--hard", "HEAD~1"]);
        } else {
          // Reset to the specific commit
          await this.git.reset(["--hard", batch.rollbackRef]);
        }
      }

      batch.rolledBackAt = new Date();
      await this.onLog?.("success", `Rolled back batch: ${batch.name}`);

      return {
        success: true,
        restoredFiles: batch.changes.map((c) => c.path),
      };
    } catch (err) {
      await this.onLog?.("error", `Rollback failed: ${err}`);
      return {
        success: false,
        restoredFiles: [],
        error: err instanceof Error ? err.message : "Unknown rollback error",
      };
    }
  }

  /**
   * Rollback all batches in reverse order
   */
  async rollbackAll(): Promise<RollbackResult> {
    const batchIds = Array.from(this.batches.keys()).reverse();
    const restoredFiles: string[] = [];

    for (const batchId of batchIds) {
      const batch = this.batches.get(batchId);
      if (batch && !batch.rolledBackAt) {
        const result = await this.rollbackBatch(batchId);
        if (!result.success) {
          return result;
        }
        restoredFiles.push(...result.restoredFiles);
      }
    }

    return {
      success: true,
      restoredFiles,
    };
  }

  /**
   * Get all batches
   */
  getBatches(): ChangeBatch[] {
    return Array.from(this.batches.values());
  }

  /**
   * Get a specific batch
   */
  getBatch(batchId: string): ChangeBatch | undefined {
    return this.batches.get(batchId);
  }

  /**
   * Clean up rollback points after successful completion
   */
  async cleanup(): Promise<void> {
    try {
      if (this.useBranches) {
        // Delete rollback branches
        for (const batch of this.batches.values()) {
          if (batch.rollbackRef.startsWith("rollback/")) {
            try {
              await this.git.deleteLocalBranch(batch.rollbackRef, true);
            } catch {
              // Branch might not exist
            }
          }
        }
      }

      this.batches.clear();
      await this.onLog?.("info", "Cleaned up rollback points");
    } catch (err) {
      await this.onLog?.("error", `Cleanup failed: ${err}`);
    }
  }
}

/**
 * Create a simple atomic change wrapper for single operations
 */
export async function withAtomicChanges<T>(
  workDir: string,
  operation: () => Promise<T>,
  onLog?: (level: string, message: string) => Promise<void>
): Promise<{ success: boolean; result?: T; error?: string }> {
  const git = simpleGit(workDir);

  // Get current HEAD
  const originalHead = await git.revparse(["HEAD"]);

  try {
    // Run the operation
    const result = await operation();

    return {
      success: true,
      result,
    };
  } catch (err) {
    // Rollback to original state
    await onLog?.("error", `Operation failed, rolling back to ${originalHead.slice(0, 8)}`);

    try {
      await git.reset(["--hard", originalHead]);
      await git.clean(["f", "-d"]); // Remove untracked files
    } catch (resetErr) {
      await onLog?.("error", `Rollback failed: ${resetErr}`);
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Safe stash operations for preserving work
 */
export async function safeStash(
  workDir: string,
  message: string
): Promise<{ stashCreated: boolean; stashRef?: string }> {
  const git = simpleGit(workDir);
  const status = await git.status();

  if (status.files.length === 0) {
    return { stashCreated: false };
  }

  await git.stash(["push", "-u", "-m", message]);

  return {
    stashCreated: true,
    stashRef: "stash@{0}",
  };
}

/**
 * Pop the most recent stash
 */
export async function safeStashPop(workDir: string): Promise<boolean> {
  const git = simpleGit(workDir);

  try {
    await git.stash(["pop"]);
    return true;
  } catch {
    return false;
  }
}
