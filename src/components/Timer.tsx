import React, { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, X } from "lucide-react";
import { TIMER_SETTINGS } from "../constants";
import { useLocalStorage } from "../hooks/useLocalStorage";
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

    // Store timeLeft for each mode separately (keeping useLocalStorage for timer states as it's timer-specific)
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
        }
    );

    const [countdownTargets, setCountdownTargets] = useLocalStorage<CountdownTargets>(
        "zen_countdown_targets",
        getDefaultCountdownTargets()
    );

    const [isActive, setIsActive] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
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

    // Helper to update time for current mode
    const setTimeLeft = (value: number | ((prev: number) => number)) => {
        setTimerStates((prev) => ({
            ...prev,
            [mode]: typeof value === "function" ? value(prev[mode]) : value,
        }));
    };

    const isTargetMode = mode === "dateCountdown" || mode === "dailyCountdown";

    useEffect(() => {
        if (mode === "clock" || isTargetMode) {
            const interval = setInterval(() => {
                setCurrentTime(new Date());
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [mode, isTargetMode]);

    // Stop timer when switching modes
    useEffect(() => {
        setIsActive(false);
    }, [mode]);

    useEffect(() => {
        let interval: number | null = null;
        if (isTargetMode) {
            return () => {
                if (interval) window.clearInterval(interval);
            };
        }
        if (mode === "stopwatch" && isActive) {
            // Stopwatch counts up
            interval = window.setInterval(() => {
                setTimeLeft((time) => time + 1);
            }, 1000);
        } else if (
            mode !== "clock" &&
            mode !== "stopwatch" &&
            isActive &&
            timeLeft > 0
        ) {
            // Regular timer counts down
            interval = window.setInterval(() => {
                setTimeLeft((time) => time - 1);
            }, 1000);
        } else if (mode !== "stopwatch" && timeLeft === 0) {
            setIsActive(false);
            // Play a bell sound or notification here if implemented
        }
        return () => {
            if (interval) window.clearInterval(interval);
        };
    }, [isActive, timeLeft, mode, isTargetMode]);

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
        <div className="group relative flex items-center justify-center p-8 transition-all duration-500 ease-in-out text-white max-w-md mx-auto hover:bg-black/40 hover:backdrop-blur-md rounded-3xl font-sans">
            {/* Mode Selectors - Absolutely positioned above timer display */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-4 flex flex-nowrap whitespace-nowrap sm:space-x-2 space-x-1 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 bg-white/10">
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

            {/* Target Date/Time input - HIDDEN by default, only appears on hover */}
            {isTargetMode && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-4 flex items-center gap-2 rounded-xl bg-black/50 p-2 text-sm backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 pointer-events-none group-hover:pointer-events-auto">
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
            )}

            {/* Pomodoro Focus duration input - HIDDEN by default, only appears on hover */}
            {mode === "pomodoro" && !isActive && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-4 flex items-center gap-2 rounded-xl bg-black/50 p-2 text-sm backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 pointer-events-none group-hover:pointer-events-auto">
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
            )}

            {/* Timer Display - Centered, always visible, enhances on hover */}
            <div className="font-sf-pro time-number timer-display whitespace-nowrap text-6xl sm:text-7xl font-bold tracking-tight select-none drop-shadow-2xl transition-transform duration-500 group-hover:scale-105">
                {mode === "clock" ? formatClock(currentTime) : formatTimer(targetTimeLeft)}
            </div>

            {/* Controls - Absolutely positioned below timer display */}
            {mode !== "clock" && !isTargetMode && (
                <div
                    className={`absolute left-1/2 -translate-x-1/2 top-full flex items-center space-x-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 ${mode === "pomodoro" && !isActive ? "mt-20" : "mt-4"
                        }`}
                >
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
