import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import loadable from "@loadable/component";
import {
    X,
    Music,
    CheckSquare,
    Edit3,
    Image as ImageIcon,
    Maximize2,
    Minimize2,
    Sparkles,
    PictureInPicture2,
    CalendarHeart,
    LogOut,
} from "lucide-react";
import {
    useShowVisualizer,
    useSetShowVisualizer,
    useVisualizerMode,
    useShowTimer,
    useSetShowTimer,
} from "./stores/useAppStore";
import { LoadingFallback } from "./utils/loader";
import { useAuth } from "./hooks/useAuth";
import AuthScreen from "./components/AuthScreen";
import { useAppStore } from "./stores/useAppStore";
import { useSyncStatus } from "./stores/syncStatus";
import { ApiError, withRetry } from "./utils/api";
import { useLocalStorage } from "./hooks/useLocalStorage";
import ViewportDebug from "./components/ViewportDebug";

// screens
const EffectsScreen = loadable(() => import("./components/ScreenEffects"), {
    fallback: LoadingFallback,
});
const AudioScreen = loadable(() => import("./components/ScreenAudio"), {
    fallback: LoadingFallback,
});
const TasksScreen = loadable(() => import("./components/ScreenTasks"), {
    fallback: LoadingFallback,
});
const NotesScreen = loadable(() => import("./components/ScreenNotes"), {
    fallback: LoadingFallback,
});
const CountdownsScreen = loadable(
    () => import("./components/ScreenCountdowns"),
    { fallback: LoadingFallback }
);
const SceneScreen = loadable(() => import("./components/ScreenScene"), {
    fallback: LoadingFallback,
});

// components
const Background = loadable(() => import("./components/Background"), {
    fallback: LoadingFallback,
});
const PiPContent = loadable(() => import("./components/PiPContent"), {
    fallback: LoadingFallback,
});
const Timer = loadable(() => import("./components/Timer"), {
    fallback: LoadingFallback,
});
const Visualizer = loadable(() => import("./components/Visualizer"), {
    fallback: LoadingFallback,
});

const Panels = [
    {
        label: "Scenes",
        icon: <ImageIcon size={18} />,
        comp: SceneScreen,
    },
    {
        label: "Sounds",
        icon: <Music size={18} />,
        comp: AudioScreen,
    },
    {
        label: "Effects",
        icon: <Sparkles size={18} />,
        comp: EffectsScreen,
    },
    { divider: true },
    {
        label: "Tasks",
        icon: <CheckSquare size={18} />,
        comp: TasksScreen,
    },
    {
        label: "Notes",
        icon: <Edit3 size={18} />,
        comp: NotesScreen,
    },
    {
        label: "Countdowns",
        icon: <CalendarHeart size={18} />,
        comp: CountdownsScreen,
    },
];

// Extend Window interface for Document Picture-in-Picture API
declare global {
    interface Window {
        documentPictureInPicture?: {
            requestWindow: (options?: {
                width?: number;
                height?: number;
            }) => Promise<Window>;
            window: Window | null;
        };
    }
}

const PANEL_DEFAULT_WIDTH = 384;
const PANEL_MIN_WIDTH = 320;

const clampPanelWidth = (width: number) =>
    Math.round(
        Math.min(Math.max(width, PANEL_MIN_WIDTH), Math.max(PANEL_MIN_WIDTH, window.innerWidth * 0.9))
    );

/**
 * Drag handle on the side panel's left edge (desktop only). While dragging the
 * width is written straight to a CSS variable — no React re-render per mouse
 * move — and committed (and saved) on release. Double-click resets it; arrow
 * keys resize when focused.
 */
