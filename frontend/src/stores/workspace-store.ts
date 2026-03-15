import { create } from "zustand";
import type { PermissionPolicy } from "@/components/workspace/chat/types";

type DiffViewMode = "unified" | "split";
export type RightMainPanelMode = "terminal" | "logs" | "changes" | "preview" | null;

interface WorkspaceUIState {
  leftPanelWidth: number;
  rightTopHeight: number;
  showBrowser: boolean;
  showChangesPanel: boolean;
  showChatPanel: boolean;
  showRightSidebar: boolean;
  showLogsPanel: boolean;
  showPreviewPanel: boolean;
  diffViewMode: DiffViewMode;
  diffsExpanded: boolean;
  activeRightTab: "terminal" | "files" | "browser";
  rightMainPanelMode: RightMainPanelMode;
  permissionPolicy: PermissionPolicy;
  setLeftPanelWidth: (width: number) => void;
  setRightTopHeight: (height: number) => void;
  toggleBrowser: () => void;
  toggleChangesPanel: () => void;
  toggleChatPanel: () => void;
  toggleRightSidebar: () => void;
  toggleLogsPanel: () => void;
  togglePreviewPanel: () => void;
  toggleDiffViewMode: () => void;
  toggleDiffsExpanded: () => void;
  setActiveRightTab: (tab: "terminal" | "files" | "browser") => void;
  setRightMainPanelMode: (mode: RightMainPanelMode) => void;
  setPermissionPolicy: (policy: PermissionPolicy) => void;
}

export const useWorkspaceStore = create<WorkspaceUIState>((set) => ({
  leftPanelWidth: 40,
  rightTopHeight: 50,
  showBrowser: false,
  showChangesPanel: false,
  showChatPanel: true,
  showRightSidebar: true,
  showLogsPanel: false,
  showPreviewPanel: false,
  diffViewMode: "unified",
  diffsExpanded: false,
  activeRightTab: "terminal",
  rightMainPanelMode: null,
  permissionPolicy: "auto",
  setLeftPanelWidth: (width) => set({ leftPanelWidth: Math.max(20, Math.min(70, width)) }),
  setRightTopHeight: (height) => set({ rightTopHeight: Math.max(20, Math.min(80, height)) }),
  toggleBrowser: () => set((s) => ({ showBrowser: !s.showBrowser })),
  toggleChangesPanel: () => set((s) => ({ showChangesPanel: !s.showChangesPanel })),
  toggleChatPanel: () => set((s) => ({ showChatPanel: !s.showChatPanel })),
  toggleRightSidebar: () => set((s) => ({ showRightSidebar: !s.showRightSidebar })),
  toggleLogsPanel: () => set((s) => ({
    showLogsPanel: !s.showLogsPanel,
    activeRightTab: !s.showLogsPanel ? "terminal" : s.activeRightTab,
  })),
  togglePreviewPanel: () => set((s) => ({
    showPreviewPanel: !s.showPreviewPanel,
    activeRightTab: !s.showPreviewPanel ? "browser" : s.activeRightTab,
  })),
  toggleDiffViewMode: () => set((s) => ({
    diffViewMode: s.diffViewMode === "unified" ? "split" : "unified",
  })),
  toggleDiffsExpanded: () => set((s) => ({ diffsExpanded: !s.diffsExpanded })),
  setActiveRightTab: (tab) => set({ activeRightTab: tab }),
  setRightMainPanelMode: (mode) => set({ rightMainPanelMode: mode }),
  setPermissionPolicy: (policy) => set({ permissionPolicy: policy }),
}));
