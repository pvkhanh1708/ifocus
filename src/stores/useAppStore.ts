import { create } from "zustand";
import {
    Scene,
    EffectType,
    TimerMode,
    Task,
    Note,
    Countdown,
    BgFilters,
    SyncVisualizerConfig,
} from "../types";
import {
    DEFAULT_IMAGES,
    DEFAULT_BG_FILTERS,
    DEFAULT_SYNC_VISUALIZER_CONFIG,
} from "../constants";
import { apiRequest } from "../utils/api";
import { saveSetting, setSettingsCache } from "./settings";
import {
    createItem,
    deleteItem,
    fetchList,
    reorderItems,
    updateItem,
    updateItemDebounced,
    type ListName,
} from "./listSync";

// ============================================================================
// State Interfaces
// ============================================================================

interface SceneState {
    currentScene: Scene;
    setCurrentScene: (scene: Scene) => void;
}

interface EffectState {
    currentEffect: EffectType;
    setCurrentEffect: (effect: EffectType) => void;
}

interface TimerState {
    timerMode: TimerMode;
    showTimer: boolean;
    setTimerMode: (mode: TimerMode) => void;
    setShowTimer: (show: boolean) => void;
}

interface VisualizerState {
    showVisualizer: boolean;
    visualizerMode: "center" | "window";
    setShowVisualizer: (show: boolean) => void;
    setVisualizerMode: (mode: "center" | "window") => void;
}

interface BackgroundState {
    isBgMuted: boolean;
    bgFilters: BgFilters;
    bgInitialZoom: number;
    syncVisualizerConfig: SyncVisualizerConfig;
    showVideoModal: boolean;
    setIsBgMuted: (muted: boolean) => void;
    setBgFilters: (filters: BgFilters) => void;
    setBgInitialZoom: (zoom: number) => void;
    setSyncVisualizerConfig: (config: SyncVisualizerConfig) => void;
    setShowVideoModal: (show: boolean) => void;
}

interface TasksState {
    tasks: Task[];
    addTask: (task: Task) => void;
    toggleTask: (id: string) => void;
    deleteTask: (id: string) => void;
}

interface NotesState {
    notes: Note[];
    addNote: (note: Note) => void;
    updateNote: (id: string, updates: Partial<Omit<Note, "id">>) => void;
    deleteNote: (id: string) => void;
}

interface CountdownsState {
    countdowns: Countdown[];
    addCountdown: (countdown: Countdown) => void;
    deleteCountdown: (id: string) => void;
    reorderCountdowns: (fromIndex: number, toIndex: number) => void;
}

interface ServerState {
    hydrate: () => Promise<void>;
}

// Combined App State
interface AppState
    extends SceneState,
    EffectState,
    TimerState,
    VisualizerState,
    BackgroundState,
    TasksState,
    NotesState,
    CountdownsState,
    ServerState { }

// ============================================================================
// Store Creation
// ============================================================================

/** Save a UI setting to /api/data (debounced per key, see stores/settings.ts). */
const save = (key: string, value: unknown) => saveSetting(key, value);

/**
 * Lists are updated optimistically. If a request fails, reload that list from
 * the server so the UI shows what is actually saved.
 */
const resyncList = (list: ListName) => (error: unknown) => {
    console.error(`Không thể lưu ${list}:`, error);
    fetchList(list)
        .then((items) => useAppStore.setState({ [list]: items } as Partial<AppState>))
        .catch((fetchError) => console.error(`Không thể tải lại ${list}:`, fetchError));
};

