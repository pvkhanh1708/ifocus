import React, { useEffect, useRef, useState } from "react";
import { CalendarHeart, Clock3, Plus, Trash2, GripVertical, Clock } from "lucide-react";
import type { Countdown, CountdownType } from "../types";
import { useCountdowns, useSetCountdowns } from "../stores/useAppStore";

const getDateTimeInputValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const getDefaultTarget = () =>
    getDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

const getDefaultDate = () => getDefaultTarget().slice(0, 10);
const getDefaultDuration = () => "00:30:00";

const DURATION_PRESETS = [
    { label: "15p", value: "00:15:00" },
    { label: "25p", value: "00:25:00" },
    { label: "30p", value: "00:30:00" },
    { label: "45p", value: "00:45:00" },
    { label: "1h", value: "01:00:00" },
    { label: "2h", value: "02:00:00" },
];

const getLocalDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
};

const getDailyTarget = (value: string, now: number) => {
    const [hours, minutes] = value.split(":").map(Number);
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() < now) target.setDate(target.getDate() + 1);
    return target.getTime();
};

const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
        .map((value) => value.toString().padStart(2, "0"))
        .join(":");
};

const parseDuration = (value: string) => {
    if (!value) return null;
    const parts = value.split(":");
    if (parts.length === 2) {
        const [hours, minutes] = parts.map(Number);
        if (isNaN(hours) || isNaN(minutes) || minutes > 59) return null;
        return hours * 3600 + minutes * 60;
    }
    if (parts.length === 3) {
        const [hours, minutes, seconds] = parts.map(Number);
        if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || minutes > 59 || seconds > 59) return null;
        return hours * 3600 + minutes * 60 + seconds;
    }
    return null;
};

const getDaysSinceBreakdown = (targetAt: string, now: number) => {
    if (!targetAt) return null;
    const cleanDate = targetAt.split("T")[0];
    const parts = cleanDate.split("-").map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return null;
    const [y1, m1, d1] = parts;

    const start = new Date(y1, m1 - 1, d1);
    const end = new Date(now);

    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    if (e.getTime() < s.getTime()) return null;

    let years = e.getFullYear() - s.getFullYear();
    let months = e.getMonth() - s.getMonth();
    let days = e.getDate() - s.getDate();

    if (days < 0) {
        const prevMonthDate = new Date(e.getFullYear(), e.getMonth(), 0);
        const prevMonthLastDay = prevMonthDate.getDate();
        const adjustedStartDay = Math.min(s.getDate(), prevMonthLastDay);
        days = e.getDate() + (prevMonthLastDay - adjustedStartDay);
        months--;
    }

    if (months < 0) {
        years--;
        months += 12;
    }

    if (years === 0 && months === 0) {
        return null;
    }

    const resultParts: string[] = [];
    if (years > 0) resultParts.push(`${years} năm`);
    if (months > 0) resultParts.push(`${months} tháng`);
    if (days > 0) resultParts.push(`${days} ngày`);

    if (resultParts.length === 0) return null;
    return resultParts.join(", ");
};

const formatCountdown = (countdown: Countdown, now: number) => {
    const type = countdown.type ?? "hoursUntil";

    if (type === "daysSince") {
        const days = Math.max(
            0,
            Math.floor((now - getLocalDate(countdown.targetAt).getTime()) / 86400000)
        );
        return `${days} ngày`;
    }

    if (type === "duration") {
        const remaining = Math.max(
            0,
            (countdown.durationSeconds ?? 0) -
            Math.ceil((now - (countdown.startedAt ?? now)) / 1000)
        );
        return remaining > 0 ? formatTime(remaining) : "Đã đến hạn";
    }

    const target =
        type === "dailyCountdown"
            ? getDailyTarget(countdown.targetAt, now)
            : new Date(countdown.targetAt).getTime();
    const remaining = target - now;
    if (remaining <= 0) return "Đã đến hạn";

    const totalSeconds = Math.ceil(remaining / 1000);
    return formatTime(totalSeconds);
};

const getTypeLabel = (type: CountdownType) => {
    if (type === "daysSince") return "Số ngày đã qua";
    if (type === "dailyCountdown") return "Đếm ngược hàng ngày";
    if (type === "duration") return "Hẹn giờ đếm ngược";
    return "Số giờ còn lại";
};

