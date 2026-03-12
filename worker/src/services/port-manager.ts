import { prisma } from "../db.js";

// Port range for task execution environments
const PORT_RANGE_START = 3100;
const PORT_RANGE_END = 4000;

// In-memory tracking for faster lookups
const allocatedPorts = new Set<number>();

export interface PortAllocation {
  port: number;
  taskId: string;
  allocatedAt: Date;
}

/**
 * Allocate a unique port for a task execution
 */
export async function allocatePort(taskId: string): Promise<number> {
  // First, clean up any stale port allocations (older than 2 hours)
  await cleanupStalePorts();

  // Find an available port
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!allocatedPorts.has(port)) {
      // Try to allocate this port in the database
      try {
        // Use a transaction to ensure atomicity
        const result = await prisma.$transaction(async (tx) => {
          // Check if port is already allocated
          const existing = await tx.task.findFirst({
            where: {
              allocatedPort: port,
              status: { in: ['in_progress', 'planning'] },
            },
          });

          if (!existing) {
            // Allocate the port to this task
            await tx.task.update({
              where: { id: taskId },
              data: { allocatedPort: port },
            });
            return port;
          }
          return null;
        });

        if (result) {
          allocatedPorts.add(port);
          console.log(`Allocated port ${port} to task ${taskId}`);
          return port;
        }
      } catch (err) {
        // Port was taken by another process, continue searching
        continue;
      }
    }
  }

  throw new Error('No available ports in range');
}

/**
 * Release a port when task execution completes
 */
export async function releasePort(taskId: string): Promise<void> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { allocatedPort: true },
    });

    if (task?.allocatedPort) {
      allocatedPorts.delete(task.allocatedPort);

      await prisma.task.update({
        where: { id: taskId },
        data: { allocatedPort: null },
      });

      console.log(`Released port ${task.allocatedPort} from task ${taskId}`);
    }
  } catch (err) {
    console.error(`Error releasing port for task ${taskId}:`, err);
  }
}

/**
 * Clean up ports from tasks that are no longer running
 */
async function cleanupStalePorts(): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  // Find tasks with allocated ports that haven't been updated in 2 hours
  const staleTasks = await prisma.task.findMany({
    where: {
      allocatedPort: { not: null },
      updatedAt: { lt: twoHoursAgo },
    },
    select: { id: true, allocatedPort: true },
  });

  for (const task of staleTasks) {
    if (task.allocatedPort) {
      allocatedPorts.delete(task.allocatedPort);
      await prisma.task.update({
        where: { id: task.id },
        data: { allocatedPort: null },
      });
      console.log(`Cleaned up stale port ${task.allocatedPort} from task ${task.id}`);
    }
  }
}

/**
 * Get all currently allocated ports
 */
export async function getAllocatedPorts(): Promise<PortAllocation[]> {
  const tasks = await prisma.task.findMany({
    where: {
      allocatedPort: { not: null },
    },
    select: {
      id: true,
      allocatedPort: true,
      updatedAt: true,
    },
  });

  return tasks.map((task) => ({
    port: task.allocatedPort!,
    taskId: task.id,
    allocatedAt: task.updatedAt,
  }));
}

/**
 * Check if a specific port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  if (port < PORT_RANGE_START || port > PORT_RANGE_END) {
    return false;
  }

  if (allocatedPorts.has(port)) {
    return false;
  }

  const task = await prisma.task.findFirst({
    where: {
      allocatedPort: port,
      status: { in: ['in_progress', 'planning'] },
    },
  });

  return !task;
}