function PanelResizeHandle({
    layoutRef,
    width,
    onResize,
}: {
    /** Element holding the --panel-width CSS variable. */
    layoutRef: React.RefObject<HTMLDivElement | null>;
    width: number;
    onResize: (width: number) => void;
}) {
    const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        const layout = layoutRef.current;
        if (!layout || event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);

        let current = width;
        const previousCursor = document.body.style.cursor;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMove = (e: PointerEvent) => {
            current = clampPanelWidth(window.innerWidth - e.clientX);
            layout.style.setProperty("--panel-width", `${current}px`);
        };
        const onUp = () => {
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = "";
            onResize(current);
        };

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để đổi độ rộng bảng"
            aria-valuenow={width}
            aria-valuemin={PANEL_MIN_WIDTH}
            tabIndex={0}
            title="Kéo để đổi độ rộng · Nhấp đúp để về mặc định"
            onPointerDown={startDrag}
            onDoubleClick={() => onResize(PANEL_DEFAULT_WIDTH)}
            onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    onResize(clampPanelWidth(width + (e.key === "ArrowLeft" ? 32 : -32)));
                }
            }}
            className="group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none sm:block focus:outline-none"
        >
            <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-white/40 group-focus-visible:bg-white/60 group-active:bg-white/70" />
            <div className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </div>
    );
}

/** Shown when a change could not be saved even after retrying. */
function SyncErrorBanner() {
    const error = useSyncStatus((state) => state.error);
    if (!error) return null;
    return (
        <div
            role="alert"
            className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-full border border-red-300/30 bg-red-950/80 px-4 py-2 text-sm text-red-100 shadow-lg backdrop-blur"
        >
            Chưa lưu được thay đổi: {error}
        </div>
    );
}

function LoadErrorScreen({
    message,
    onRetry,
    onLogout,
}: {
    message: string;
    onRetry: () => void;
    onLogout: () => void;
}) {
    return (
        <main className="flex min-h-[var(--app-height,100dvh)] flex-col items-center bg-neutral-950 px-4 pt-[max(1rem,var(--safe-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white">
            <div className="my-auto w-full max-w-sm rounded-2xl border border-white/10 bg-white/10 p-6 text-center shadow-2xl">
                <h1 className="text-lg font-semibold">Không tải được dữ liệu</h1>
                <p className="mt-2 text-sm text-white/60">{message}</p>
                <button
                    onClick={onRetry}
                    className="mt-5 w-full rounded-lg bg-white px-4 py-2.5 font-medium text-black hover:bg-white/90"
                >
                    Thử lại
                </button>
                <button onClick={onLogout} className="mt-3 w-full text-sm text-white/60 hover:text-white">
                    Đăng xuất
                </button>
            </div>
        </main>
    );
}

function App() {
    const auth = useAuth();
    const hydrate = useAppStore((state) => state.hydrate);
    const [isHydrated, setIsHydrated] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Never show the app with empty data when loading failed: the user would
    // think their tasks/notes were gone, and edits would not be saved.
    const load = useCallback(() => {
        setLoadError(null);
        setIsHydrated(false);
        withRetry(() => hydrate(), 3)
            .then(() => setIsHydrated(true))
            .catch((error) => {
                // 401: useAuth already switched to the login screen.
                if (error instanceof ApiError && error.status === 401) return;
                setLoadError(error instanceof Error ? error.message : "Lỗi không xác định.");
            });
    }, [hydrate]);

    useEffect(() => {
        if (!auth.session) {
            setIsHydrated(false);
            setLoadError(null);
            return;
        }
        load();
    }, [auth.session, load]);

    if (!auth.session) {
        return <AuthScreen {...auth} />;
    }

    if (loadError) {
        return <LoadErrorScreen message={loadError} onRetry={load} onLogout={auth.logout} />;
    }

    if (!isHydrated) {
        return LoadingFallback;
    }

    return (
        <>
            <AppContent username={auth.session.user.username} onLogout={auth.logout} />
            <SyncErrorBanner />
        </>
    );
}

