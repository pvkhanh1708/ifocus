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
    setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
    addTask: (task: Task) => void;
    toggleTask: (id: string) => void;
    deleteTask: (id: string) => void;
}

interface NotesState {
    notes: Note[];
    setNotes: (notes: Note[] | ((prev: Note[]) => Note[])) => void;
    addNote: (note: Note) => void;
    updateNote: (id: string, updates: Partial<Note>) => void;
    deleteNote: (id: string) => void;
}

interface CountdownsState {
    countdowns: Countdown[];
    setCountdowns: (
        countdowns: Countdown[] | ((prev: Countdown[]) => Countdown[])
    ) => void;
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

const save = (key: string, value: unknown) => {
    void apiRequest("/api/data", {
        method: "PATCH",
        body: JSON.stringify({ key, value }),
    }).catch((error) => console.error("Không thể lưu dữ liệu:", error));
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
    tasks: [],
    setTasks: (tasks) => {
        const value = typeof tasks === "function" ? tasks(get().tasks) : tasks;
        set({ tasks: value });
        save("tasks", value);
    },
    addTask: (task) => {
        const value = [...get().tasks, task];
        set({ tasks: value });
        save("tasks", value);
    },
    toggleTask: (id) => {
        set((state) => ({
            tasks: state.tasks.map((t) =>
                t.id === id ? { ...t, completed: !t.completed } : t
            ),
        }));
        save("tasks", get().tasks);
    },
    deleteTask: (id) => {
        set((state) => ({
            tasks: state.tasks.filter((t) => t.id !== id),
        }));
        save("tasks", get().tasks);
    },

    // ========================================
    // Notes State
    // ========================================
    notes: [],
    setNotes: (notes) => {
        set((state) => ({
            notes: typeof notes === "function" ? notes(state.notes) : notes,
        }));
        save("notes", get().notes);
    },
    addNote: (note) => {
        const value = [note, ...get().notes];
        set({ notes: value });
        save("notes", value);
    },
    updateNote: (id, updates) => {
        set((state) => ({
            notes: state.notes.map((n) =>
                n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
            ),
        }));
        save("notes", get().notes);
    },
    deleteNote: (id) => {
        set((state) => ({
            notes: state.notes.filter((n) => n.id !== id),
        }));
        save("notes", get().notes);
    },

    // ========================================
    // Countdowns State
    // ========================================
    countdowns: [],
    setCountdowns: (countdowns) => {
        const value = typeof countdowns === "function" ? countdowns(get().countdowns) : countdowns;
        set({ countdowns: value });
        save("countdowns", value);
    },
    hydrate: async () => {
        const response = await apiRequest<{ data: Record<string, unknown> }>("/api/data");
        set((state) => ({ ...state, ...response.data }));
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
export const useSetTasks = () => useAppStore((s) => s.setTasks);
export const useAddTask = () => useAppStore((s) => s.addTask);
export const useToggleTask = () => useAppStore((s) => s.toggleTask);
export const useDeleteTask = () => useAppStore((s) => s.deleteTask);

// Notes selectors
export const useNotes = () => useAppStore((s) => s.notes);
export const useSetNotes = () => useAppStore((s) => s.setNotes);
export const useAddNote = () => useAppStore((s) => s.addNote);
export const useUpdateNote = () => useAppStore((s) => s.updateNote);
export const useDeleteNote = () => useAppStore((s) => s.deleteNote);

// Countdown selectors
export const useCountdowns = () => useAppStore((s) => s.countdowns);
export const useSetCountdowns = () => useAppStore((s) => s.setCountdowns);