export default function ScreenCountdowns() {
    const countdowns = useCountdowns();
    const setCountdowns = useSetCountdowns();
    const [title, setTitle] = useState("");
    const [targetAt, setTargetAt] = useState(getDefaultTarget);
    const [duration, setDuration] = useState(getDefaultDuration);
    const [countdownType, setCountdownType] =
        useState<CountdownType>("hoursUntil");
    const [now, setNow] = useState(Date.now());
    const inputRef = useRef<HTMLInputElement>(null);

    // Drag and drop state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, []);

    const openPicker = () => {
        try {
            inputRef.current?.showPicker?.();
        } catch {}
    };

    const addCountdown = (event: React.FormEvent) => {
        event.preventDefault();
        if (!title.trim() || (countdownType !== "duration" && !targetAt)) return;

        const durationSeconds =
            countdownType === "duration" ? parseDuration(duration) : null;
        if (countdownType === "duration" && (!durationSeconds || durationSeconds <= 0)) {
            return;
        }

        const countdown: Countdown = {
            id: Date.now().toString(),
            title: title.trim(),
            targetAt: countdownType === "duration" ? "" : targetAt,
            type: countdownType,
            durationSeconds: durationSeconds ?? undefined,
            startedAt: countdownType === "duration" ? Date.now() : undefined,
        };

        setCountdowns((previous) => [countdown, ...previous]);
        setTitle("");
        setDuration(getDefaultDuration());
        setTargetAt(
            countdownType === "daysSince"
                ? getDefaultDate()
                : countdownType === "dailyCountdown"
                    ? "18:00"
                    : getDefaultTarget()
        );
    };

    const deleteCountdown = (id: string) => {
        setCountdowns((previous) => previous.filter((item) => item.id !== id));
    };

    const handleReorder = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) return;
        setCountdowns((previous) => {
            const updated = [...previous];
            const [moved] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, moved);
            return updated;
        });
    };

    return (
        <div className="flex h-full flex-col text-white">
            <form onSubmit={addCountdown} className="mb-5 space-y-2">
                <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Bạn đang chờ đợi điều gì?"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none transition-colors focus:border-white/50"
                />
                <select
                    value={countdownType}
                    onChange={(event) => {
                        const type = event.target.value as CountdownType;
                        setCountdownType(type);
                        if (type === "duration") {
                            setDuration(getDefaultDuration());
                        } else {
                            setTargetAt(
                                type === "daysSince"
                                    ? getDefaultDate()
                                    : type === "dailyCountdown"
                                        ? "18:00"
                                        : getDefaultTarget()
                            );
                        }
                    }}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/50"
                >
                    <option value="daysSince" className="bg-slate-800">
                        Số ngày đã trôi qua kể từ một ngày
                    </option>
                    <option value="dailyCountdown" className="bg-slate-800">
                        Đếm ngược đến giờ hàng ngày
                    </option>
                    <option value="duration" className="bg-slate-800">
                        Hẹn giờ đếm ngược (hh:mm:ss)
                    </option>
                    <option value="hoursUntil" className="bg-slate-800">
                        Số giờ còn lại cho đến một ngày
                    </option>
                </select>

                <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                        <input
                            ref={inputRef}
                            type={
                                countdownType === "daysSince"
                                    ? "date"
                                    : countdownType === "dailyCountdown" || countdownType === "duration"
                                    ? "time"
                                    : "datetime-local"
                            }
                            step={countdownType === "duration" ? "1" : undefined}
                            value={countdownType === "duration" ? duration : targetAt}
                            onChange={(event) =>
                                countdownType === "duration"
                                    ? setDuration(event.target.value)
                                    : setTargetAt(event.target.value)
                            }
                            onClick={openPicker}
                            onFocus={openPicker}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/50 [color-scheme:dark] cursor-pointer"
                        />
                    </div>
                    <button
                        type="submit"
                        aria-label="Thêm đếm ngược"
                        className="rounded-lg bg-white p-2 text-black transition-colors hover:bg-white/90 shrink-0"
                    >
                        <Plus size={18} />
                    </button>
                </div>

                {countdownType === "duration" && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-xs text-white/40 mr-1 flex items-center gap-1">
                            <Clock size={12} /> Chọn nhanh:
                        </span>
                        {DURATION_PRESETS.map((preset) => (
                            <button
                                key={preset.value}
                                type="button"
                                onClick={() => setDuration(preset.value)}
                                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                                    duration === preset.value
                                        ? "bg-white text-black font-semibold"
                                        : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                                }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                )}
            </form>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {countdowns.length === 0 && (
                    <div className="px-4 py-10 text-center text-sm text-white/30">
                        Thêm một mốc thời gian đặc biệt để bắt đầu đếm.
                    </div>
                )}

                {countdowns.map((countdown, index) => {
                    const isReached =
                        countdown.type !== "daysSince" &&
                        formatCountdown(countdown, now) === "Đã đến hạn";
                    const isDragging = draggedIndex === index;
                    const isDragOver = dragOverIndex === index && draggedIndex !== index;

                    return (
                        <div
                            key={countdown.id}
                            data-countdown-index={index}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", `${index}`);
                                setDraggedIndex(index);
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                if (dragOverIndex !== index) {
                                    setDragOverIndex(index);
                                }
                            }}
                            onDragLeave={(e) => {
                                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                                if (dragOverIndex === index) {
                                    setDragOverIndex(null);
                                }
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (draggedIndex !== null) {
                                    handleReorder(draggedIndex, index);
                                }
                                setDraggedIndex(null);
                                setDragOverIndex(null);
                            }}
                            onDragEnd={() => {
                                setDraggedIndex(null);
                                setDragOverIndex(null);
                            }}
                            className={`group relative rounded-xl border p-3 transition-all duration-200 cursor-grab active:cursor-grabbing select-none ${
                                isDragging
                                    ? "opacity-30 border-dashed border-white/40 scale-[0.98]"
                                    : isDragOver
                                    ? "border-purple-400 bg-purple-500/20 shadow-lg scale-[1.02]"
                                    : isReached
                                    ? "border-white/5 bg-white/5 opacity-60 hover:border-white/20"
                                    : "border-white/5 bg-white/10 hover:border-white/20"
                            }`}
                        >
                            <div className="flex items-start gap-2.5">
                                {/* Drag Handle */}
                                <div
                                    className="mt-1 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/80 transition-colors shrink-0 p-0.5"
                                    title="Kéo để sắp xếp lại thứ tự"
                                    onTouchStart={() => {
                                        setDraggedIndex(index);
                                        setDragOverIndex(index);
                                    }}
                                    onTouchMove={(e) => {
                                        const touch = e.touches[0];
                                        const el = document.elementFromPoint(touch.clientX, touch.clientY);
                                        const itemEl = el?.closest("[data-countdown-index]");
                                        if (itemEl) {
                                            const overIdx = Number(itemEl.getAttribute("data-countdown-index"));
                                            if (!isNaN(overIdx)) {
                                                setDragOverIndex(overIdx);
                                            }
                                        }
                                    }}
                                    onTouchEnd={() => {
                                        if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
                                            handleReorder(draggedIndex, dragOverIndex);
                                        }
                                        setDraggedIndex(null);
                                        setDragOverIndex(null);
                                    }}
                                >
                                    <GripVertical size={16} />
                                </div>

                                <CalendarHeart size={20} className="mt-0.5 shrink-0 text-white/60" />

                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{countdown.title}</p>
                                    <p className="mt-1 flex items-center gap-1 text-xs text-white/40">
                                        <Clock3 size={11} />
                                        {getTypeLabel(countdown.type ?? "hoursUntil")} · {countdown.type === "duration" ? `tổng cộng ${formatTime(countdown.durationSeconds ?? 0)}` : countdown.type === "dailyCountdown" ? countdown.targetAt : new Date(countdown.targetAt).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: countdown.type === "daysSince" ? undefined : "short" })}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
                                        <span className="text-lg font-semibold text-white/90">
                                            {formatCountdown(countdown, now)}
                                        </span>
                                        {countdown.type === "daysSince" && getDaysSinceBreakdown(countdown.targetAt, now) && (
                                            <span className="text-xs sm:text-sm font-normal text-white/60">
                                                ({getDaysSinceBreakdown(countdown.targetAt, now)})
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteCountdown(countdown.id);
                                    }}
                                    aria-label={`Xóa ${countdown.title}`}
                                    className="text-white/20 opacity-0 transition-all group-hover:opacity-100 hover:text-red-400 p-1"
                                    title="Xóa"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
