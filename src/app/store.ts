import { create } from "zustand";
import { FIRST_LIGHT } from "../domain/defaults";
import type { DraftGalaxy, Mode, PerformanceLevel, RandomCategory } from "../domain/types";
import type { GalaxyDescriptor } from "../simulation/protocol";

export interface LowFrequencyStatus {
  playing: boolean;
  playbackSpeed: number;
  gravity: number;
  galaxyCount: number;
  starCount: number;
  fps: number;
  stepIndex: number;
  health: "ready" | "unavailable";
}
export interface SelectedCoreProjection {
  x: number;
  y: number;
  vx: number;
  vy: number;
  updatedAt: number;
}
export type Panel = "creation" | "inspector" | null;
interface AppState {
  mode: Mode;
  draft: DraftGalaxy;
  randomCategory: RandomCategory;
  randomSeed: number;
  descriptors: GalaxyDescriptor[];
  selectedGalaxyId: string | null;
  performanceLevel: PerformanceLevel;
  trails: boolean;
  automaticFraming: boolean;
  status: LowFrequencyStatus;
  selectedCore: SelectedCoreProjection | null;
  panel: Panel;
  pendingMutation: string | null;
  historyMarkerId: number | null;
  historyMarkerIds: number[];
  historyBusy: boolean;
  recordingActive: boolean;
  libraryCounts: { presets: number; scenes: number; captures: number; recordings: number };
  lastStatusCommitAt: number;
  setStatus: (status: LowFrequencyStatus, now?: number) => boolean;
  setDescriptors: (descriptors: GalaxyDescriptor[]) => void;
  setPanel: (panel: Panel) => void;
  setSelection: (id: string | null) => void;
  setHistory: (markerIds: number[], selected: number | null, busy?: boolean) => void;
}
const initialStatus: LowFrequencyStatus = {
  playing: true,
  playbackSpeed: 1,
  gravity: 1,
  galaxyCount: 1,
  starCount: 30000,
  fps: 0,
  stepIndex: 0,
  health: "ready",
};
export const useAppStore = create<AppState>((set, get) => ({
  mode: "single",
  draft: { generation: { ...FIRST_LIGHT.generation }, name: FIRST_LIGHT.name },
  randomCategory: "single",
  randomSeed: 1,
  descriptors: [],
  selectedGalaxyId: null,
  performanceLevel: "balanced",
  trails: false,
  automaticFraming: true,
  status: initialStatus,
  selectedCore: null,
  panel: null,
  pendingMutation: null,
  historyMarkerId: null,
  historyMarkerIds: [],
  historyBusy: false,
  recordingActive: false,
  libraryCounts: { presets: 0, scenes: 0, captures: 0, recordings: 0 },
  lastStatusCommitAt: Number.NEGATIVE_INFINITY,
  setStatus: (status, now = performance.now()) => {
    if (now - get().lastStatusCommitAt < 100) return false;
    set({ status, lastStatusCommitAt: now });
    return true;
  },
  setDescriptors: (descriptors) => {
    set({
      descriptors: descriptors.map((descriptor) => ({
        ...descriptor,
        generation: { ...descriptor.generation },
      })),
    });
  },
  setPanel: (panel) => {
    set({ panel });
  },
  setSelection: (selectedGalaxyId) => {
    set({ selectedGalaxyId });
  },
  setHistory: (historyMarkerIds, historyMarkerId, historyBusy = false) => {
    set({ historyMarkerIds: [...historyMarkerIds], historyMarkerId, historyBusy });
  },
}));
