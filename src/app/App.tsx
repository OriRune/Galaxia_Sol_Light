import { useEffect, useRef, useState } from "react";
import { PixiViewport } from "../rendering/PixiViewport";
import { worldToScreen, type CameraState, type CssPoint } from "../rendering/camera";
import type { DragPreview } from "../rendering/interaction";
import { SimulationClient } from "../simulation/client";
import { useAppStore } from "./store";
import { arbitrateSelection, DialogFocusManager, keyboardShortcut } from "./selectionService";
import type { CoreFrame, TopologyEvent, WorkerRequest } from "../simulation/protocol";
import { HistoryScrubber } from "./HistoryScrubber";
import { initialGalaxiesForRuntime } from "./initialGalaxy";
import {
  MAX_ARM_COUNT,
  MAX_BULK_SPEED,
  MAX_GRAVITY,
  MAX_MASS,
  MAX_SIZE,
  MAX_SPIN,
  MAX_STAR_COUNT,
  MAX_POSITION,
  MIN_ARM_COUNT,
  MIN_GRAVITY,
  MIN_MASS,
  MIN_SIZE,
  MIN_SPIN,
  MIN_STAR_COUNT,
  MIN_POSITION,
  PERFORMANCE_STAR_BUDGETS,
} from "../domain/ranges";
import { draftGalaxySchema, presetFileV1Schema, sceneFileV1Schema } from "../domain/schemas";
import { generateRandomScenario } from "../generation/randomScenarios";
import { BUILT_IN_PRESETS } from "../generation/presets";
import { reduceMode } from "./modeReducer";
import { resetDraft } from "./galaxyWorkflows";
import {
  openDatabases,
  requestDurableStorage,
  type LibraryDatabase,
  type RecordingFrameRow,
  type RecordingFrameDatabase,
  type RecordingRow,
} from "../persistence/databases";
import { LibraryRepository, type LibrarySummary } from "../persistence/libraryRepository";
import {
  createPresetFile,
  createSceneFile,
  exportPortableFile,
  importPortableFile,
} from "../persistence/portable";
import { RecordingRepository } from "../persistence/recordingRepository";
import { boundedExportName, defaultLibraryName } from "../domain/names";
import { validateSceneImport } from "../persistence/sceneLoad";
import type { DraftGalaxy } from "../domain/types";
import type { UndoUiSnapshot } from "./undoStore";
import { ScreenshotService } from "../capture/screenshotService";
import { recordingCapacity, RecordingSlotScheduler } from "../capture/recordingScheduler";
import {
  RecordingPersistence,
  type RecordingTerminalReason,
} from "../capture/recordingPersistence";
import {
  buildRecordingPart,
  planRecordingParts,
  withObjectUrl,
  type ExportPlan,
} from "../capture/recordingExport";

type Health = "starting" | "ready" | "unavailable";
interface AppServices {
  createClient: (
    callbacks: ConstructorParameters<typeof SimulationClient>[1],
  ) => Pick<SimulationClient, "initialize" | "ping" | "dispose"> &
    Partial<
      Pick<
        SimulationClient,
        | "tick"
        | "terminate"
        | "command"
        | "mutation"
        | "modelRevision"
        | "restoreLatestCheckpoint"
        | "regenerateFromSetup"
        | "requestSceneSetup"
        | "requestStateDigest"
        | "requestUndoSnapshot"
        | "releaseUndoSnapshot"
        | "setVisibility"
        | "commitUiOnly"
      >
    >;
  createViewport: () => Pick<PixiViewport, "mount" | "destroy"> &
    Partial<
      Pick<
        PixiViewport,
        | "applyTopology"
        | "applyFrame"
        | "renderArtworkTo"
        | "setAutomaticFraming"
        | "resetCamera"
        | "zoomAtCssPoint"
        | "getCameraState"
        | "pickAtCssPoint"
        | "panByCssPixels"
        | "beginCenterDrag"
        | "updateCenterDrag"
        | "beginVelocityDrag"
        | "updateVelocityDrag"
        | "finishDrag"
        | "cancelDrag"
        | "setTrails"
      >
    >;
}
interface AppProps {
  services?: AppServices;
}
const INITIAL_GALAXIES = initialGalaxiesForRuntime(
  import.meta.env.VITE_TEST_HOOKS === "true",
  new URLSearchParams(location.search).get("fixture"),
);
const defaultServices: AppServices = {
  createClient: (callbacks) => new SimulationClient(undefined, callbacks),
  createViewport: () => new PixiViewport(),
};

function downloadBlob(blob: Blob, name: string) {
  withObjectUrl(blob, (url) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
  });
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: "image/webp" | "image/png",
  quality?: number,
  timeoutMs = 5_000,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(blob);
      },
      timeout = setTimeout(() => {
        finish(null);
      }, timeoutMs);
    canvas.toBlob(finish, type, quality);
  });
}

const resetNumericEdits = () => {
  window.dispatchEvent(new Event("galaxia-reset-numeric-edits"));
};
const anyTrue = (...conditions: boolean[]) => conditions.includes(true);
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
const valueOr = <T,>(value: T | null | undefined, fallback: T): T => value ?? fallback;
const choose = <T,>(condition: boolean, whenTrue: T, whenFalse: T): T =>
  condition ? whenTrue : whenFalse;

function NumericField({
  label,
  value,
  integer,
  min,
  max,
  disabled = false,
  onCommit,
}: {
  label: string;
  value: number | null;
  integer: boolean;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const committed = value === null ? "" : String(value),
    [text, setText] = useState(committed),
    [focused, setFocused] = useState(false),
    [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const reset = () => {
      setFocused(false);
      setInvalid(false);
      setText(committed);
    };
    window.addEventListener("galaxia-reset-numeric-edits", reset);
    return () => {
      window.removeEventListener("galaxia-reset-numeric-edits", reset);
    };
  }, [committed]);
  const commit = () => {
    const trimmed = text.trim(),
      grammar = integer
        ? /^[+-]?\d+$/.test(trimmed)
        : /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed),
      parsed = grammar ? Number(trimmed) : Number.NaN,
      valid =
        grammar &&
        Number.isFinite(parsed) &&
        anyTrue(!integer, Number.isInteger(parsed)) &&
        parsed >= min &&
        parsed <= max;
    setInvalid(!valid);
    if (valid) {
      const canonical = Object.is(parsed, -0) ? 0 : parsed;
      if (canonical !== value) onCommit(canonical);
      setText(String(canonical));
    }
  };
  return (
    <label>
      {label}
      <input
        value={focused || invalid ? text : committed}
        inputMode={integer ? "numeric" : "decimal"}
        step={integer ? 1 : 0.1}
        disabled={disabled}
        aria-invalid={invalid}
        onFocus={() => {
          setText(committed);
          setFocused(true);
        }}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setInvalid(false);
        }}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setText(committed);
            setInvalid(false);
          }
        }}
      />
    </label>
  );
}

function NameField({
  value,
  disabled,
  onCommit,
}: {
  value: string | null;
  disabled: boolean;
  onCommit: (value: string | null) => void;
}) {
  const committed = valueOr(value, ""),
    [text, setText] = useState(committed),
    [focused, setFocused] = useState(false),
    [invalid, setInvalid] = useState(false);
  const commit = () => {
    const trimmed = text.trim(),
      valid = anyTrue(trimmed.length === 0, Array.from(trimmed).length <= 80);
    setInvalid(!valid);
    if (valid) {
      const next = trimmed.length === 0 ? null : trimmed;
      if (next !== value) onCommit(next);
      setText(valueOr(next, ""));
    }
  };
  useEffect(() => {
    const reset = () => {
      setFocused(false);
      setInvalid(false);
      setText(committed);
    };
    window.addEventListener("galaxia-reset-numeric-edits", reset);
    return () => {
      window.removeEventListener("galaxia-reset-numeric-edits", reset);
    };
  }, [committed]);
  return (
    <label>
      Name
      <input
        value={focused || invalid ? text : committed}
        disabled={disabled}
        aria-invalid={invalid}
        onFocus={() => {
          setText(committed);
          setFocused(true);
        }}
        onChange={(event) => {
          setText(event.currentTarget.value);
          setInvalid(false);
        }}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setText(committed);
            setInvalid(false);
          }
        }}
      />
    </label>
  );
}

