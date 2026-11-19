import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, X } from "lucide-react";
import { TIMER_SETTINGS } from "../constants";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useNow } from "../hooks/useNow";

/** Long enough that a running timer (one change per second) is not saved every tick. */
const TIMER_SAVE_DELAY_MS = 3000;
import type { TimerMode } from "../types";
import { useTimerMode, useSetTimerMode } from "../stores/useAppStore";

interface TimerProps {
    onTick?: () => void; // Optional callback for ticks
    onClose?: () => void; // Optional callback to hide timer
}

// Type for storing time left for each mode
type TimerStates = Record<TimerMode, number>;

interface CountdownTargets {
    dateTime: string;
    dailyTime: string;
}

const getDateTimeInputValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const getDefaultCountdownTargets = (): CountdownTargets => {
    const defaultTarget = new Date(Date.now() + 60 * 60 * 1000);
    return {
        dateTime: getDateTimeInputValue(defaultTarget),
        dailyTime: defaultTarget.toTimeString().slice(0, 5),
    };
};

export default function Timer({ onClose }: TimerProps) {
    // Get timer mode from Zustand store
    const mode = useTimerMode();
    const setMode = useSetTimerMode();

    // Time left per mode. It changes every second while running, so it is saved
    // only once it settles (pause/reset) or when the page is hidden, instead of
    // one request per second.
    const [timerStates, setTimerStates] = useLocalStorage<TimerStates>(
        "zen_timer_states",
        {
            pomodoro: TIMER_SETTINGS.pomodoro,
            shortBreak: TIMER_SETTINGS.shortBreak,
            longBreak: TIMER_SETTINGS.longBreak,
            clock: TIMER_SETTINGS.clock,
            stopwatch: TIMER_SETTINGS.stopwatch,
            dateCountdown: TIMER_SETTINGS.dateCountdown,
            dailyCountdown: TIMER_SETTINGS.dailyCountdown,
        },
        TIMER_SAVE_DELAY_MS
    );

    const [countdownTargets, setCountdownTargets] = useLocalStorage<CountdownTargets>(
        "zen_countdown_targets",
        getDefaultCountdownTargets()
    );

    const [isActive, setIsActive] = useState(false);

    const isTargetMode = mode === "dateCountdown" || mode === "dailyCountdown";
    // Clock shows hh:mm → one render per minute. Target countdowns need seconds.
    // Other modes don't use wall-clock time (hourly ticker = effectively idle).
    const now = useNow(isTargetMode ? 1000 : mode === "clock" ? 60_000 : 3_600_000);
    const currentTime = new Date(now);
    const [focusDuration, setFocusDuration] = useState(() => {
        const seconds = timerStates.pomodoro;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    });

    // Get current mode's time
    const timeLeft = timerStates[mode];

    // Stop timer when switching modes
    useEffect(() => {
        setIsActive(false);
    }, [mode]);

    // Touch screens: tap the timer to show/hide its controls (no hover there).
    const rootRef = useRef<HTMLDivElement>(null);
    const [touchRevealed, setTouchRevealed] = useState(false);
    const handleTouchReveal = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse") return;
        // Taps on the controls themselves keep them open.
        if ((event.target as HTMLElement).closest("button, input, select, label")) return;
        setTouchRevealed((revealed) => !revealed);
    };
    useEffect(() => {
        if (!touchRevealed) return;
        const hideOnOutsideTap = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setTouchRevealed(false);
        };
        document.addEventListener("pointerdown", hideOnOutsideTap);
        return () => document.removeEventListener("pointerdown", hideOnOutsideTap);
    }, [touchRevealed]);

    // Keep the screen on while a timer runs (Screen Wake Lock, iOS 16.4+ /
    // Android). Re-acquired when the app comes back to the foreground.
    useEffect(() => {
        if (!isActive || !("wakeLock" in navigator)) return;
        let lock: WakeLockSentinel | null = null;
        let cancelled = false;
        const acquire = async () => {
            try {
                const sentinel = await navigator.wakeLock.request("screen");
                if (cancelled) sentinel.release();
                else lock = sentinel;
            } catch {
                // Denied (e.g. low battery mode): the timer still works.
            }
        };
        const onVisible = () => document.visibilityState === "visible" && acquire();
        acquire();
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener("visibilitychange", onVisible);
            lock?.release();
        };
    }, [isActive]);

    // Running pomodoro / break / stopwatch. The value is derived from the start
    // timestamp rather than decremented per tick, so it stays exact even when
    // the browser throttles timers in a background tab.
    useEffect(() => {
        if (!isActive || mode === "clock" || isTargetMode) return;

        const startedAt = Date.now();
        const startValue = timerStates[mode];
        if (mode !== "stopwatch" && startValue <= 0) {
            setIsActive(false);
            return;
        }

        const tick = () => {
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            const next =
                mode === "stopwatch" ? startValue + elapsed : Math.max(0, startValue - elapsed);

            // Returning `prev` when unchanged avoids a re-render.
            setTimerStates((prev) => (prev[mode] === next ? prev : { ...prev, [mode]: next }));

            if (mode !== "stopwatch" && next === 0) {
                setIsActive(false);
                // Play a bell sound or notification here if implemented
            }
        };

        // Check 4×/s so the display flips right on the second; state only
        // changes once per second.
        const interval = window.setInterval(tick, 250);
        return () => window.clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- timerStates is read once at start on purpose
    }, [isActive, mode, isTargetMode]);

    const toggleTimer = () => setIsActive(!isActive);
    const resetTimer = () => {
        setIsActive(false);
        setTimerStates((prev) => ({
            ...prev,
            [mode]: TIMER_SETTINGS[mode],
        }));
        if (mode === "pomodoro") {
            setFocusDuration("00:25:00");
        }
    };

    const formatTimer = (seconds: number) => {
        const h = Math.floor(seconds / (60 * 60));
        const m = Math.floor((seconds % (60 * 60)) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, "0")}:${m
            .toString()
            .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    const getTargetTime = () => {
        if (mode === "dateCountdown") {
            const target = new Date(countdownTargets.dateTime).getTime();
            return Number.isNaN(target) ? 0 : target;
        }

        const [hours, minutes] = countdownTargets.dailyTime.split(":").map(Number);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;

        const target = new Date(currentTime);
        target.setHours(hours, minutes, 0, 0);
        if (target.getTime() < currentTime.getTime()) {
            target.setDate(target.getDate() + 1);
        }
        return target.getTime();
    };

    const targetTimeLeft = isTargetMode
        ? Math.max(0, Math.ceil((getTargetTime() - currentTime.getTime()) / 1000))
        : timeLeft;

    const updateTarget = (key: keyof CountdownTargets, value: string) => {
        setCountdownTargets((prev) => ({ ...prev, [key]: value }));
    };

    const updateFocusDuration = (value: string) => {
        setFocusDuration(value);
        const parts = value.split(":");
        if (parts.length === 2) {
            const [hours, minutes] = parts.map(Number);
            if (isNaN(hours) || isNaN(minutes) || minutes > 59) return;
            setTimerStates((prev) => ({
                ...prev,
                pomodoro: hours * 3600 + minutes * 60,
            }));
            return;
        }
        if (parts.length === 3) {
            const [hours, minutes, seconds] = parts.map(Number);
            if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || minutes > 59 || seconds > 59) return;
            setTimerStates((prev) => ({
                ...prev,
                pomodoro: hours * 3600 + minutes * 60 + seconds,
            }));
            return;
        }
    };

    const formatClock = (date: Date) => {
        // 24-hour format
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    // Update document title
    useEffect(() => {
        if (mode === "clock") {
            document.title = `iFocus`;
        } else {
            document.title = `${formatTimer(targetTimeLeft)} - iFocus`;
        }
    }, [timeLeft, targetTimeLeft, mode]);

    return (
        <div
            ref={rootRef}
            onPointerUp={handleTouchReveal}
            // On touch screens (no hover) the controls are shown by tapping the
            // timer and hidden by tapping elsewhere (see .tap-reveal in style.css).
            className={`tap-reveal ${touchRevealed ? "is-revealed bg-black/40 backdrop-blur-md" : ""} group relative flex items-center justify-center p-8 transition-all duration-500 ease-in-out text-white max-w-md mx-auto hover:bg-black/40 hover:backdrop-blur-md rounded-3xl font-sans`}
        >
            {/* Mode Selectors - Absolutely positioned above timer display with hover bridge */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full pb-3 z-30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-300 -translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                {/* Phones: wraps onto two centred rows inside the screen width
                    instead of overflowing it; one pill row from sm up. */}
                <div className="flex w-[min(calc(100vw-1.5rem),24rem)] flex-wrap justify-center gap-1 whitespace-nowrap rounded-2xl bg-white/10 p-1 shadow-lg backdrop-blur-md sm:w-auto sm:flex-nowrap sm:gap-2 sm:rounded-full">
                    {(
                        [
                            "pomodoro",
                            "shortBreak",
                            "longBreak",
                            "stopwatch",
                            "clock",
                            "dateCountdown",
                            "dailyCountdown",
                        ] as TimerMode[]
                    ).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`px-2 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-semibold transition-all duration-300 ${mode === m
                                    ? "bg-white text-black shadow-lg"
                                    : "text-white/70 hover:text-white hover:bg-white/10"
                                }`}
                        >
                            {m === "pomodoro"
                                ? "Tập trung"
                                : m === "shortBreak"
                                    ? "Nghỉ ngắn"
                                    : m === "longBreak"
                                        ? "Nghỉ dài"
                                        : m === "stopwatch"
                                            ? "Bấm giờ"
                                            : m === "clock"
                                                ? "Đồng hồ"
                                                : m === "dateCountdown"
                                                    ? "Theo ngày"
                                                    : "Hàng ngày"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Target Date/Time input - Seamless hover bridge (pt-3) & focus-within */}
            {isTargetMode && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 z-30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                    <div className="flex items-center gap-2 rounded-xl bg-black/60 p-2 text-sm backdrop-blur-md shadow-xl border border-white/10">
                        <label className="sr-only" htmlFor="countdown-target">
                            {mode === "dateCountdown" ? "Mục tiêu ngày giờ" : "Thời gian mục tiêu hàng ngày"}
                        </label>
                        <input
                            id="countdown-target"
                            type={mode === "dateCountdown" ? "datetime-local" : "time"}
                            value={mode === "dateCountdown" ? countdownTargets.dateTime : countdownTargets.dailyTime}
                            onChange={(event) =>
                                updateTarget(mode === "dateCountdown" ? "dateTime" : "dailyTime", event.target.value)
                            }
                            onClick={(e) => {
                                try {
                                    e.currentTarget.showPicker?.();
                                } catch {}
                            }}
                            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white outline-none focus:border-white/60 [color-scheme:dark] cursor-pointer"
                        />
                    </div>
                </div>
            )}

            {/* Pomodoro Focus duration input - Seamless hover bridge (pt-3) & focus-within */}
            {mode === "pomodoro" && !isActive && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 z-30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                    <div className="flex items-center gap-2 rounded-xl bg-black/60 p-2 text-sm backdrop-blur-md shadow-xl border border-white/10">
                        <label className="sr-only" htmlFor="focus-duration">
                            Thời gian tập trung
                        </label>
                        <input
                            id="focus-duration"
                            type="time"
                            step="1"
                            value={focusDuration}
                            onChange={(event) => updateFocusDuration(event.target.value)}
                            onClick={(e) => {
                                try {
                                    e.currentTarget.showPicker?.();
                                } catch {}
                            }}
                            aria-label="Thời gian tập trung (hh:mm:ss)"
                            className="w-32 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center text-white outline-none focus:border-white/60 [color-scheme:dark] cursor-pointer"
                        />
                    </div>
                </div>
            )}

            {/* Timer Display - Centered, always visible, enhances on hover */}
            <div className="font-sf-pro time-number timer-display whitespace-nowrap text-6xl sm:text-7xl font-bold tracking-tight select-none drop-shadow-2xl transition-transform duration-500 group-hover:scale-105">
                {mode === "clock" ? formatClock(currentTime) : formatTimer(targetTimeLeft)}
            </div>

            {/* Controls - Absolutely positioned below timer display with hover bridge */}
            {mode !== "clock" && !isTargetMode && (
                <div
                    className={`absolute left-1/2 -translate-x-1/2 top-full z-30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto ${mode === "pomodoro" && !isActive ? "pt-20" : "pt-4"
                        }`}
                >
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={toggleTimer}
                            className="bg-white text-black sm:p-6 p-4 rounded-full hover:scale-105 transition-transform shadow-lg active:scale-95"
                        >
                            {isActive ? (
                                <Pause size={32} fill="black" />
                            ) : (
                                <Play size={32} fill="black" className="ml-1" />
                            )}
                        </button>

                        {(mode === "stopwatch"
                            ? timeLeft > 0
                            : timeLeft < TIMER_SETTINGS[mode]) && (
                                <button
                                    onClick={resetTimer}
                                    className="bg-white/10 text-white sm:p-4 p-3 rounded-full hover:bg-white/20 transition-colors"
                                >
                                    <RotateCcw size={24} />
                                </button>
                            )}
                    </div>
                </div>
            )}

            {/* Close button - Top right corner */}
            {onClose && (
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 p-2 rounded-full bg-white/10 text-white/50 hover:bg-white/20 hover:text-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Ẩn đồng hồ"
                >
                    <X size={16} />
                </button>
            )}
        </div>
    );
}
