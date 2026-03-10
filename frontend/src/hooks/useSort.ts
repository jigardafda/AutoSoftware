import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection };
export type ComparatorType =
  | "string"
  | "number"
  | "date"
  | "priority"
  | "taskStatus"
  | "repoStatus"
  | "scanStatus";
export type SortConfig = Record<string, ComparatorType>;

const PRIORITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const TASK_STATUS_ORDER: Record<string, number> = {
  planning: 0,
  awaiting_input: 1,
  planned: 2,
  pending: 3,
  in_progress: 4,
  completed: 5,
  failed: 6,
  cancelled: 7,
};

const REPO_STATUS_ORDER: Record<string, number> = {
  scanning: 0,
  idle: 1,
  error: 2,
};

const SCAN_STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  completed: 1,
  failed: 2,
};

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((cur, key) => cur?.[key], obj);
}

function compare(a: any, b: any, type: ComparatorType): number {
  switch (type) {
    case "string": {
      const aStr = (a ?? "").toString().toLowerCase();
      const bStr = (b ?? "").toString().toLowerCase();
      return aStr.localeCompare(bStr);
    }
    case "number": {
      const aNum = a ?? 0;
      const bNum = b ?? 0;
      return aNum - bNum;
    }
    case "date": {
      const aTime = a ? new Date(a).getTime() : 0;
      const bTime = b ? new Date(b).getTime() : 0;
      return aTime - bTime;
    }
    case "priority":
      return (PRIORITY_ORDER[a] ?? -1) - (PRIORITY_ORDER[b] ?? -1);
    case "taskStatus":
      return (TASK_STATUS_ORDER[a] ?? -1) - (TASK_STATUS_ORDER[b] ?? -1);
    case "repoStatus":
      return (REPO_STATUS_ORDER[a] ?? -1) - (REPO_STATUS_ORDER[b] ?? -1);
    case "scanStatus":
      return (SCAN_STATUS_ORDER[a] ?? -1) - (SCAN_STATUS_ORDER[b] ?? -1);
    default:
      return 0;
  }
}

export function useSort<T>(
  items: T[],
  config: SortConfig,
  defaultSort: SortState
) {
  const [sort, setSort] = useState<SortState>(defaultSort);

  const onSort = (key: string) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const sorted = useMemo(() => {
    const type = config[sort.key];
    if (!type) return items;
    return [...items].sort((a, b) => {
      const aVal = getNestedValue(a, sort.key);
      const bVal = getNestedValue(b, sort.key);
      const result = compare(aVal, bVal, type);
      return sort.direction === "asc" ? result : -result;
    });
  }, [items, sort, config]);

  return { sort, onSort, sorted };
}