interface RecordingSummary {
  id: string;
  name: string;
  createdAt: string;
  state: RecordingRow["state"];
  capturedCount: number;
  missedCount: number;
  terminalReason: RecordingRow["terminalReason"];
}
interface RecordingDirectoryHandle {
  getFileHandle: (
    name: string,
    options: { create: true },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (blob: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

export function App({ services = defaultServices }: AppProps) {
  const viewportHost = useRef<HTMLDivElement>(null),
    clientRef = useRef<ReturnType<AppServices["createClient"]> | null>(null),
    latestCores = useRef<CoreFrame[]>([]),
    lastCoreDisplayCommit = useRef(Number.NEGATIVE_INFINITY),
    pointerGestureRef = useRef<{
      pointerId: number;
      kind: "pan" | "center" | "velocity";
      last: CssPoint;
    } | null>(null),
    viewportRef = useRef<ReturnType<AppServices["createViewport"]> | null>(null),
    helpButtonRef = useRef<HTMLButtonElement>(null),
    helpDialogRef = useRef<HTMLDialogElement>(null),
    focusManagerRef = useRef(new DialogFocusManager()),
    mutationPendingRef = useRef(false),
    undoStackRef = useRef<
      {
        snapshotId: string;
        ui: UndoUiSnapshot & { gravity: number; playbackSpeed: number };
      }[]
    >([]),
    libraryDatabaseRef = useRef<LibraryDatabase | null>(null),
    recordingFrameDatabaseRef = useRef<RecordingFrameDatabase | null>(null),
    libraryRepositoryRef = useRef<LibraryRepository | null>(null),
    recordingRepositoryRef = useRef<RecordingRepository | null>(null),
    recordingRef = useRef<{
      id: string;
      interval: ReturnType<typeof setInterval>;
      persistence: RecordingPersistence;
      inFlight: number;
      captured: number;
      missed: number;
      scheduler: RecordingSlotScheduler;
      targets: { canvas: HTMLCanvasElement; busy: boolean }[];
      renderer: NonNullable<ReturnType<AppServices["createViewport"]>["renderArtworkTo"]>;
      rendererOwner: ReturnType<AppServices["createViewport"]>;
      finalizing: boolean;
      consecutiveEncoderFailures: number;
      effectiveSlots: number;
    } | null>(null),
    [workerHealth, setWorkerHealth] = useState<Health>("starting"),
    [rendererHealth, setRendererHealth] = useState<Health>("starting"),
    [message, setMessage] = useState<string | null>(null),
    [helpOpen, setHelpOpen] = useState(false),
    [playbackCommandPending, setPlaybackCommandPending] = useState(false),
    [modeTransitionPending, setModeTransitionPending] = useState(false),
    [recordingPreflighting, setRecordingPreflighting] = useState(false),
    [durabilityStatus, setDurabilityStatus] = useState<string | null>(null),
    [mutationPending, setMutationPending] = useState(false),
    [displayCores, setDisplayCores] = useState<CoreFrame[]>([]),
    [cameraDisplay, setCameraDisplay] = useState<CameraState>({
      centerX: 0,
      centerY: 0,
      zoom: 5,
      cssWidth: 0,
      cssHeight: 0,
      devicePixelRatio: 1,
    }),
    [dragPreview, setDragPreview] = useState<{
      kind: "center" | "velocity";
      preview: DragPreview;
    } | null>(null),
    [undoDepth, setUndoDepth] = useState(0);
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(120),
    [recordingSummary, setRecordingSummary] = useState<{
      captured: number;
      missed: number;
      effectiveSlots: number;
      nominalSlots: number;
    } | null>(null);
  const [presets, setPresets] = useState<LibrarySummary[]>([]),
    [scenes, setScenes] = useState<LibrarySummary[]>([]),
    [captures, setCaptures] = useState<LibrarySummary[]>([]),
    [selectedCapture, setSelectedCapture] = useState<{
      id: string;
      name: string;
      blob: Blob;
      previewUrl: string;
    } | null>(null),
    [recordings, setRecordings] = useState<RecordingSummary[]>([]),
    [selectedRecording, setSelectedRecording] = useState<{
      row: RecordingRow;
      frame: RecordingFrameRow | null;
      previewUrl: string | null;
      plan: ExportPlan;
      exportedParts: Set<number>;
    } | null>(null),
    [libraryReady, setLibraryReady] = useState(false),
    [rightTab, setRightTab] = useState<
      "selection" | "presets" | "scenes" | "captures" | "recordings"
    >("selection");
  const [recovery, setRecovery] = useState<{
    stepIndex: number;
    ageMs: number;
    cores: CoreFrame[];
  } | null>(null);
  const status = useAppStore((state) => state.status),
    mode = useAppStore((state) => state.mode),
    panel = useAppStore((state) => state.panel),
    historyMarkerIds = useAppStore((state) => state.historyMarkerIds),
    historyMarkerId = useAppStore((state) => state.historyMarkerId),
    historyBusy = useAppStore((state) => state.historyBusy),
    recordingActive = useAppStore((state) => state.recordingActive),
    performanceLevel = useAppStore((state) => state.performanceLevel),
    trails = useAppStore((state) => state.trails),
    randomCategory = useAppStore((state) => state.randomCategory),
    randomSeed = useAppStore((state) => state.randomSeed),
    draft = useAppStore((state) => state.draft),
    descriptors = useAppStore((state) => state.descriptors),
    selectedGalaxyId = useAppStore((state) => state.selectedGalaxyId),
    automaticFraming = useAppStore((state) => state.automaticFraming),
    setPanel = useAppStore((state) => state.setPanel);
  useEffect(() => {
    const viewport = services.createViewport();
    viewportRef.current = viewport;
    let active = true,
      viewportReady = false,
      animationFrame = 0,
      stagedTopology: TopologyEvent | null = null;
    const client = services.createClient({
      commitCommandEvents: (_id, topology, delta) => {
        if (topology) {
          const soleDescriptor =
            topology.descriptors.length === 1 ? topology.descriptors[0] : undefined;
          useAppStore.getState().setDescriptors(topology.descriptors);
          useAppStore.setState((state) => ({
            ...(state.mode === "single" && soleDescriptor
              ? {
                  draft: {
                    generation: structuredClone(soleDescriptor.generation),
                    name: soleDescriptor.name,
                  },
                }
              : {}),
            status: {
              ...state.status,
              galaxyCount: topology.descriptors.length,
              starCount: topology.descriptors.reduce(
                (sum, descriptor) => sum + descriptor.generation.starCount,
                0,
              ),
            },
          }));
          if (viewportReady) viewport.applyTopology?.(topology);
          else stagedTopology = topology;
        }
        if (delta) {
          const state = useAppStore.getState(),
            live = new Set(
              valueOr(topology?.descriptors, state.descriptors).map((descriptor) => descriptor.id),
            );
          state.setSelection(arbitrateSelection(state.selectedGalaxyId, delta, live));
        }
      },
      commitAutomaticEvents: (topology, delta) => {
        const state = useAppStore.getState(),
          live = new Set(topology.descriptors.map((descriptor) => descriptor.id));
        const soleDescriptor =
          topology.descriptors.length === 1 ? topology.descriptors[0] : undefined;
        state.setDescriptors(topology.descriptors);
        useAppStore.setState({
          ...(state.mode === "single" && soleDescriptor
            ? {
                draft: {
                  generation: structuredClone(soleDescriptor.generation),
                  name: soleDescriptor.name,
                },
              }
            : {}),
          status: {
            ...state.status,
            galaxyCount: topology.descriptors.length,
            starCount: topology.descriptors.reduce(
              (sum, descriptor) => sum + descriptor.generation.starCount,
              0,
            ),
          },
        });
        if (viewportReady) viewport.applyTopology?.(topology);
        else stagedTopology = topology;
        state.setSelection(arbitrateSelection(state.selectedGalaxyId, delta, live));
      },
      applyFrame: (frame, positions) => {
        latestCores.current = frame.cores.map((core) => ({ ...core }));
        if (viewportReady) viewport.applyFrame?.(frame, new Float32Array(positions));
        const now = performance.now();
        if (now - lastCoreDisplayCommit.current >= 100) {
          lastCoreDisplayCommit.current = now;
          setDisplayCores(frame.cores.map((core) => ({ ...core })));
          const camera = viewport.getCameraState?.();
          if (camera) setCameraDisplay({ ...camera });
        }
      },
      historyStatus: (history) => {
        useAppStore
          .getState()
          .setHistory(history.markerIds, history.selectedMarkerId, history.reconstructing);
      },
      workerUnavailable: (_reason, checkpoint) => {
        setWorkerHealth("unavailable");
        setRecovery(
          checkpoint
            ? { ...checkpoint, cores: latestCores.current.map((core) => ({ ...core })) }
            : null,
        );
      },
    });
    const onClientVisibility = () => {
      client.setVisibility?.(!document.hidden);
    };
    document.addEventListener("visibilitychange", onClientVisibility);
    onClientVisibility();
    clientRef.current = client;
    const mounting = viewportHost.current
      ? viewport
          .mount(viewportHost.current)
          .then(() => {
            if (active) {
              viewportReady = true;
              if (stagedTopology) viewport.applyTopology?.(stagedTopology);
              setRendererHealth("ready");
            }
          })
          .catch((error: unknown) => {
            if (active) {
              setRendererHealth("unavailable");
              setMessage(errorMessage(error, "WebGL unavailable."));
            }
          })
      : Promise.resolve();
    void mounting
      .then(() =>
        client.initialize({ galaxies: INITIAL_GALAXIES, gravity: 1, playbackSpeed: 1 }, true),
      )
      .then(() => client.ping(1))
      .then(() => {
        if (active) {
          setWorkerHealth("ready");
          const tick = (timestamp: number) => {
            if (!active) return;
            if (useAppStore.getState().status.playing) client.tick?.(timestamp);
            animationFrame = requestAnimationFrame(tick);
          };
          animationFrame = requestAnimationFrame(tick);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setWorkerHealth("unavailable");
          setMessage(errorMessage(error, "Simulation Worker unavailable."));
        }
      });
    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      viewport.destroy();
      document.removeEventListener("visibilitychange", onClientVisibility);
      viewportRef.current = null;
      if (client.terminate) client.terminate();
      else void client.dispose();
      clientRef.current = null;
    };
  }, [services]);
  useEffect(() => {
    let active = true;
    void openDatabases()
      .then(async ({ library, frames }) => {
        if (!active) {
          library.close();
          frames.close();
          return;
        }
        libraryDatabaseRef.current = library;
        recordingFrameDatabaseRef.current = frames;
        const repository = new LibraryRepository(library);
        const recordingRepository = new RecordingRepository(library, frames);
        libraryRepositoryRef.current = repository;
        recordingRepositoryRef.current = recordingRepository;
        const [nextPresets, nextScenes, nextCaptures, nextRecordings] = await Promise.all([
          repository.list("preset"),
          repository.list("scene"),
          repository.list("capture"),
          recordingRepository.list(),
        ]);
        setPresets(nextPresets);
        setScenes(nextScenes);
        setCaptures(nextCaptures);
        setRecordings(nextRecordings);
        setLibraryReady(true);
      })
      .catch((error: unknown) => {
        if (active) setMessage(errorMessage(error, "Library storage unavailable."));
      });
    return () => {
      active = false;
      libraryDatabaseRef.current?.close();
      recordingFrameDatabaseRef.current?.close();
      libraryDatabaseRef.current = null;
      recordingFrameDatabaseRef.current = null;
      libraryRepositoryRef.current = null;
      recordingRepositoryRef.current = null;
    };
  }, []);
  useEffect(
    () => () => {
      if (selectedRecording?.previewUrl) URL.revokeObjectURL(selectedRecording.previewUrl);
    },
    [selectedRecording?.previewUrl],
  );
  useEffect(
    () => () => {
      if (selectedCapture?.previewUrl) URL.revokeObjectURL(selectedCapture.previewUrl);
    },
    [selectedCapture?.previewUrl],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && pointerGestureRef.current) {
        viewportRef.current?.cancelDrag?.();
        pointerGestureRef.current = null;
        setDragPreview(null);
        event.preventDefault();
        return;
      }
      const state = useAppStore.getState(),
        action = keyboardShortcut(event, {
          dialogOpen: helpOpen,
          dragActive: pointerGestureRef.current !== null,
          selected: state.selectedGalaxyId !== null,
        });
      if (action === null) return;
      event.preventDefault();
      if (
        anyTrue(action === "toggle-playback", action === "single-step") &&
        anyTrue(workerHealth !== "ready", rendererHealth !== "ready")
      )
        return;
      if (action === "toggle-playback") {
        const playing = !state.status.playing;
        useAppStore.setState({ status: { ...state.status, playing } });
        void clientRef.current?.command?.(playing ? "PLAY" : "PAUSE", {});
      }
      if (action === "single-step") void clientRef.current?.command?.("STEP", {});
      if (action === "toggle-framing") {
        const enabled = !state.automaticFraming;
        useAppStore.setState({ automaticFraming: enabled });
        viewportRef.current?.setAutomaticFraming?.(enabled);
      }
      if (action === "close-dialog") setHelpOpen(false);
      if (action === "deselect") state.setSelection(null);
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, [helpOpen, rendererHealth, workerHealth]);
  useEffect(() => {
    if (helpOpen && helpDialogRef.current && helpButtonRef.current)
      focusManagerRef.current.open(helpDialogRef.current, helpButtonRef.current);
    else focusManagerRef.current.close();
  }, [helpOpen]);
  useEffect(() => {
    viewportRef.current?.setTrails?.(trails);
  }, [trails]);
  const summary = `${String(status.galaxyCount)} galaxies, ${String(status.starCount)} stars, ${status.playing ? "playing" : "paused"}, ${mode} mode.`;
  const draftControlsDisabled = anyTrue(
    historyMarkerId !== null,
    workerHealth !== "ready",
    mutationPending,
  );
  const projectedDraftStars =
    mode === "single" ? draft.generation.starCount : status.starCount + draft.generation.starCount;
  const recoveryDescriptors = descriptors,
    recoveryCores = valueOr(recovery?.cores, []),
    selectedDescriptor = descriptors.find((descriptor) => descriptor.id === selectedGalaxyId),
    selectedCore = displayCores.find((core) => core.id === selectedGalaxyId),
    regenerationCompatible =
      recoveryDescriptors.length === recoveryCores.length &&
      recoveryDescriptors.every((descriptor, index) => descriptor.id === recoveryCores[index]?.id);
  const retainUndoSnapshot = (snapshotId: string, ui: ReturnType<typeof useAppStore.getState>) => {
    const client = clientRef.current;
    undoStackRef.current.push({
      snapshotId,
      ui: {
        mode: ui.mode,
        draft: structuredClone(ui.draft),
        randomCategory: ui.randomCategory,
        randomSeed: ui.randomSeed,
        selectedGalaxyId: ui.selectedGalaxyId,
        performanceLevel: ui.performanceLevel,
        trails: ui.trails,
        gravity: ui.status.gravity,
        playbackSpeed: ui.status.playbackSpeed,
      },
    });
    setUndoDepth(undoStackRef.current.length);
    const discarded = undoStackRef.current.length > 20 ? undoStackRef.current.shift() : null;
    if (discarded) void client?.releaseUndoSnapshot?.(discarded.snapshotId);
  };
  const runMutation = (type: WorkerRequest["type"], payload: unknown, commitUi?: () => void) => {
    const client = clientRef.current;
    if (!client?.mutation || mutationPendingRef.current)
      return Promise.reject(new Error("A simulation mutation is already in flight."));
    const mutation = client.mutation.bind(client);
    mutationPendingRef.current = true;
    setMutationPending(true);
    const ui = useAppStore.getState(),
      snapshotRequest = client.requestUndoSnapshot
        ? client.requestUndoSnapshot()
        : Promise.resolve(null);
    return snapshotRequest
      .then((snapshot) =>
        mutation(type, payload, valueOr(snapshot?.snapshotId, null)).then((acknowledgement) => ({
          acknowledgement,
          snapshot,
        })),
      )
      .then(({ acknowledgement, snapshot }) => {
        if (acknowledgement.result === "CHANGED") commitUi?.();
        if (snapshot && acknowledgement.result === "CHANGED")
          retainUndoSnapshot(snapshot.snapshotId, ui);
        if (acknowledgement.result === "CHANGED" && !useAppStore.getState().status.playing)
          client.tick?.(performance.now(), true);
        return acknowledgement;
      })
      .finally(() => {
        mutationPendingRef.current = false;
        setMutationPending(false);
      });
  };
  const runUiMutation = async (commit: () => void) => {
    const client = clientRef.current;
    if (!client?.requestUndoSnapshot || !client.commitUiOnly || mutationPendingRef.current)
      throw new Error("A simulation mutation is already in flight.");
    mutationPendingRef.current = true;
    setMutationPending(true);
    const ui = useAppStore.getState();
    try {
      const snapshot = await client.requestUndoSnapshot();
      await client.commitUiOnly(snapshot.snapshotId);
      commit();
      retainUndoSnapshot(snapshot.snapshotId, ui);
    } finally {
      mutationPendingRef.current = false;
      setMutationPending(false);
    }
  };
  const commitDraftGeneration = (generation: DraftGalaxy["generation"]) => {
    const next = { ...draft, generation: structuredClone(generation) },
      descriptor = useAppStore.getState().descriptors[0];
    if (mode !== "single" || !descriptor) {
      useAppStore.setState({ draft: next });
      return;
    }
    void runMutation(
      "PATCH_GALAXY",
      { galaxyId: descriptor.id, generation: next.generation, name: next.name },
      () => {
        useAppStore.setState({ draft: next });
      },
    ).catch((error: unknown) => {
      setMessage(errorMessage(error, "Galaxy could not be updated."));
    });
  };
  const commitDraftName = (name: string | null) => {
    const next = { ...draft, name },
      descriptor = useAppStore.getState().descriptors[0];
    if (mode !== "single" || !descriptor) {
      useAppStore.setState({ draft: next });
      return;
    }
    void runMutation(
      "PATCH_GALAXY",
      { galaxyId: descriptor.id, generation: next.generation, name },
      () => {
        useAppStore.setState({ draft: next });
      },
    ).catch((error: unknown) => {
      setMessage(errorMessage(error, "Galaxy could not be updated."));
    });
  };
  const applyPreset = async (payload: DraftGalaxy) => {
    const descriptor = useAppStore.getState().descriptors[0];
    if (mode === "single" && descriptor) {
      await runMutation("PATCH_GALAXY", {
        galaxyId: descriptor.id,
        generation: payload.generation,
        name: payload.name,
      });
      resetNumericEdits();
      useAppStore.setState({ draft: structuredClone(payload), automaticFraming: true });
      viewportRef.current?.setAutomaticFraming?.(true);
      return;
    }
    await runMutation("ADD_GALAXY", {
      galaxy: {
        id: crypto.randomUUID(),
        generation: payload.generation,
        name: payload.name,
        position: {
          x: valueOr(viewportRef.current?.getCameraState?.().centerX, 0),
          y: valueOr(viewportRef.current?.getCameraState?.().centerY, 0),
        },
        bulkVelocity: { x: 0, y: 0 },
      },
    });
    useAppStore.setState({ draft: structuredClone(payload), automaticFraming: true });
    viewportRef.current?.setAutomaticFraming?.(true);
  };
  const changeMode = async (target: typeof mode) => {
    if (target === mode) return;
    setModeTransitionPending(true);
    try {
      const client = clientRef.current,
        engineSetup =
          target === "single"
            ? await client?.requestSceneSetup?.()
            : {
                galaxies: [],
                gravity: status.gravity,
                playbackSpeed: status.playbackSpeed as 0.25 | 0.5 | 1 | 2 | 4,
              };
      if (!engineSetup) throw new Error("Simulation scene is unavailable.");
      const transition = reduceMode({
        mode,
        target,
        scene: { ...engineSetup, performanceLevel, trails },
        draft,
        selectedGalaxyId,
        playing: status.playing,
        createId: () => crypto.randomUUID(),
      });
      if (transition.scene.kind === "replace") {
        await runMutation("LOAD_SETUP", {
          setup: {
            galaxies: transition.scene.setup.galaxies,
            gravity: transition.scene.setup.gravity,
            playbackSpeed: transition.scene.setup.playbackSpeed,
          },
          postLoadPlaying: valueOr(transition.workerCommand?.postLoadPlaying, status.playing),
        });
      }
      useAppStore.setState({
        mode: transition.mode,
        draft: transition.draft,
        selectedGalaxyId: transition.selectedGalaxyId,
        automaticFraming: transition.camera === "enable" ? true : automaticFraming,
      });
      if (transition.camera === "enable") viewportRef.current?.setAutomaticFraming?.(true);
    } finally {
      setModeTransitionPending(false);
    }
  };
  const finishRecording = async (reason: RecordingTerminalReason) => {
    const recording = recordingRef.current;
    if (!recording || recording.finalizing) return;
    recording.finalizing = true;
    clearInterval(recording.interval);
    while (recording.inFlight > 0)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    try {
      const row = await recording.persistence.finalize(recording.id, reason);
      setRecordingSummary({
        captured: row.capturedCount,
        missed: row.missedCount,
        effectiveSlots: row.effectiveSlotLimit,
        nominalSlots: row.nominalSlots,
      });
      setMessage(
        `Recording saved: ${String(row.capturedCount)} captured, ${String(row.missedCount)} missed.`,
      );
      const repository = recordingRepositoryRef.current;
      if (repository) setRecordings(await repository.list());
    } finally {
      recordingRef.current = null;
      useAppStore.setState({ recordingActive: false });
    }
  };
  useEffect(() => {
    const onVisibility = () => {
      const recording = recordingRef.current;
      if (!recording) return;
      if (document.hidden) {
        recording.scheduler.hide(performance.now());
        return;
      }
      const pass = recording.scheduler.show(performance.now());
      if (!pass) return;
      recording.missed += Math.max(0, pass.nominalSlots - (recording.captured + recording.missed));
      setRecordingSummary({
        captured: recording.captured,
        missed: recording.missed,
        effectiveSlots: recording.effectiveSlots,
        nominalSlots: pass.nominalSlots,
      });
      void recording.persistence.attemptMetadata(recording.id, pass.lastAttemptedSlot, pass.missed);
      if (pass.nextSlot >= recording.effectiveSlots) void finishRecording("duration");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });
  const showRecording = async (id: string, frameOverride?: RecordingFrameRow | null) => {
    const repository = recordingRepositoryRef.current,
      frames = recordingFrameDatabaseRef.current;
    if (!repository || !frames) return;
    const detail = await repository.detail(id),
      frame = frameOverride === undefined ? detail.preview : frameOverride,
      metadata = await frames.frames.where("recordingId").equals(id).toArray(),
      plan = planRecordingParts(metadata),
      previewUrl = frame ? URL.createObjectURL(frame.blob) : null;
    setSelectedRecording((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return {
        row: detail.row,
        frame,
        previewUrl,
        plan,
        exportedParts: current?.row.id === id ? current.exportedParts : new Set<number>(),
      };
    });
  };
  const exportRecordingPart = async (partNumber: number) => {
    const selection = selectedRecording,
      frames = recordingFrameDatabaseRef.current;
    if (!selection || !frames) return;
    const blob = await buildRecordingPart(
      selection.row,
      selection.plan,
      partNumber,
      "0.1.0",
      async (slot) => {
        const frame = await frames.frames.get([selection.row.id, slot]);
        if (!frame) throw new Error("EXPORT_FAILED");
        return frame;
      },
    );
    const suffix = `-part-${String(partNumber).padStart(
      Math.max(3, String(selection.plan.parts.length).length),
      "0",
    )}.zip`;
    downloadBlob(blob, boundedExportName(selection.row.name, suffix));
    setSelectedRecording((current) =>
      current
        ? { ...current, exportedParts: new Set([...current.exportedParts, partNumber]) }
        : current,
    );
    setMessage(`Recording part ${String(partNumber)} downloaded.`);
  };
  const exportRecordingFolder = async () => {
    const selection = selectedRecording,
      frames = recordingFrameDatabaseRef.current,
      picker = (
        window as typeof window & {
          showDirectoryPicker?: () => Promise<RecordingDirectoryHandle>;
        }
      ).showDirectoryPicker;
    if (!selection || !frames || !picker) return;
    const directory = await picker();
    for (let index = 0; index < selection.plan.parts.length; index += 1) {
      const partNumber = index + 1,
        blob = await buildRecordingPart(
          selection.row,
          selection.plan,
          partNumber,
          "0.1.0",
          async (slot) => {
            const frame = await frames.frames.get([selection.row.id, slot]);
            if (!frame) throw new Error("EXPORT_FAILED");
            return frame;
          },
        ),
        suffix = `-part-${String(partNumber).padStart(
          Math.max(3, String(selection.plan.parts.length).length),
          "0",
        )}.zip`,
        handle = await directory.getFileHandle(boundedExportName(selection.row.name, suffix), {
          create: true,
        }),
        writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    }
    setSelectedRecording((current) =>
      current
        ? {
            ...current,
            exportedParts: new Set(current.plan.parts.map((_part, index) => index + 1)),
          }
        : current,
    );
    setMessage(`Exported ${String(selection.plan.parts.length)} recording ZIP parts.`);
  };
  const showCapture = async (id: string) => {
    const repository = libraryRepositoryRef.current;
    if (!repository) return;
    const blob = await repository.getCapture(id);
    if (!blob) throw new Error("LIBRARY_ITEM_NOT_FOUND");
    const previewUrl = URL.createObjectURL(blob.blob);
    setSelectedCapture((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return { id: blob.id, name: blob.name, blob: blob.blob, previewUrl };
    });
  };
  const saveCurrentPreset = async () => {
    const repository = libraryRepositoryRef.current;
    if (!repository) return;
    const selected = useAppStore
        .getState()
        .descriptors.find(
          (descriptor) => descriptor.id === useAppStore.getState().selectedGalaxyId,
        ),
      payload = selected
        ? { generation: { ...selected.generation }, name: selected.name }
        : useAppStore.getState().draft,
      now = new Date().toISOString(),
      id = crypto.randomUUID(),
      name = valueOr(payload.name, "Galaxy preset");
    await repository.savePreset({
      id,
      name,
      createdAt: now,
      updatedAt: now,
      builtin: false,
      portable: createPresetFile({ id, name, appVersion: "0.1.0", exportedAt: now }, payload),
    });
    setPresets(await repository.list("preset"));
    setMessage(`Saved preset ${name}.`);
  };
  const startRecording = async () => {
    const library = libraryDatabaseRef.current,
      frames = recordingFrameDatabaseRef.current,
      recordingRepository = recordingRepositoryRef.current,
      rendererOwner = viewportRef.current,
      renderer = rendererOwner?.renderArtworkTo,
      host = viewportHost.current;
    if (!library || !frames || !recordingRepository || !rendererOwner || !renderer || !host) return;
    setRecordingPreflighting(true);
    try {
      const persistenceStatus = await requestDurableStorage(),
        bounds = host.getBoundingClientRect(),
        width = Math.max(1, Math.round(bounds.width * devicePixelRatio)),
        height = Math.max(1, Math.round(bounds.height * devicePixelRatio)),
        targets = Array.from({ length: 2 }, () => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          return { canvas, busy: false };
        }),
        samples: number[] = [];
      let mimeType: "image/webp" | "image/png" = "image/webp";
      for (let index = 0; index < 5; index += 1) {
        const target = targets[index % 2];
        if (!target) throw new Error("CAPTURE_ENCODER_FAILED");
        renderer.call(rendererOwner, target.canvas);
        let sample = await encodeCanvas(target.canvas, mimeType, 0.9);
        if ((!sample || sample.size === 0) && index === 0) {
          mimeType = "image/png";
          sample = await encodeCanvas(target.canvas, mimeType);
        }
        if (!sample || sample.size === 0) throw new Error("CAPTURE_ENCODER_FAILED");
        samples.push(sample.size);
      }
      let estimate: { quota?: number; usage?: number } = {};
      try {
        estimate = await Promise.race([
          navigator.storage.estimate(),
          new Promise<Record<string, never>>((resolve) => {
            setTimeout(() => {
              resolve({});
            }, 2_000);
          }),
        ]);
      } catch {
        estimate = {};
      }
      const capacity = recordingCapacity(samples, estimate);
      if (!capacity.safeToStart) {
        setMessage("Recording needs capacity for at least 300 slots after the storage reserve.");
        return;
      }
      let effectiveSlots = Math.min(recordingDurationSeconds * 30, capacity.effectiveSlotLimit);
      if (import.meta.env.VITE_TEST_HOOKS === "true") {
        const override = Number(new URLSearchParams(location.search).get("recordingSlots"));
        if (Number.isInteger(override) && override >= 300 && override <= 3600)
          effectiveSlots = override;
      }
      const id = crypto.randomUUID(),
        now = new Date(),
        name = defaultLibraryName("Recording", now),
        startedAt = performance.now(),
        persistence = new RecordingPersistence(library, frames),
        scheduler = new RecordingSlotScheduler(startedAt, effectiveSlots);
      await recordingRepository.save({
        id,
        name,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        state: "recording",
        width,
        height,
        devicePixelRatio,
        mimeType,
        nominalSlots: 0,
        capturedCount: 0,
        missedCount: 0,
        lastAttemptedSlot: -1,
        startedAtWall: now.toISOString(),
        startedAtMonotonic: startedAt,
        durationMs: 0,
        effectiveSlotLimit: effectiveSlots,
        terminalReason: "user",
        missedRanges: [],
      });
      const interval = setInterval(() => {
        const current = recordingRef.current;
        if (!current || current.finalizing) return;
        const pass = current.scheduler.pass(performance.now(), current.inFlight);
        if (!pass) return;
        if (pass.missed) current.missed += pass.missed[1] - pass.missed[0] + 1;
        const candidate = pass.candidate,
          target = candidate === null ? undefined : current.targets.find((item) => !item.busy);
        if (candidate !== null && target) {
          current.inFlight += 1;
          target.busy = true;
          void current.persistence
            .attemptMetadata(current.id, candidate, pass.missed)
            .then(() => {
              current.renderer.call(current.rendererOwner, target.canvas);
              return encodeCanvas(
                target.canvas,
                mimeType,
                mimeType === "image/webp" ? 0.9 : undefined,
                2_000,
              );
            })
            .then((blob) => {
              if (!blob) throw new Error("CAPTURE_ENCODER_FAILED");
              return current.persistence.writeFrame(
                current.id,
                candidate,
                (candidate * 1000) / 30,
                blob,
              );
            })
            .then(() => {
              current.captured += 1;
              current.consecutiveEncoderFailures = 0;
            })
            .catch((error: unknown) => {
              current.missed += 1;
              void current.persistence.encoderMiss(current.id, candidate);
              if (error instanceof DOMException && error.name === "QuotaExceededError")
                void finishRecording("quota");
              else {
                current.consecutiveEncoderFailures += 1;
                if (current.consecutiveEncoderFailures >= 3) void finishRecording("encoder");
              }
            })
            .finally(() => {
              target.busy = false;
              current.inFlight -= 1;
              setRecordingSummary({
                captured: current.captured,
                missed: current.missed,
                effectiveSlots: current.effectiveSlots,
                nominalSlots: pass.nominalSlots,
              });
            });
        } else
          void current.persistence.attemptMetadata(current.id, pass.lastAttemptedSlot, pass.missed);
        if (pass.nextSlot >= current.effectiveSlots) void finishRecording("duration");
      }, 16);
      recordingRef.current = {
        id,
        interval,
        persistence,
        inFlight: 0,
        captured: 0,
        missed: 0,
        scheduler,
        targets,
        renderer,
        rendererOwner,
        finalizing: false,
        consecutiveEncoderFailures: 0,
        effectiveSlots,
      };
      setDurabilityStatus(
        `${persistenceStatus}; ${capacity.estimateAvailable ? "quota estimate available" : "quota estimate unavailable"}`,
      );
      setRecordingSummary({ captured: 0, missed: 0, effectiveSlots, nominalSlots: 0 });
      useAppStore.setState({ recordingActive: true });
    } catch (error) {
      setMessage(errorMessage(error, "Recording preflight failed."));
    } finally {
      setRecordingPreflighting(false);
    }
  };
  return (
    <main
      className={`galaxia-shell ${anyTrue(historyMarkerIds.length > 0, recordingActive) ? "bottom-strip-active" : ""}`}
      data-mutation-pending={String(mutationPending)}
      data-undo-depth={String(undoDepth)}
    >
      <header className="top-bar">
        <h1>Galaxia</h1>
        <nav aria-label="Modes">
          <div role="tablist" aria-label="Modes">
            {(["Single", "Collision", "Builder", "Random"] as const).map((label) => (
              <button
                key={label}
                role="tab"
                aria-selected={mode === label.toLowerCase()}
                disabled={anyTrue(
                  historyMarkerId !== null,
                  workerHealth !== "ready",
                  mutationPending,
                  modeTransitionPending,
                )}
                onClick={() => {
                  void changeMode(label.toLowerCase() as typeof mode).catch((error: unknown) => {
                    setMessage(errorMessage(error, "Mode change failed."));
                  });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
        <nav aria-label="Playback">
          <button
            disabled={anyTrue(
              workerHealth !== "ready",
              rendererHealth !== "ready",
              playbackCommandPending,
            )}
            onClick={() => {
              const next = !useAppStore.getState().status.playing;
              setPlaybackCommandPending(true);
              void clientRef.current
                ?.command?.(next ? "PLAY" : "PAUSE", {}, { timeoutMs: 30_000 })
                .then(() => {
                  useAppStore.setState((state) => ({
                    status: { ...state.status, playing: next },
                  }));
                })
                .catch((error: unknown) => {
                  setMessage(errorMessage(error, "Playback command failed."));
                })
                .finally(() => {
                  setPlaybackCommandPending(false);
                });
            }}
          >
            Play/Pause
          </button>
          <button
            disabled={anyTrue(
              workerHealth !== "ready",
              rendererHealth !== "ready",
              playbackCommandPending,
              mutationPending,
            )}
            onClick={() => {
              void clientRef.current?.command?.("STEP", {});
            }}
          >
            Step
          </button>
          <label>
            Speed
            <select
              value={String(status.playbackSpeed)}
              disabled={anyTrue(historyMarkerId !== null, workerHealth !== "ready")}
              onChange={(event) => {
                const playbackSpeed = Number(event.currentTarget.value) as 0.25 | 0.5 | 1 | 2 | 4;
                void runMutation("SET_PLAYBACK_SPEED", { playbackSpeed }, () => {
                  useAppStore.setState((state) => ({
                    status: { ...state.status, playbackSpeed },
                  }));
                });
              }}
            >
              <option value="0.25">.25</option>
              <option value="0.5">.5</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="4">4</option>
            </select>
          </label>
          <NumericField
            label="Gravity"
            value={status.gravity}
            integer={false}
            min={MIN_GRAVITY}
            max={MAX_GRAVITY}
            disabled={anyTrue(
              historyMarkerId !== null,
              workerHealth !== "ready",
              playbackCommandPending,
              mutationPending,
            )}
            onCommit={(gravity) => {
              void runMutation("SET_GRAVITY", { gravity }, () => {
                useAppStore.setState((state) => ({ status: { ...state.status, gravity } }));
              });
            }}
          />
          <label>
            Performance
            <select
              value={performanceLevel}
              disabled={anyTrue(
                historyMarkerId !== null,
                workerHealth !== "ready",
                mutationPending,
              )}
              onChange={(event) => {
                const next = event.currentTarget.value as "low" | "balanced" | "high";
                if (next === useAppStore.getState().performanceLevel) return;
                void runUiMutation(() => {
                  useAppStore.setState({ performanceLevel: next });
                });
              }}
            >
              <option>low</option>
              <option>balanced</option>
              <option>high</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={trails}
              disabled={historyMarkerId !== null}
              onChange={(event) => {
                const next = event.currentTarget.checked;
                if (next === useAppStore.getState().trails) return;
                void runUiMutation(() => {
                  useAppStore.setState({ trails: next });
                });
              }}
            />
            Trails
          </label>
          <label>
            <input
              type="checkbox"
              checked={automaticFraming}
              onChange={(event) => {
                const enabled = event.currentTarget.checked;
                useAppStore.setState({ automaticFraming: enabled });
                viewportRef.current?.setAutomaticFraming?.(enabled);
              }}
            />
            Auto-frame
          </label>
          <button
            onClick={() => {
              viewportRef.current?.resetCamera?.();
              const camera = viewportRef.current?.getCameraState?.();
              if (camera) setCameraDisplay({ ...camera });
            }}
          >
            Reset camera
          </button>
          <button
            type="button"
            disabled={anyTrue(
              undoDepth === 0,
              mutationPending,
              historyMarkerId !== null,
              workerHealth !== "ready",
            )}
            onClick={() => {
              const entry = undoStackRef.current.at(-1),
                client = clientRef.current;
              if (!entry || !client?.mutation) return;
              mutationPendingRef.current = true;
              setMutationPending(true);
              void client
                .command?.("PAUSE", {})
                .then(() =>
                  client.mutation?.("RESTORE_UNDO_SNAPSHOT", { snapshotId: entry.snapshotId }),
                )
                .then(() => {
                  undoStackRef.current.pop();
                  setUndoDepth(undoStackRef.current.length);
                  resetNumericEdits();
                  useAppStore.setState((state) => ({
                    mode: entry.ui.mode,
                    draft: structuredClone(entry.ui.draft),
                    randomCategory: entry.ui.randomCategory,
                    randomSeed: entry.ui.randomSeed,
                    selectedGalaxyId: entry.ui.selectedGalaxyId,
                    performanceLevel: entry.ui.performanceLevel,
                    trails: entry.ui.trails,
                    historyMarkerId: null,
                    historyMarkerIds: [],
                    historyBusy: false,
                    status: {
                      ...state.status,
                      playing: false,
                      gravity: entry.ui.gravity,
                      playbackSpeed: entry.ui.playbackSpeed,
                    },
                  }));
                  return client.releaseUndoSnapshot?.(entry.snapshotId);
                })
                .catch((error: unknown) => {
                  setMessage(errorMessage(error, "Undo failed."));
                })
                .finally(() => {
                  mutationPendingRef.current = false;
                  setMutationPending(false);
                });
            }}
          >
            Undo
          </button>
          <button
            disabled={anyTrue(workerHealth !== "ready", rendererHealth !== "ready", !libraryReady)}
            onClick={() => {
              const renderer = viewportRef.current,
                repository = libraryRepositoryRef.current,
                host = viewportHost.current;
              const renderArtworkTo = renderer?.renderArtworkTo;
              if (!renderArtworkTo || !repository || !host) return;
              const canvas = document.createElement("canvas"),
                bounds = host.getBoundingClientRect();
              canvas.width = Math.max(1, Math.round(bounds.width * devicePixelRatio));
              canvas.height = Math.max(1, Math.round(bounds.height * devicePixelRatio));
              const id = crypto.randomUUID(),
                service = new ScreenshotService(
                  {
                    renderArtworkTo: (target) => {
                      renderArtworkTo.call(renderer, target);
                    },
                  },
                  canvas,
                  repository,
                );
              void service
                .capture(id, defaultLibraryName("Capture", new Date()))
                .then(() => repository.list("capture"))
                .then((next) => {
                  setCaptures(next);
                  setMessage("Screenshot saved.");
                })
                .catch((error: unknown) => {
                  setMessage(errorMessage(error, "Screenshot failed."));
                });
            }}
          >
            Screenshot
          </button>
          <label>
            Recording seconds
            <input
              aria-label="Recording seconds"
              type="number"
              min={10}
              max={120}
              value={recordingDurationSeconds}
              disabled={recordingActive}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isInteger(value) && value >= 10 && value <= 120)
                  setRecordingDurationSeconds(value);
              }}
            />
          </label>
          <button
            disabled={anyTrue(
              workerHealth !== "ready",
              rendererHealth !== "ready",
              historyMarkerId !== null,
              recordingPreflighting,
            )}
            onClick={() => {
              if (recordingActive) {
                void finishRecording("user");
                return;
              }
              void startRecording();
            }}
          >
            {recordingActive
              ? "Stop recording"
              : recordingPreflighting
                ? "Preparing recording"
                : "Record"}
          </button>
          <button
            ref={helpButtonRef}
            onClick={() => {
              setHelpOpen((open) => !open);
            }}
          >
            Help
          </button>
          <span>{status.fps.toFixed(0)} FPS</span>
          {recordingSummary && (
            <span role="status">
              Recording: {String(recordingSummary.captured)} captured,{" "}
              {String(recordingSummary.missed)}
              {" missed, elapsed "}
              {(recordingSummary.nominalSlots / 30).toFixed(1)} seconds, limit{" "}
              {String(recordingSummary.effectiveSlots)} slots
            </span>
          )}
          {durabilityStatus && <span>Storage: {durabilityStatus}</span>}
          <span>
            {status.playing ? "Playing" : "Paused"} · Speed {String(status.playbackSpeed)}× ·
            Gravity {String(status.gravity)}× · {performanceLevel} · {String(status.galaxyCount)}
            {" galaxies · "}
            {String(status.starCount)} stars ·{" "}
            {selectedDescriptor
              ? `Selected ${valueOr(selectedDescriptor.name, selectedDescriptor.id)}`
              : "None selected"}
          </span>
        </nav>
        <div className="health" aria-label="System health">
          <span>Simulation: {workerHealth}</span>
          <span>Renderer: {rendererHealth}</span>
        </div>
      </header>
      {helpOpen && (
        <dialog
          ref={helpDialogRef}
          open
          aria-label="Interaction help"
          onKeyDown={(event) => {
            if (event.key !== "Tab" || !helpDialogRef.current) return;
            event.preventDefault();
            focusManagerRef.current.handleTab(helpDialogRef.current, event.shiftKey);
          }}
        >
          <h2>Galaxia help</h2>
          <p>Create galaxies, adjust gravity and playback, then pan, zoom, select, and rewind.</p>
          <button
            onClick={() => {
              setHelpOpen(false);
            }}
          >
            Close help
          </button>
        </dialog>
      )}
      <aside
        className={`creation-panel ${panel === "creation" ? "drawer-open" : ""} ${rightTab !== "selection" ? "library-open" : ""}`}
      >
        <h2>Create</h2>
        <form className="draft-controls">
          {mode === "random" && (
            <>
              <label>
                Random category
                <select
                  value={randomCategory}
                  onChange={(event) => {
                    useAppStore.setState({
                      randomCategory: event.currentTarget.value as typeof randomCategory,
                    });
                  }}
                >
                  <option value="single">Single</option>
                  <option value="collision">Collision</option>
                  <option value="cluster">Cluster</option>
                </select>
              </label>
              <NumericField
                label="Scenario seed"
                value={randomSeed}
                integer
                min={0}
                max={0xffff_ffff}
                onCommit={(value) => {
                  useAppStore.setState({ randomSeed: value });
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const values = new Uint32Array(1);
                  crypto.getRandomValues(values);
                  useAppStore.setState({ randomSeed: valueOr(values[0], 0) });
                }}
              >
                Reroll scenario seed
              </button>
              <output>
                {randomCategory === "single"
                  ? "1 galaxy"
                  : randomCategory === "collision"
                    ? "2 galaxies"
                    : "5 galaxies"}
                {" · budget "}
                {String(
                  performanceLevel === "low"
                    ? 10_000
                    : performanceLevel === "balanced"
                      ? 30_000
                      : 60_000,
                )}
                {" stars"}
              </output>
              <button
                type="button"
                disabled={anyTrue(historyMarkerId !== null, workerHealth !== "ready")}
                onClick={() => {
                  const setup = generateRandomScenario(
                    randomCategory,
                    randomSeed,
                    performanceLevel,
                  );
                  void runMutation("LOAD_SETUP", { setup, postLoadPlaying: true }).then(() => {
                    useAppStore.setState((state) => ({
                      selectedGalaxyId: null,
                      automaticFraming: true,
                      status: {
                        ...state.status,
                        playing: true,
                        galaxyCount: setup.galaxies.length,
                        starCount: setup.galaxies.reduce(
                          (sum, galaxy) => sum + galaxy.generation.starCount,
                          0,
                        ),
                      },
                    }));
                  });
                }}
              >
                Generate scenario
              </button>
            </>
          )}
          <fieldset hidden={mode === "random"}>
            <label>
              Type
              <select
                value={draft.generation.type}
                disabled={draftControlsDisabled}
                onChange={(event) => {
                  const type = event.currentTarget.value as typeof draft.generation.type,
                    armCount =
                      type === "spiral" || type === "barredSpiral"
                        ? valueOr(draft.generation.armCount, 2)
                        : null;
                  commitDraftGeneration({ ...draft.generation, type, armCount });
                }}
              >
                <option value="spiral">Spiral</option>
                <option value="barredSpiral">Barred spiral</option>
                <option value="elliptical">Elliptical</option>
                <option value="irregular">Irregular</option>
                <option value="dwarf">Dwarf</option>
              </select>
            </label>
            <NumericField
              label="Seed"
              value={draft.generation.seed}
              integer
              min={0}
              max={0xffff_ffff}
              disabled={draftControlsDisabled}
              onCommit={(seed) => {
                commitDraftGeneration({ ...draft.generation, seed });
              }}
            />
            <button
              type="button"
              disabled={draftControlsDisabled}
              onClick={() => {
                const values = new Uint32Array(1);
                crypto.getRandomValues(values);
                commitDraftGeneration({ ...draft.generation, seed: valueOr(values[0], 0) });
              }}
            >
              Reroll seed
            </button>
            <NumericField
              label="Star count"
              value={draft.generation.starCount}
              integer
              min={MIN_STAR_COUNT}
              max={MAX_STAR_COUNT}
              disabled={draftControlsDisabled}
              onCommit={(starCount) => {
                commitDraftGeneration({ ...draft.generation, starCount });
              }}
            />
            <NumericField
              label="Size"
              value={draft.generation.size}
              integer={false}
              min={MIN_SIZE}
              max={MAX_SIZE}
              disabled={draftControlsDisabled}
              onCommit={(size) => {
                commitDraftGeneration({ ...draft.generation, size });
              }}
            />
            <NumericField
              label="Mass"
              value={draft.generation.mass}
              integer={false}
              min={MIN_MASS}
              max={MAX_MASS}
              disabled={draftControlsDisabled}
              onCommit={(mass) => {
                commitDraftGeneration({ ...draft.generation, mass });
              }}
            />
            <NumericField
              label="Spin"
              value={draft.generation.spin}
              integer={false}
              min={MIN_SPIN}
              max={MAX_SPIN}
              disabled={draftControlsDisabled}
              onCommit={(spin) => {
                commitDraftGeneration({ ...draft.generation, spin });
              }}
            />
            <NumericField
              label="Arm count"
              value={draft.generation.armCount}
              integer
              min={MIN_ARM_COUNT}
              max={MAX_ARM_COUNT}
              disabled={anyTrue(draftControlsDisabled, draft.generation.armCount === null)}
              onCommit={(armCount) => {
                commitDraftGeneration({ ...draft.generation, armCount });
              }}
            />
            <label>
              <input
                type="checkbox"
                checked={draft.generation.blackHole}
                disabled={draftControlsDisabled}
                onChange={(event) => {
                  commitDraftGeneration({
                    ...draft.generation,
                    blackHole: event.currentTarget.checked,
                  });
                }}
              />{" "}
              Central black hole
            </label>
            <NameField
              value={draft.name}
              disabled={draftControlsDisabled}
              onCommit={commitDraftName}
            />
            <small>Generation changes reset this galaxy's evolved star positions.</small>
            {projectedDraftStars > PERFORMANCE_STAR_BUDGETS[performanceLevel] && (
              <p role="status">
                Scene exceeds the {performanceLevel} automatic budget; this valid explicit
                configuration may render more slowly.
              </p>
            )}
            {mode === "single" && (
              <button
                type="button"
                disabled={anyTrue(
                  historyMarkerId !== null,
                  workerHealth !== "ready",
                  playbackCommandPending,
                  mutationPending,
                )}
                onClick={() => {
                  const parsed = draftGalaxySchema.safeParse(draft),
                    descriptor = useAppStore.getState().descriptors[0];
                  if (!parsed.success || !descriptor) return;
                  void runMutation("PATCH_GALAXY", {
                    galaxyId: descriptor.id,
                    generation: parsed.data.generation,
                    name: parsed.data.name,
                  });
                }}
              >
                Apply changes
              </button>
            )}
            {mode !== "single" && (
              <button
                type="button"
                disabled={draftControlsDisabled}
                onClick={() => {
                  useAppStore.setState({ draft: resetDraft(performanceLevel, draft) });
                }}
              >
                Reset draft
              </button>
            )}
            {mode !== "single" && (
              <button
                type="button"
                disabled={anyTrue(
                  historyMarkerId !== null,
                  workerHealth !== "ready",
                  playbackCommandPending,
                  mutationPending,
                )}
                onClick={() => {
                  const parsed = draftGalaxySchema.safeParse(draft);
                  if (!parsed.success) {
                    setMessage(valueOr(parsed.error.issues[0]?.message, "Draft is invalid."));
                    return;
                  }
                  const id = crypto.randomUUID();
                  if (!clientRef.current?.mutation) {
                    setMessage("Simulation mutation service is unavailable.");
                    return;
                  }
                  void runMutation("ADD_GALAXY", {
                    // The viewport center is the authoritative add location after manual navigation.
                    galaxy: {
                      id,
                      generation: parsed.data.generation,
                      name: parsed.data.name,
                      position: {
                        x: valueOr(viewportRef.current?.getCameraState?.().centerX, 0),
                        y: valueOr(viewportRef.current?.getCameraState?.().centerY, 0),
                      },
                      bulkVelocity: { x: 0, y: 0 },
                    },
                  })
                    .then(() => {
                      useAppStore.getState().setSelection(id);
                    })
                    .catch((error: unknown) => {
                      setMessage(errorMessage(error, "Galaxy could not be added."));
                    });
                }}
              >
                Add galaxy
              </button>
            )}
            {mode !== "single" && (
              <button
                type="button"
                disabled={anyTrue(
                  selectedGalaxyId === null,
                  historyMarkerId !== null,
                  workerHealth !== "ready",
                  mutationPending,
                )}
                onClick={() => {
                  const parsed = draftGalaxySchema.safeParse(draft),
                    galaxyId = useAppStore.getState().selectedGalaxyId;
                  if (!parsed.success || !galaxyId) return;
                  void runMutation("PATCH_GALAXY", {
                    galaxyId,
                    generation: parsed.data.generation,
                    name: parsed.data.name,
                  });
                }}
              >
                Apply to selected
              </button>
            )}
          </fieldset>
        </form>
        <section
          aria-label="Library"
          className="library-panel"
          data-active-tab={rightTab}
          hidden={rightTab === "selection"}
        >
          <h3>{rightTab.charAt(0).toUpperCase() + rightTab.slice(1)}</h3>
          <button
            className="preset-library"
            type="button"
            disabled={anyTrue(!libraryReady, mutationPending)}
            onClick={() => {
              void saveCurrentPreset().catch((error: unknown) => {
                setMessage(errorMessage(error, "Preset could not be saved."));
              });
            }}
          >
            Save preset
          </button>
          <button
            className="scene-library"
            type="button"
            disabled={anyTrue(!libraryReady, workerHealth !== "ready", mutationPending)}
            onClick={() => {
              const repository = libraryRepositoryRef.current,
                client = clientRef.current;
              if (!repository || !client?.requestSceneSetup) return;
              void client
                .requestSceneSetup()
                .then((setup) => {
                  const now = new Date().toISOString(),
                    id = crypto.randomUUID(),
                    name = defaultLibraryName("Scene", new Date(now));
                  return repository.saveScene({
                    id,
                    name,
                    createdAt: now,
                    updatedAt: now,
                    portable: createSceneFile(
                      { id, name, appVersion: "0.1.0", exportedAt: now },
                      { ...setup, performanceLevel, trails },
                    ),
                  });
                })
                .then(() => repository.list("scene"))
                .then(setScenes)
                .catch((error: unknown) => {
                  setMessage(errorMessage(error, "Scene could not be saved."));
                });
            }}
          >
            Save scene
          </button>
          <label className="preset-library">
            <span>Import preset</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0],
                  repository = libraryRepositoryRef.current;
                if (!file || !repository) return;
                void importPortableFile(file)
                  .then(async (portable) => {
                    if (portable.kind !== "galaxia-preset") throw new Error("INVALID_IMPORT");
                    const id = crypto.randomUUID(),
                      name = await repository.uniqueName("preset", portable.name),
                      now = new Date().toISOString();
                    await repository.savePreset({
                      id,
                      name,
                      createdAt: now,
                      updatedAt: now,
                      builtin: false,
                      portable: { ...portable, id, name },
                    });
                    setPresets(await repository.list("preset"));
                    setMessage(`Imported preset as ${name}.`);
                  })
                  .catch(() => {
                    setMessage("INVALID_IMPORT");
                  });
              }}
            />
          </label>
          <label className="scene-library">
            <span>Import scene</span>
            <input
              type="file"
              accept="application/json,.json"
              disabled={anyTrue(
                historyMarkerId !== null,
                workerHealth !== "ready",
                mutationPending,
              )}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                void (async () => {
                  const validated = await validateSceneImport(file),
                    accepted =
                      !validated.requiresGenerationConfirmation ||
                      window.confirm(
                        `This scene uses generation version ${String(validated.generationVersion)}. Regenerate it with the current version?`,
                      );
                  if (!accepted) return;
                  await runMutation("LOAD_SETUP", {
                    setup: {
                      galaxies: validated.setup.galaxies,
                      gravity: validated.setup.gravity,
                      playbackSpeed: validated.setup.playbackSpeed,
                    },
                    postLoadPlaying: false,
                  });
                  resetNumericEdits();
                  useAppStore.setState((state) => ({
                    mode: "builder",
                    selectedGalaxyId: null,
                    automaticFraming: true,
                    performanceLevel: validated.setup.performanceLevel,
                    trails: validated.setup.trails,
                    status: {
                      ...state.status,
                      playing: false,
                      gravity: validated.setup.gravity,
                      playbackSpeed: validated.setup.playbackSpeed,
                    },
                  }));
                  viewportRef.current?.setAutomaticFraming?.(true);
                  setMessage(
                    choose(
                      validated.requiresGenerationConfirmation,
                      "Scene imported with current-version regeneration; results may differ.",
                      "Scene imported.",
                    ),
                  );
                })().catch((error: unknown) => {
                  setMessage(errorMessage(error, "INVALID_IMPORT"));
                });
              }}
            />
          </label>
          <ul aria-label="Saved presets" className="preset-library">
            {BUILT_IN_PRESETS.map((preset) => (
              <li key={`builtin-${preset.generation.type}`}>
                <span>{preset.name}</span>{" "}
                <button
                  type="button"
                  disabled={anyTrue(
                    historyMarkerId !== null,
                    workerHealth !== "ready",
                    mutationPending,
                  )}
                  onClick={() => {
                    void applyPreset(structuredClone(preset));
                  }}
                >
                  Load built-in preset
                </button>
              </li>
            ))}
            {presets.map((preset) => (
              <li key={preset.id}>
                <span>{preset.name}</span>{" "}
                <button
                  type="button"
                  disabled={anyTrue(
                    historyMarkerId !== null,
                    workerHealth !== "ready",
                    mutationPending,
                  )}
                  onClick={() => {
                    void libraryDatabaseRef.current?.presets.get(preset.id).then((row) => {
                      if (!row) throw new Error("LIBRARY_ITEM_NOT_FOUND");
                      return applyPreset(presetFileV1Schema.parse(row.portable).payload);
                    });
                  }}
                >
                  Load preset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void libraryDatabaseRef.current?.presets.get(preset.id).then((row) => {
                      if (!row) throw new Error("LIBRARY_ITEM_NOT_FOUND");
                      const portable = presetFileV1Schema.parse(row.portable),
                        name = boundedExportName(row.name, ".galaxia-preset.json");
                      downloadBlob(exportPortableFile(portable), name);
                      setMessage(`Exported ${name}.`);
                    });
                  }}
                >
                  Export preset
                </button>
                <button
                  type="button"
                  disabled={preset.builtin}
                  onClick={() => {
                    const desired = window.prompt("Preset name", preset.name),
                      repository = libraryRepositoryRef.current;
                    if (desired === null || !repository) return;
                    void repository
                      .rename("preset", preset.id, desired)
                      .then(async (name) => {
                        setPresets(await repository.list("preset"));
                        setMessage(`Preset renamed to ${name}.`);
                      })
                      .catch((error: unknown) => {
                        setMessage(errorMessage(error, "NAME_COLLISION"));
                      });
                  }}
                >
                  Rename preset
                </button>
                <button
                  type="button"
                  disabled={preset.builtin}
                  onClick={() => {
                    const repository = libraryRepositoryRef.current;
                    if (!repository || !window.confirm(`Delete ${preset.name}?`)) return;
                    void repository.delete("preset", preset.id).then(async () => {
                      setPresets(await repository.list("preset"));
                      setMessage("Preset deleted.");
                    });
                  }}
                >
                  Delete preset
                </button>
              </li>
            ))}
          </ul>
          <ul aria-label="Saved scenes" className="scene-library">
            {scenes.map((scene) => (
              <li key={scene.id}>
                <span>{scene.name}</span>{" "}
                <button
                  type="button"
                  disabled={anyTrue(
                    historyMarkerId !== null,
                    workerHealth !== "ready",
                    mutationPending,
                  )}
                  onClick={() => {
                    void libraryDatabaseRef.current?.scenes
                      .get(scene.id)
                      .then((row) => {
                        if (!row) throw new Error("LIBRARY_ITEM_NOT_FOUND");
                        return sceneFileV1Schema.parse(row.portable).payload;
                      })
                      .then((setup) =>
                        runMutation("LOAD_SETUP", {
                          setup: {
                            galaxies: setup.galaxies,
                            gravity: setup.gravity,
                            playbackSpeed: setup.playbackSpeed,
                          },
                          postLoadPlaying: false,
                        }).then(() => setup),
                      )
                      .then((setup) => {
                        resetNumericEdits();
                        useAppStore.setState((state) => ({
                          mode: "builder",
                          selectedGalaxyId: null,
                          automaticFraming: true,
                          performanceLevel: setup.performanceLevel,
                          trails: setup.trails,
                          status: {
                            ...state.status,
                            playing: false,
                            gravity: setup.gravity,
                            playbackSpeed: setup.playbackSpeed,
                          },
                        }));
                        viewportRef.current?.setAutomaticFraming?.(true);
                      })
                      .catch((error: unknown) => {
                        setMessage(errorMessage(error, "Scene could not be loaded."));
                      });
                  }}
                >
                  Load scene
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void libraryDatabaseRef.current?.scenes
                      .get(scene.id)
                      .then((row) => {
                        if (!row) throw new Error("LIBRARY_ITEM_NOT_FOUND");
                        const portable = sceneFileV1Schema.parse(row.portable),
                          name = boundedExportName(row.name, ".galaxia-scene.json");
                        downloadBlob(exportPortableFile(portable), name);
                        setMessage(`Exported ${name}.`);
                      })
                      .catch((error: unknown) => {
                        setMessage(errorMessage(error, "EXPORT_FAILED"));
                      });
                  }}
                >
                  Export scene
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const desired = window.prompt("Scene name", scene.name),
                      repository = libraryRepositoryRef.current;
                    if (desired === null || !repository) return;
                    void repository
                      .rename("scene", scene.id, desired)
                      .then(async (name) => {
                        setScenes(await repository.list("scene"));
                        setMessage(`Scene renamed to ${name}.`);
                      })
                      .catch((error: unknown) => {
                        setMessage(errorMessage(error, "NAME_COLLISION"));
                      });
                  }}
                >
                  Rename scene
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const repository = libraryRepositoryRef.current;
                    if (!repository || !window.confirm(`Delete ${scene.name}?`)) return;
                    void repository.delete("scene", scene.id).then(async () => {
                      setScenes(await repository.list("scene"));
                      setMessage("Scene deleted.");
                    });
                  }}
                >
                  Delete scene
                </button>
              </li>
            ))}
          </ul>
          <ul aria-label="Saved captures" className="capture-library">
            {captures.map((capture) => (
              <li key={capture.id}>
                <button
                  type="button"
                  onClick={() => {
                    void showCapture(capture.id).catch((error: unknown) => {
                      setMessage(errorMessage(error, "LIBRARY_ITEM_NOT_FOUND"));
                    });
                  }}
                >
                  {capture.name}
                </button>{" "}
                <button
                  type="button"
                  onClick={() => {
                    const desired = window.prompt("Capture name", capture.name),
                      repository = libraryRepositoryRef.current;
                    if (desired === null || !repository) return;
                    void repository
                      .rename("capture", capture.id, desired)
                      .then(async (name) => {
                        setCaptures(await repository.list("capture"));
                        if (selectedCapture?.id === capture.id) await showCapture(capture.id);
                        setMessage(`Capture renamed to ${name}.`);
                      })
                      .catch((error: unknown) => {
                        setMessage(errorMessage(error, "NAME_COLLISION"));
                      });
                  }}
                >
                  Rename capture
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const repository = libraryRepositoryRef.current;
                    if (!repository || !window.confirm(`Delete ${capture.name}?`)) return;
                    void repository.delete("capture", capture.id).then(async () => {
                      if (selectedCapture?.id === capture.id) setSelectedCapture(null);
                      setCaptures(await repository.list("capture"));
                      setMessage("Capture deleted.");
                    });
                  }}
                >
                  Delete capture
                </button>
              </li>
            ))}
          </ul>
          {selectedCapture && (
            <section aria-label="Capture detail" className="capture-detail capture-library">
              <h4>{selectedCapture.name}</h4>
              <img
                src={selectedCapture.previewUrl}
                alt={`Capture preview: ${selectedCapture.name}`}
              />
              <button
                type="button"
                onClick={() => {
                  const name = boundedExportName(selectedCapture.name, ".png");
                  downloadBlob(selectedCapture.blob, name);
                  setMessage(`Downloaded ${name}.`);
                }}
              >
                Download capture
              </button>
            </section>
          )}
          <ul aria-label="Saved recordings" className="recording-library">
            {recordings.map((recording) => (
              <li key={recording.id}>
                <button
                  type="button"
                  onClick={() => {
                    void showRecording(recording.id).catch((error: unknown) => {
                      setMessage(errorMessage(error, "LIBRARY_ITEM_NOT_FOUND"));
                    });
                  }}
                >
                  {recording.name}
                </button>{" "}
                <span>
                  {recording.state}
                  {choose(
                    recording.state !== "complete",
                    ` (${recording.terminalReason})`,
                    "",
                  )} · {String(recording.capturedCount)} captured · {String(recording.missedCount)}{" "}
                  missed
                </span>
              </li>
            ))}
          </ul>
          {selectedRecording && (
            <section aria-label="Recording detail" className="recording-detail recording-library">
              <h4>{selectedRecording.row.name}</h4>
              <p>
                {String(selectedRecording.row.width)}×{String(selectedRecording.row.height)} ·{" "}
                {(selectedRecording.row.durationMs / 1000).toFixed(1)} seconds ·{" "}
                {String(selectedRecording.row.nominalSlots)} nominal slots ·{" "}
                {String(selectedRecording.row.capturedCount)} captured ·{" "}
                {String(selectedRecording.row.missedCount)} missed
              </p>
              {selectedRecording.previewUrl && selectedRecording.frame && (
                <img
                  src={selectedRecording.previewUrl}
                  alt={`Recording frame ${String(selectedRecording.frame.slot)}`}
                />
              )}
              <div>
                <button
                  type="button"
                  disabled={!selectedRecording.frame}
                  onClick={() => {
                    if (!selectedRecording.frame) return;
                    void recordingRepositoryRef.current
                      ?.adjacent(selectedRecording.row.id, selectedRecording.frame.slot, -1)
                      .then((frame) => showRecording(selectedRecording.row.id, frame));
                  }}
                >
                  Previous frame
                </button>
                <button
                  type="button"
                  disabled={!selectedRecording.frame}
                  onClick={() => {
                    if (!selectedRecording.frame) return;
                    void recordingRepositoryRef.current
                      ?.adjacent(selectedRecording.row.id, selectedRecording.frame.slot, 1)
                      .then((frame) => showRecording(selectedRecording.row.id, frame));
                  }}
                >
                  Next frame
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const desired = window.prompt("Recording name", selectedRecording.row.name);
                  if (desired === null) return;
                  void recordingRepositoryRef.current
                    ?.rename(selectedRecording.row.id, desired)
                    .then(async (name) => {
                      const repository = recordingRepositoryRef.current;
                      if (repository) setRecordings(await repository.list());
                      await showRecording(selectedRecording.row.id);
                      setMessage(`Recording renamed to ${name}.`);
                    })
                    .catch((error: unknown) => {
                      setMessage(errorMessage(error, "NAME_COLLISION"));
                    });
                }}
              >
                Rename recording
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Delete ${selectedRecording.row.name}?`)) return;
                  void recordingRepositoryRef.current
                    ?.delete(selectedRecording.row.id)
                    .then(async () => {
                      const repository = recordingRepositoryRef.current;
                      setSelectedRecording(null);
                      if (repository) setRecordings(await repository.list());
                      setMessage("Recording deleted.");
                    });
                }}
              >
                Delete recording
              </button>
              <p>
                Export requires {String(selectedRecording.plan.parts.length)} ZIP{" "}
                {choose(selectedRecording.plan.parts.length === 1, "part", "parts")}.
              </p>
              {"showDirectoryPicker" in window && (
                <button
                  type="button"
                  onClick={() => {
                    void exportRecordingFolder().catch((error: unknown) => {
                      setMessage(errorMessage(error, "EXPORT_FAILED"));
                    });
                  }}
                >
                  Export all parts to folder
                </button>
              )}
              {selectedRecording.plan.parts.map((_slots, index) => {
                const partNumber = index + 1,
                  complete = selectedRecording.exportedParts.has(partNumber);
                return (
                  <button
                    type="button"
                    key={partNumber}
                    onClick={() => {
                      void exportRecordingPart(partNumber).catch((error: unknown) => {
                        setMessage(errorMessage(error, "EXPORT_FAILED"));
                      });
                    }}
                  >
                    {choose(complete, "Retry", "Export")} recording part {String(partNumber)}
                  </button>
                );
              })}
            </section>
          )}
        </section>
      </aside>
      <section
        className="viewport-region"
        onWheel={(event) => {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          viewportRef.current?.zoomAtCssPoint?.(
            event.deltaY < 0 ? 1.1 : 1 / 1.1,
            event.clientX - bounds.left,
            event.clientY - bounds.top,
          );
          const camera = viewportRef.current?.getCameraState?.();
          if (camera) setCameraDisplay({ ...camera });
          useAppStore.setState({ automaticFraming: false });
        }}
        onPointerDown={(event) => {
          if (rendererHealth !== "ready" || historyMarkerId !== null) return;
          const bounds = event.currentTarget.getBoundingClientRect(),
            point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
            viewport = viewportRef.current;
          if (!viewport) return;
          let kind: "pan" | "center" | "velocity" = "pan";
          const liveSelectedCore = latestCores.current.find((core) => core.id === selectedGalaxyId),
            velocityStarted =
              selectedGalaxyId !== null &&
              liveSelectedCore !== undefined &&
              Math.hypot(liveSelectedCore.vx, liveSelectedCore.vy) > 1e-9 &&
              valueOr(viewport.beginVelocityDrag?.(selectedGalaxyId, point), false),
            picked = velocityStarted
              ? null
              : valueOr(viewport.pickAtCssPoint?.(point.x, point.y), null);
          if (velocityStarted) kind = "velocity";
          else if (picked) {
            useAppStore.getState().setSelection(picked);
            const descriptor = descriptors.find((item) => item.id === picked);
            if (descriptor)
              useAppStore.setState({
                draft: {
                  generation: structuredClone(descriptor.generation),
                  name: descriptor.name,
                },
              });
            if (viewport.beginCenterDrag?.(picked, point)) kind = "center";
          } else useAppStore.getState().setSelection(null);
          pointerGestureRef.current = { pointerId: event.pointerId, kind, last: point };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const gesture = pointerGestureRef.current;
          if (gesture?.pointerId !== event.pointerId) return;
          const bounds = event.currentTarget.getBoundingClientRect(),
            point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
            viewport = viewportRef.current;
          if (!viewport) return;
          if (gesture.kind === "pan") {
            viewport.panByCssPixels?.(point.x - gesture.last.x, point.y - gesture.last.y);
            const camera = viewport.getCameraState?.();
            if (camera) setCameraDisplay({ ...camera });
            useAppStore.setState({ automaticFraming: false });
          } else {
            const preview =
              gesture.kind === "center"
                ? viewport.updateCenterDrag?.(point)
                : viewport.updateVelocityDrag?.(point);
            if (!preview) {
              pointerGestureRef.current = null;
              setDragPreview(null);
              setMessage("Scene changed; drag cancelled.");
              return;
            }
            setDragPreview({ kind: gesture.kind, preview });
          }
          gesture.last = point;
        }}
        onPointerUp={(event) => {
          const gesture = pointerGestureRef.current,
            viewport = viewportRef.current;
          if (gesture?.pointerId !== event.pointerId || !viewport) return;
          if (gesture.kind !== "pan") {
            const commit = viewport.finishDrag?.();
            if (commit?.type === "MOVE_GALAXY")
              void runMutation("MOVE_GALAXY", {
                galaxyId: commit.galaxyId,
                position: commit.position,
              });
            if (commit?.type === "SET_BULK_VELOCITY")
              void runMutation("SET_BULK_VELOCITY", {
                galaxyId: commit.galaxyId,
                bulkVelocity: commit.velocity,
              });
          }
          pointerGestureRef.current = null;
          setDragPreview(null);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (pointerGestureRef.current?.pointerId !== event.pointerId) return;
          viewportRef.current?.cancelDrag?.();
          pointerGestureRef.current = null;
          setDragPreview(null);
        }}
      >
        <div className="viewport" ref={viewportHost} role="img" aria-label={summary} />
        {selectedCore && cameraDisplay.cssWidth > 0 && (
          <svg
            className={`editing-overlay ${dragPreview && !dragPreview.preview.valid ? "invalid" : ""}`}
            width={cameraDisplay.cssWidth}
            height={cameraDisplay.cssHeight}
            aria-hidden="true"
          >
            {(() => {
              const core =
                  dragPreview?.kind === "center" ? dragPreview.preview.point : selectedCore,
                velocity =
                  dragPreview?.kind === "velocity"
                    ? dragPreview.preview.point
                    : { x: selectedCore.vx, y: selectedCore.vy },
                center = worldToScreen(cameraDisplay, core),
                endpoint = worldToScreen(cameraDisplay, {
                  x: core.x + velocity.x * 2,
                  y: core.y + velocity.y * 2,
                });
              return (
                <>
                  <circle
                    className="selected-core-ring"
                    cx={center.x}
                    cy={center.y}
                    r={Math.max(6, selectedCore.coreRadius * cameraDisplay.zoom + 3)}
                  />
                  <line
                    className="velocity-line"
                    x1={center.x}
                    y1={center.y}
                    x2={endpoint.x}
                    y2={endpoint.y}
                  />
                  <circle className="velocity-handle" cx={endpoint.x} cy={endpoint.y} r={6} />
                </>
              );
            })()}
          </svg>
        )}
        {message && (
          <p role="status" className="viewport-message">
            {message}
          </p>
        )}
        {workerHealth === "unavailable" && (
          <section className="recovery-panel" role="alert">
            <h2>Simulation unavailable</h2>
            <p>
              {recovery
                ? `Checkpoint at step ${String(recovery.stepIndex)}, captured about ${(
                    recovery.ageMs / 1000
                  ).toFixed(1)} seconds ago.`
                : "No complete recovery checkpoint is available."}
            </p>
            <button
              type="button"
              disabled={!recovery}
              onClick={() => {
                void clientRef.current?.restoreLatestCheckpoint?.().then(() => {
                  useAppStore.getState().setHistory([], null);
                  setRecovery(null);
                  setWorkerHealth("ready");
                });
              }}
            >
              Restore checkpoint
            </button>
            <button
              type="button"
              disabled={!regenerationCompatible}
              onClick={() => {
                const galaxies = recoveryDescriptors.map((descriptor, index) => {
                  const core = recoveryCores[index];
                  if (!core) throw new Error("Recovery frame is incompatible.");
                  return {
                    id: descriptor.id,
                    generation: { ...descriptor.generation },
                    name: descriptor.name,
                    position: { x: core.x, y: core.y },
                    bulkVelocity: { x: core.vx, y: core.vy },
                  };
                });
                void clientRef.current
                  ?.regenerateFromSetup?.({
                    galaxies,
                    gravity: status.gravity,
                    playbackSpeed: status.playbackSpeed as 0.25 | 0.5 | 1 | 2 | 4,
                  })
                  .then(() => {
                    useAppStore.getState().setHistory([], null);
                    setRecovery(null);
                    setWorkerHealth("ready");
                    setMessage("Scene regenerated; evolved star motion after the frame was lost.");
                  });
              }}
            >
              Regenerate from last compatible frame
            </button>
            <p>Regenerating is a separate lossy choice and never happens automatically.</p>
          </section>
        )}
        <div className="drawer-tabs">
          <button
            onClick={() => {
              setPanel(panel === "creation" ? null : "creation");
            }}
          >
            Create
          </button>
          <button
            onClick={() => {
              setPanel(panel === "inspector" ? null : "inspector");
            }}
          >
            Inspect
          </button>
        </div>
      </section>
      <aside className={`inspector-panel ${panel === "inspector" ? "drawer-open" : ""}`}>
        <div className="right-tabs" role="tablist" aria-label="Inspector and library">
          {(["selection", "presets", "scenes", "captures", "recordings"] as const).map((tab) => (
            <button
              type="button"
              role="tab"
              key={tab}
              aria-selected={rightTab === tab}
              onClick={() => {
                setRightTab(tab);
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <section hidden={rightTab !== "selection"} aria-label="Selection tab">
          <h2>Selection</h2>
          <p>{selectedGalaxyId === null ? "Pick a galaxy to inspect it." : "Galaxy selected."}</p>
          <ul aria-label="Scene galaxies">
            {descriptors.map((descriptor) => (
              <li key={descriptor.id}>
                <button
                  type="button"
                  aria-pressed={selectedGalaxyId === descriptor.id}
                  onClick={() => {
                    useAppStore.getState().setSelection(descriptor.id);
                    useAppStore.setState({
                      draft: {
                        generation: structuredClone(descriptor.generation),
                        name: descriptor.name,
                      },
                    });
                  }}
                >
                  {valueOr(descriptor.name, descriptor.id)}
                </button>
              </li>
            ))}
          </ul>
          {selectedDescriptor && selectedCore && (
            <section aria-label="Selected galaxy configuration">
              <h3>{valueOr(selectedDescriptor.name, selectedDescriptor.id)}</h3>
              <p>
                {selectedDescriptor.generation.type} ·{" "}
                {String(selectedDescriptor.generation.starCount)}
                {" stars · Size "}
                {String(selectedDescriptor.generation.size)}
              </p>
              <NumericField
                label="Position X"
                value={selectedCore.x}
                integer={false}
                min={MIN_POSITION}
                max={MAX_POSITION}
                onCommit={(x) => {
                  const core = latestCores.current.find(
                    (item) => item.id === selectedDescriptor.id,
                  );
                  if (!core) return;
                  void runMutation("MOVE_GALAXY", {
                    galaxyId: selectedDescriptor.id,
                    position: { x, y: core.y },
                  });
                }}
              />
              <NumericField
                label="Position Y"
                value={selectedCore.y}
                integer={false}
                min={MIN_POSITION}
                max={MAX_POSITION}
                onCommit={(y) => {
                  const core = latestCores.current.find(
                    (item) => item.id === selectedDescriptor.id,
                  );
                  if (!core) return;
                  void runMutation("MOVE_GALAXY", {
                    galaxyId: selectedDescriptor.id,
                    position: { x: core.x, y },
                  });
                }}
              />
              <NumericField
                label="Velocity X"
                value={selectedCore.vx}
                integer={false}
                min={-Math.sqrt(MAX_BULK_SPEED ** 2 - selectedCore.vy ** 2)}
                max={Math.sqrt(MAX_BULK_SPEED ** 2 - selectedCore.vy ** 2)}
                onCommit={(vx) => {
                  const core = latestCores.current.find(
                    (item) => item.id === selectedDescriptor.id,
                  );
                  if (!core || Math.hypot(vx, core.vy) > MAX_BULK_SPEED) return;
                  void runMutation("SET_BULK_VELOCITY", {
                    galaxyId: selectedDescriptor.id,
                    bulkVelocity: { x: vx, y: core.vy },
                  });
                }}
              />
              <NumericField
                label="Velocity Y"
                value={selectedCore.vy}
                integer={false}
                min={-Math.sqrt(MAX_BULK_SPEED ** 2 - selectedCore.vx ** 2)}
                max={Math.sqrt(MAX_BULK_SPEED ** 2 - selectedCore.vx ** 2)}
                onCommit={(vy) => {
                  const core = latestCores.current.find(
                    (item) => item.id === selectedDescriptor.id,
                  );
                  if (!core || Math.hypot(core.vx, vy) > MAX_BULK_SPEED) return;
                  void runMutation("SET_BULK_VELOCITY", {
                    galaxyId: selectedDescriptor.id,
                    bulkVelocity: { x: core.vx, y: vy },
                  });
                }}
              />
              <p>
                Drag a galaxy core to move it; edit velocity here to change the velocity handle.
              </p>
              <button
                type="button"
                disabled={anyTrue(!libraryReady, mutationPending)}
                onClick={() => {
                  void saveCurrentPreset().catch((error: unknown) => {
                    setMessage(errorMessage(error, "Preset could not be saved."));
                  });
                }}
              >
                Save preset
              </button>
            </section>
          )}
          <ul className="overlay-key" aria-label="Scene overlay key">
            <li>
              <i className="center-mark" />
              Galaxy center
            </li>
            <li>
              <i className="selection-mark" />
              Current selection
            </li>
            <li>
              <i className="velocity-mark" />
              Non-zero velocity
            </li>
          </ul>
          {mode !== "single" && (
            <button
              type="button"
              disabled={anyTrue(
                selectedGalaxyId === null,
                historyMarkerId !== null,
                workerHealth !== "ready",
              )}
              onClick={() => {
                const galaxyId = useAppStore.getState().selectedGalaxyId;
                if (!galaxyId) return;
                void runMutation("DELETE_GALAXY", { galaxyId }).then(() => {
                  useAppStore.getState().setSelection(null);
                });
              }}
            >
              Delete selected galaxy
            </button>
          )}
        </section>
      </aside>
      <HistoryScrubber
        markerIds={historyMarkerIds}
        selectedMarkerId={historyMarkerId}
        busy={historyBusy}
        onScrub={(markerId) => {
          useAppStore.setState({ historyBusy: true });
          const entering = useAppStore.getState().historyMarkerId === null;
          void clientRef.current
            ?.command?.(
              entering ? "ENTER_HISTORY" : "SCRUB_TO_MARKER",
              entering
                ? { markerId: `marker-${String(markerId)}` }
                : {
                    markerId: `marker-${String(markerId)}`,
                    reconstructionToken: crypto.randomUUID(),
                  },
              {
                expectedModelRevision: valueOr(clientRef.current.modelRevision, null),
                timeoutMs: 30_000,
              },
            )
            .then(() => {
              useAppStore.setState((state) => ({
                historyMarkerId: markerId,
                historyBusy: false,
                status: { ...state.status, playing: false },
              }));
            })
            .catch((error: unknown) => {
              useAppStore.setState({ historyBusy: false });
              setMessage(errorMessage(error, "History reconstruction failed."));
            });
        }}
        onExit={() => {
          void clientRef.current?.command?.("EXIT_HISTORY_TO_PRESENT", {}).then(() => {
            useAppStore.setState((state) => ({
              historyMarkerId: null,
              historyBusy: false,
              status: { ...state.status, playing: false },
            }));
          });
        }}
        onResume={(markerId) => {
          void clientRef.current
            ?.mutation?.("RESUME_FROM_MARKER", { markerId: `marker-${String(markerId)}` })
            .then(() => {
              useAppStore.setState((state) => ({
                historyMarkerId: null,
                historyBusy: false,
                status: { ...state.status, playing: true },
              }));
            });
        }}
      />
      <footer className="timeline" aria-hidden={!useAppStore.getState().recordingActive} />
    </main>
  );
}