function AppContent({
    username,
    onLogout,
}: {
    username: string;
    onLogout: () => Promise<void>;
}) {
    // Get state from Zustand store
    const showVisualizer = useShowVisualizer();
    const setShowVisualizer = useSetShowVisualizer();
    const visualizerMode = useVisualizerMode();
    const showTimer = useShowTimer();
    const setShowTimer = useSetShowTimer();

    // Local UI state (not persisted)
    const [activePanel, setActivePanel] = useState<string>("");
    const lastActivePanelRef = useRef<string>(Panels[0]?.label);

    const [visitedPanels, setVisitedPanels] = useState<Set<string>>(new Set());
    // Side panel width on desktop, resizable by dragging its left edge (saved per account).
    const [panelWidth, setPanelWidth] = useLocalStorage<number>("panelWidth", PANEL_DEFAULT_WIDTH);
    const layoutRef = useRef<HTMLDivElement>(null);

    // Hidden screen diagnostics: tap the logo 5 times within 3 seconds. Counted
    // on pointerup: iOS may swallow click events for fast repeated taps.
    const [showViewportDebug, setShowViewportDebug] = useState(false);
    const logoTapsRef = useRef<number[]>([]);
    const handleLogoTap = () => {
        const now = performance.now();
        logoTapsRef.current = [...logoTapsRef.current.filter((t) => now - t < 3000), now];
        if (logoTapsRef.current.length >= 5) {
            logoTapsRef.current = [];
            setShowViewportDebug(true);
        }
    };
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPiPWebsite, setIsPiPWebsite] = useState(false);
    const pipWindowRef = useRef<Window | null>(null);

    // Lazy load panels
    useEffect(() => {
        if (!!activePanel) {
            lastActivePanelRef.current = activePanel;

            if (!visitedPanels.has(activePanel))
                setVisitedPanels((prev) => new Set([...prev, activePanel]));
        }
    }, [activePanel, visitedPanels]);

    // iPhone has no Fullscreen API, and an installed app is already full screen:
    // only offer the button where it actually does something.
    const canFullscreen =
        typeof document !== "undefined" &&
        !!document.fullscreenEnabled &&
        !window.matchMedia("(display-mode: standalone)").matches &&
        // Phones (touch, narrow): the browser UI makes it pointless.
        !window.matchMedia("(pointer: coarse) and (max-width: 767px)").matches;

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                setIsFullscreen(false);
            }
        }
    };

    const togglePiP = async () => {
        try {
            console.log("Toggle PiP clicked");

            // Check for Document Picture-in-Picture API support
            if (!window.documentPictureInPicture) {
                alert(
                    "Document Picture-in-Picture is not supported in your browser. Please use Chrome 116+ or Edge 116+."
                );
                return;
            }

            // If PiP window is already open, close it
            if (pipWindowRef.current && !pipWindowRef.current.closed) {
                pipWindowRef.current.close();
                pipWindowRef.current = null;
                setIsPiPWebsite(false);
                return;
            }

            // Open Document PiP window
            const pipWindow = await window.documentPictureInPicture.requestWindow({
                width: 800,
                height: 450,
            });

            pipWindowRef.current = pipWindow;

            // Copy all stylesheets from the main document to PiP window
            const styleSheets = Array.from(document.styleSheets);
            styleSheets.forEach((styleSheet) => {
                try {
                    const cssRules = Array.from(styleSheet.cssRules)
                        .map((rule) => rule.cssText)
                        .join("\n");
                    const style = pipWindow.document.createElement("style");
                    style.textContent = cssRules;
                    pipWindow.document.head.appendChild(style);
                } catch (e) {
                    // For external stylesheets, create a link element
                    const link = pipWindow.document.createElement("link");
                    link.rel = "stylesheet";
                    link.href = (styleSheet as CSSStyleSheet).href || "";
                    if (link.href) {
                        pipWindow.document.head.appendChild(link);
                    }
                }
            });

            // Set body styles
            pipWindow.document.body.style.margin = "0";
            pipWindow.document.body.style.padding = "0";
            pipWindow.document.body.style.overflow = "hidden";

            // Listen for window close
            pipWindow.addEventListener("pagehide", () => {
                pipWindowRef.current = null;
                setIsPiPWebsite(false);
            });

            // Set state to trigger React Portal rendering
            setIsPiPWebsite(true);
        } catch (error) {
            console.error("PiP error:", error);
            alert(
                "Failed to activate Picture-in-Picture mode. Error: " +
                (error as Error).message
            );
            setIsPiPWebsite(false);
        }
    };

    const openGithub = () => {
        window.open("/", "_blank");
    };

    // Cleanup PiP window on unmount
    useEffect(() => {
        return () => {
            if (pipWindowRef.current && !pipWindowRef.current.closed) {
                pipWindowRef.current.close();
            }
        };
    }, []);

    return (
        <div
            ref={layoutRef}
            className="pip-capture-root relative w-full h-[var(--app-height,100dvh)] overflow-hidden font-sans bg-[var(--scene-edge,#09101e)]"
            // Shared by the side panel (its width) and the main layer (its right
            // padding), so the timer stays centred in the space left visible.
            style={{ ["--panel-width" as string]: `${clampPanelWidth(panelWidth)}px` }}
        >
            {/* Dynamic Background - now uses Zustand internally */}
            <Background />

            {/* Visualizer - handles its own positioning based on visualizerMode */}
            {showVisualizer && (
                <Visualizer
                    onClose={() => setShowVisualizer(false)}
                    stop={isPiPWebsite}
                />
            )}

            {/* Main Content Layer (shifts left of the open side panel on desktop) */}
            <div
                className={`relative z-10 w-full h-full flex flex-col transition-[padding] duration-300 ease-out ${activePanel ? "sm:pr-[min(var(--panel-width),90vw)]" : ""
                    }`}
            >
                {/* Header / Top Bar */}
                <div className="flex justify-between items-center p-3 pt-[max(0.75rem,calc(var(--safe-top)+0.25rem))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pointer-events-auto">
                    <div
                        className="flex items-center gap-3 cursor-pointer hover:bg-white/10 rounded-lg p-2 transition-colors"
                        onPointerUp={handleLogoTap}
                    >
                        <img
                            src="/icons/icon-192.png"
                            alt=""
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-lg shadow-md shadow-black/30"
                        />
                        <span className="text-white font-semibold tracking-wide text-lg shadow-black drop-shadow-md">
                            iFocus
                        </span>
                        <span className="hidden text-xs text-white/50 sm:inline">{username}</span>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2">
                        {/* Icon only on phones, icon + label from sm up */}
                        <button
                            onClick={() => void onLogout()}
                            className="flex items-center gap-1.5 whitespace-nowrap rounded-full p-3 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                            title={`Đăng xuất (${username})`}
                            aria-label="Đăng xuất"
                        >
                            <LogOut size={18} className="sm:hidden" />
                            <span className="hidden sm:inline">Đăng xuất</span>
                        </button>
                        {/* PiP button - desktop only */}
                        <button
                            onClick={togglePiP}
                            className={`p-3 transition-colors rounded-full hover:bg-white/10 hidden sm:block ${isPiPWebsite ? "text-white" : "text-white/70 hover:text-white"
                                }`}
                            title="Picture-in-Picture"
                        >
                            <PictureInPicture2 size={20} />
                        </button>
                        {/* Fullscreen button (hidden where unsupported / pointless) */}
                        {canFullscreen && (
                            <button
                                onClick={toggleFullscreen}
                                className="p-3 text-white/70 hover:text-white transition-colors rounded-full hover:bg-white/10"
                                title="Fullscreen"
                            >
                                {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                            </button>
                        )}

                    </div>
                </div>

                {/* Center Timer Area - only show Timer when visualizer is not in center mode */}
                <div className="flex-1 flex items-center justify-center p-4 pointer-events-auto">
                    {showTimer && !(showVisualizer && visualizerMode === "center") ? (
                        <div className={`transition-all duration-500`}>
                            <Timer onClose={() => setShowTimer(false)} />
                        </div>
                    ) : null}
                </div>

                {/* Bottom Dock / Navigation */}
                <div className="flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] pointer-events-auto">
                    {/* We apply the same transition logic here to keep it centered relative to the timer */}
                    <div className={`transition-all duration-500`}>
                        <div className="flex gap-0 sm:gap-2 p-1.5 sm:p-2 bg-black/55 sm:bg-black/40 backdrop-blur sm:backdrop-blur-none opacity-100 sm:opacity-50 hover:opacity-100 hover:backdrop-blur transition-all rounded-2xl border border-white/10 shadow-2xl">
                            {Panels.filter((item) => !item.divider).map((item) => (
                                <DockButton
                                    key={"dock-" + item.label}
                                    icon={item.icon}
                                    label={item.label}
                                    isActive={activePanel === item.label}
                                    onClick={() =>
                                        setActivePanel(activePanel === item.label ? "" : item.label)
                                    }
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Side Panel Drawer - Keep all panels mounted, just hide them */}
            <div
                className={`absolute top-0 right-0 h-full w-full sm:w-[var(--panel-width)] sm:max-w-[90vw] glass-panel border-l border-white/10 transition-transform duration-300 ease-out ${!!activePanel ? "translate-x-0" : "translate-x-full"
                    }`}
                style={{
                    zIndex: !!activePanel ? 50 : -1,
                }}
            >
                <PanelResizeHandle
                    layoutRef={layoutRef}
                    width={panelWidth}
                    onResize={setPanelWidth}
                />
                <div className="h-full flex flex-col p-4 sm:p-6 pt-[max(1rem,var(--safe-top))] sm:pt-[max(1.5rem,var(--safe-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]">
                    {/* Header with navigation tabs */}
                    <div className="flex items-center justify-between mb-4">
                        {/* Tab Navigation */}
                        <div className="flex gap-1">
                            {Panels.map((item) =>
                                item.divider ? (
                                    <div
                                        key={"divider-" + item.label}
                                        className="w-px h-10 bg-white/10 mx-1 self-center"
                                    />
                                ) : (
                                    <button
                                        key={"tab-" + item.label}
                                        onClick={() => setActivePanel(item.label)}
                                        className={`p-2 rounded-lg transition-all ${activePanel === item.label
                                                ? "bg-white/20 text-white"
                                                : "text-white/50 hover:text-white hover:bg-white/10"
                                            }`}
                                        title={item.label}
                                    >
                                        {item.icon}
                                    </button>
                                )
                            )}
                        </div>
                        {/* Close button */}
                        <button
                            onClick={() => setActivePanel("")}
                            className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex justify-between items-center mb-2">
                        <span className="text-white/50 text-xs font-bold uppercase tracking-widest">
                            {activePanel}
                        </span>
                    </div>

                    {/* All panels stay mounted, just hidden - now use Zustand internally */}
                    <div className="flex-1 overflow-hidden relative">
                        {Panels.filter((item) => item.comp).map((item) => (
                            <div
                                key={"panel-" + item.label}
                                className={`absolute inset-0 ${activePanel === item.label ? "block" : "hidden"
                                    }`}
                            >
                                {visitedPanels.has(item.label) && <item.comp />}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {showViewportDebug && <ViewportDebug onClose={() => setShowViewportDebug(false)} />}

            {/* Render PiP content using Portal when PiP is active */}
            {isPiPWebsite &&
                pipWindowRef.current &&
                createPortal(<PiPContent />, pipWindowRef.current.document.body)}
        </div>
    );
}

// Helper Subcomponent
const DockButton = ({
    icon,
    label,
    isActive,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onClick: () => void;
}) => (
    <button
        onClick={onClick}
        aria-label={label}
        title={label}
        className={`group relative flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl transition-all duration-300 ${isActive
                ? "bg-white text-black shadow-lg"
                : "text-white/70 hover:bg-white/10 hover:text-white hover:translate-y-[-2px]"
            }`}
    >
        {icon}
        <span className="absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-white bg-black/60 px-2 py-1 rounded backdrop-blur-sm whitespace-nowrap pointer-events-none">
            {label}
        </span>
    </button>
);

export default App;
