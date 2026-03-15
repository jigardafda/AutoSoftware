import { useMemo } from "react";
import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import { DiffFile } from "@git-diff-view/core";
import "@git-diff-view/react/styles/diff-view.css";
import { cn } from "@/lib/utils";

interface DiffViewerProps {
  diff: string;
  fileName?: string;
  mode?: "unified" | "split";
  className?: string;
}

/**
 * Extract the diff section for a single file from a multi-file unified diff.
 * Each file section starts with "diff --git a/... b/..." and runs until the next
 * "diff --git" line or end of string.
 */
function extractFileDiff(fullDiff: string, targetFile: string): string {
  const sections = fullDiff.split(/(?=^diff --git )/m);
  for (const section of sections) {
    // Match against both a/ and b/ paths, and also plain path
    if (
      section.includes(`a/${targetFile}`) ||
      section.includes(`b/${targetFile}`) ||
      section.includes(`--- a/${targetFile}`) ||
      section.includes(`+++ b/${targetFile}`)
    ) {
      return section;
    }
  }
  // Fallback: if no file matched (e.g. single-file diff without header), return the full diff
  return fullDiff;
}

export function DiffViewer({
  diff,
  fileName,
  mode = "unified",
  className,
}: DiffViewerProps) {
  const diffFile = useMemo(() => {
    if (!diff) return null;

    // If a specific file is requested, extract just that file's diff
    const fileDiff = fileName ? extractFileDiff(diff, fileName) : diff;
    if (!fileDiff.trim()) return null;

    try {
      const instance = DiffFile.createInstance({
        oldFile: { fileName: fileName || "file", content: "" },
        newFile: { fileName: fileName || "file", content: "" },
        hunks: [fileDiff],
      });

      instance.initRaw();
      instance.buildSplitDiffLines();
      instance.buildUnifiedDiffLines();

      return instance;
    } catch (err) {
      console.error("Failed to parse diff:", err);
      return null;
    }
  }, [diff, fileName]);

  if (!diffFile) {
    return (
      <div className={cn("flex items-center justify-center h-full p-8", className)}>
        <p className="text-sm text-muted-foreground">Unable to render diff</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "diff-viewer-wrapper [&_.diff-view-wrapper]:!bg-transparent",
        "[&_.diff-line-content]:!font-mono [&_.diff-line-content]:!text-[13px]",
        "[&_.diff-line-num]:!text-xs [&_.diff-line-num]:!text-muted-foreground/60",
        "[&_.diff-add-line]:!bg-green-500/10 [&_.diff-add-line-content]:!bg-green-500/10",
        "[&_.diff-del-line]:!bg-red-500/10 [&_.diff-del-line-content]:!bg-red-500/10",
        "[&_.diff-add-widget-line-num]:!bg-green-500/5",
        "[&_.diff-del-widget-line-num]:!bg-red-500/5",
        "[&_.diff-hunk-line]:!bg-blue-500/5",
        "[&_.diff-hunk-content]:!text-blue-400 [&_.diff-hunk-content]:!text-xs",
        className
      )}
    >
      <DiffView
        diffFile={diffFile}
        diffViewMode={mode === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
        diffViewHighlight={true}
        diffViewWrap={true}
      />
    </div>
  );
}