export const useAppStore = create<AppState>()((set, get) => ({
    // ========================================
    // Scene State
    // ========================================
    currentScene: DEFAULT_IMAGES[0],
    setCurrentScene: (scene) => {
        set({ currentScene: scene });
        save("currentScene", scene);
    },

    // ========================================
    // Effect State
    // ========================================
    currentEffect: "none" as EffectType,
    setCurrentEffect: (effect) => {
        set({ currentEffect: effect });
        save("currentEffect", effect);
    },

    // ========================================
    // Timer State
    // ========================================
    timerMode: "pomodoro" as TimerMode,
    showTimer: true,
    setTimerMode: (mode) => {
        set({ timerMode: mode });
        save("timerMode", mode);
    },
    setShowTimer: (show) => {
        set({ showTimer: show });
        save("showTimer", show);
    },

    // ========================================
    // Visualizer State
    // ========================================
    showVisualizer: false,
    visualizerMode: "window" as "center" | "window",
    setShowVisualizer: (show) => {
        set({ showVisualizer: show });
        save("showVisualizer", show);
    },
    setVisualizerMode: (mode) => {
        set({ visualizerMode: mode });
        save("visualizerMode", mode);
    },

    // ========================================
    // Background State
    // ========================================
    isBgMuted: true,
    bgFilters: DEFAULT_BG_FILTERS,
    bgInitialZoom: 100,
    syncVisualizerConfig: DEFAULT_SYNC_VISUALIZER_CONFIG,
    showVideoModal: false,
    setIsBgMuted: (muted) => {
        set({ isBgMuted: muted });
        save("isBgMuted", muted);
    },
    setBgFilters: (filters) => {
        set({ bgFilters: filters });
        save("bgFilters", filters);
    },
    setBgInitialZoom: (zoom) => {
        set({ bgInitialZoom: zoom });
        save("bgInitialZoom", zoom);
    },
    setSyncVisualizerConfig: (config) => {
        set({ syncVisualizerConfig: config });
        save("syncVisualizerConfig", config);
    },
    setShowVideoModal: (show) => set({ showVideoModal: show }),

    // ========================================
    // Tasks State
    // ========================================
    // Each change is sent as a single-item request to /api/tasks.
    tasks: [],
    addTask: (task) => {
        set((state) => ({ tasks: [...state.tasks, task] }));
        createItem("tasks", task).catch(resyncList("tasks"));
    },
    toggleTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;
        const completed = !task.completed;
        set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? { ...t, completed } : t)),
        }));
        updateItem("tasks", id, { completed }).catch(resyncList("tasks"));
    },
    deleteTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
        deleteItem("tasks", id).catch(resyncList("tasks"));
    },

    // ========================================
    // Notes State
    // ========================================
    notes: [],
    addNote: (note) => {
        set((state) => ({ notes: [note, ...state.notes] }));
        createItem("notes", note).catch(resyncList("notes"));
    },
    updateNote: (id, updates) => {
        const changes = { ...updates, updatedAt: Date.now() };
        set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? { ...n, ...changes } : n)),
        }));
        // Typing fires on every keystroke: send once the user pauses.
        updateItemDebounced("notes", id, changes, resyncList("notes"));
    },
    deleteNote: (id) => {
        set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
        deleteItem("notes", id).catch(resyncList("notes"));
    },

    // ========================================
    // Countdowns State
    // ========================================
    countdowns: [],
    addCountdown: (countdown) => {
        set((state) => ({ countdowns: [countdown, ...state.countdowns] }));
        createItem("countdowns", countdown).catch(resyncList("countdowns"));
    },
    deleteCountdown: (id) => {
        set((state) => ({ countdowns: state.countdowns.filter((c) => c.id !== id) }));
        deleteItem("countdowns", id).catch(resyncList("countdowns"));
    },
    reorderCountdowns: (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        const updated = [...get().countdowns];
        const [moved] = updated.splice(fromIndex, 1);
        if (!moved) return;
        updated.splice(toIndex, 0, moved);
        set({ countdowns: updated });
        reorderItems("countdowns", updated.map((c) => c.id)).catch(resyncList("countdowns"));
    },

    hydrate: async () => {
        // Settings and every list in a single request.
        const { data, tasks, notes, countdowns } = await apiRequest<{
            data: Record<string, unknown>;
            tasks: Task[];
            notes: Note[];
            countdowns: Countdown[];
        }>("/api/state");

        // Components using useLocalStorage read their settings from this cache.
        setSettingsCache(data);

        // Only take keys this store owns as plain values, so a stored setting
        // can never overwrite an action (function) of the store.
        set((state) => {
            const owned: Partial<AppState> = {};
            for (const [key, value] of Object.entries(data)) {
                if (key in state && typeof state[key as keyof AppState] !== "function") {
                    (owned as Record<string, unknown>)[key] = value;
                }
            }
            return { ...owned, tasks, notes, countdowns };
        });
    },
}));

// ============================================================================
// Selector Hooks (for optimized re-renders)
// ============================================================================

// Scene selectors
export const useCurrentScene = () => useAppStore((s) => s.currentScene);
export const useSetCurrentScene = () => useAppStore((s) => s.setCurrentScene);

// Effect selectors
export const useCurrentEffect = () => useAppStore((s) => s.currentEffect);
export const useSetCurrentEffect = () => useAppStore((s) => s.setCurrentEffect);

// Timer selectors
export const useTimerMode = () => useAppStore((s) => s.timerMode);
export const useSetTimerMode = () => useAppStore((s) => s.setTimerMode);
export const useShowTimer = () => useAppStore((s) => s.showTimer);
export const useSetShowTimer = () => useAppStore((s) => s.setShowTimer);

// Visualizer selectors
export const useShowVisualizer = () => useAppStore((s) => s.showVisualizer);
export const useSetShowVisualizer = () =>
    useAppStore((s) => s.setShowVisualizer);
export const useVisualizerMode = () => useAppStore((s) => s.visualizerMode);
export const useSetVisualizerMode = () =>
    useAppStore((s) => s.setVisualizerMode);

// Background selectors
export const useIsBgMuted = () => useAppStore((s) => s.isBgMuted);
export const useSetIsBgMuted = () => useAppStore((s) => s.setIsBgMuted);
export const useBgFilters = () => useAppStore((s) => s.bgFilters);
export const useSetBgFilters = () => useAppStore((s) => s.setBgFilters);
export const useBgInitialZoom = () => useAppStore((s) => s.bgInitialZoom);
export const useSetBgInitialZoom = () => useAppStore((s) => s.setBgInitialZoom);
export const useSyncVisualizerConfig = () =>
    useAppStore((s) => s.syncVisualizerConfig);
export const useSetSyncVisualizerConfig = () =>
    useAppStore((s) => s.setSyncVisualizerConfig);
export const useShowVideoModal = () => useAppStore((s) => s.showVideoModal);
export const useSetShowVideoModal = () =>
    useAppStore((s) => s.setShowVideoModal);

// Tasks selectors
export const useTasks = () => useAppStore((s) => s.tasks);
export const useAddTask = () => useAppStore((s) => s.addTask);
export const useToggleTask = () => useAppStore((s) => s.toggleTask);
export const useDeleteTask = () => useAppStore((s) => s.deleteTask);

// Notes selectors
export const useNotes = () => useAppStore((s) => s.notes);
export const useAddNote = () => useAppStore((s) => s.addNote);
export const useUpdateNote = () => useAppStore((s) => s.updateNote);
export const useDeleteNote = () => useAppStore((s) => s.deleteNote);

// Countdown selectors
export const useCountdowns = () => useAppStore((s) => s.countdowns);
export const useAddCountdown = () => useAppStore((s) => s.addCountdown);
export const useDeleteCountdown = () => useAppStore((s) => s.deleteCountdown);
export const useReorderCountdowns = () => useAppStore((s) => s.reorderCountdowns);
