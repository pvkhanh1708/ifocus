import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarHeart, Clock3, Plus, Trash2, GripVertical, Clock, X } from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Countdown, CountdownType } from "../types";
import { useNow } from "../hooks/useNow";
import {
    useCountdowns,
    useAddCountdown,
    useDeleteCountdown,
    useReorderCountdowns,
} from "../stores/useAppStore";

const getDateTimeInputValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const getDefaultTarget = () =>
    getDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

// "Days since" counts from a past day: default to today, not a week ahead.
const getDefaultDate = () => getDateTimeInputValue(new Date()).slice(0, 10);
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

/** Remaining time: "6 ngày 23:57:56" once it is a day or more, else "hh:mm:ss". */
const formatRemaining = (totalSeconds: number) => {
    const days = Math.floor(totalSeconds / 86400);
    const rest = formatTime(totalSeconds % 86400);
    return days > 0 ? `${days} ngày ${rest}` : rest;
};

/** "26/11/2026 17:19" (vi-VN's default puts the time before the date). */
const formatTarget = (value: string, withTime: boolean) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const day = date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    if (!withTime) return day;
    const time = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return `${day} ${time}`;
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

const REACHED_LABEL = "Đã đến hạn";

interface CountdownStatus {
    value: string;
    isReached: boolean;
    /** "x năm, y tháng, z ngày" for daysSince, when longer than a month. */
    breakdown: string | null;
}

/** Everything that depends on the current time, computed once per tick. */
const getCountdownStatus = (countdown: Countdown, now: number): CountdownStatus => {
    const type = countdown.type ?? "hoursUntil";

    if (type === "daysSince") {
        const days = Math.max(
            0,
            Math.floor((now - getLocalDate(countdown.targetAt).getTime()) / 86400000)
        );
        return {
            value: `${days} ngày`,
            isReached: false,
            breakdown: getDaysSinceBreakdown(countdown.targetAt, now),
        };
    }

    let remainingSeconds: number;
    if (type === "duration") {
        remainingSeconds =
            (countdown.durationSeconds ?? 0) -
            Math.ceil((now - (countdown.startedAt ?? now)) / 1000);
    } else {
        const target =
            type === "dailyCountdown"
                ? getDailyTarget(countdown.targetAt, now)
                : new Date(countdown.targetAt).getTime();
        remainingSeconds = Math.ceil((target - now) / 1000);
    }

    return remainingSeconds > 0
        ? { value: formatRemaining(remainingSeconds), isReached: false, breakdown: null }
        : { value: REACHED_LABEL, isReached: true, breakdown: null };
};

const getTypeLabel = (type: CountdownType) => {
    if (type === "daysSince") return "Số ngày đã qua";
    if (type === "dailyCountdown") return "Đếm ngược hàng ngày";
    if (type === "duration") return "Hẹn giờ đếm ngược";
    return "Số giờ còn lại";
};

/** Static description line (does not depend on the current time). */
const getSubtitle = (countdown: Countdown) => {
    const type = countdown.type ?? "hoursUntil";
    const detail =
        type === "duration"
            ? `tổng cộng ${formatTime(countdown.durationSeconds ?? 0)}`
            : type === "dailyCountdown"
                ? countdown.targetAt
                : formatTarget(countdown.targetAt, type !== "daysSince");
    return `${getTypeLabel(type)} · ${detail}`;
};

/** Stable drag & drop callbacks shared by every item (see ScreenCountdowns). */
interface DragHandlers {
    start: (index: number) => void;
    over: (index: number) => void;
    leave: (index: number) => void;
    drop: (index: number) => void;
    end: () => void;
    touchStart: (index: number) => void;
    touchMove: (clientX: number, clientY: number) => void;
    touchEnd: () => void;
}

interface CountdownItemProps {
    countdown: Countdown;
    index: number;
    isDragging: boolean;
    isDragOver: boolean;
    dnd: DragHandlers;
    onDelete: (id: string) => void;
}

const CountdownItem = memo(function CountdownItem({
    countdown,
    index,
    isDragging,
    isDragOver,
    dnd,
    onDelete,
}: CountdownItemProps) {
    // Each item ticks on its own; the screen (and its form) no longer re-renders
    // every second. "Days since" only changes once a day: a minute tick is plenty.
    const now = useNow(countdown.type === "daysSince" ? 60_000 : 1000);
    const status = getCountdownStatus(countdown, now);
    const subtitle = useMemo(
        () => getSubtitle(countdown),
        [countdown.type, countdown.targetAt, countdown.durationSeconds]
    );

    return (
        <div
            data-countdown-index={index}
            draggable
            onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", `${index}`);
                dnd.start(index);
            }}
            onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                dnd.over(index);
            }}
            onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                dnd.leave(index);
            }}
            onDrop={(e) => {
                e.preventDefault();
                dnd.drop(index);
            }}
            onDragEnd={dnd.end}
            className={`group relative rounded-xl border p-3 transition-all duration-200 cursor-grab active:cursor-grabbing select-none ${
                isDragging
                    ? "opacity-30 border-dashed border-white/40 scale-[0.98]"
                    : isDragOver
                        ? "border-purple-400 bg-purple-500/20 shadow-lg scale-[1.02]"
                        : status.isReached
                            ? "border-white/5 bg-white/5 opacity-60 hover:border-white/20"
                            : "border-white/5 bg-white/10 hover:border-white/20"
            }`}
        >
            <div className="flex items-start gap-2.5">
                {/* Drag Handle */}
                <div
                    className="mt-1 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/80 transition-colors shrink-0 p-0.5"
                    title="Kéo để sắp xếp lại thứ tự"
                    onTouchStart={() => dnd.touchStart(index)}
                    onTouchMove={(e) => {
                        const touch = e.touches[0];
                        if (touch) dnd.touchMove(touch.clientX, touch.clientY);
                    }}
                    onTouchEnd={dnd.touchEnd}
                >
                    <GripVertical size={16} />
                </div>

                <CalendarHeart size={20} className="mt-0.5 shrink-0 text-white/60" />

                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{countdown.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-white/40">
                        <Clock3 size={11} />
                        {subtitle}
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
                        <span className="text-lg font-semibold text-white/90">{status.value}</span>
                        {status.breakdown && (
                            <span className="text-xs sm:text-sm font-normal text-white/60">
                                ({status.breakdown})
                            </span>
                        )}
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(countdown.id);
                    }}
                    aria-label={`Xóa ${countdown.title}`}
                    className="text-white/20 opacity-0 touch-show transition-all group-hover:opacity-100 hover:text-red-400 p-1"
                    title="Xóa"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
});

const TYPE_OPTIONS: { value: CountdownType; label: string; hint: string }[] = [
    { value: "hoursUntil", label: "Đếm ngược đến ngày", hint: "Còn bao lâu nữa tới ngày giờ đã chọn" },
    { value: "daysSince", label: "Số ngày đã qua", hint: "Đã bao nhiêu ngày kể từ một ngày" },
    { value: "dailyCountdown", label: "Giờ hằng ngày", hint: "Đếm ngược tới một giờ, lặp lại mỗi ngày" },
    { value: "duration", label: "Hẹn giờ", hint: "Đếm ngược một khoảng thời gian" },
];

const defaultTargetFor = (type: CountdownType) =>
    type === "daysSince" ? getDefaultDate() : type === "dailyCountdown" ? "18:00" : getDefaultTarget();

const fieldClass =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/50";

/**
 * "Add countdown" popup: a bottom sheet on phones, a centred dialog from sm up.
 * Rendered in document.body — the side panel is transformed, which would make
 * position: fixed relative to the panel instead of the screen.
 */
function AddCountdownDialog({
    onAdd,
    onClose,
}: {
    onAdd: (countdown: Countdown) => void;
    onClose: () => void;
}) {
    const [title, setTitle] = useState("");
    const [countdownType, setCountdownType] = useState<CountdownType>("hoursUntil");
    const [targetAt, setTargetAt] = useState(getDefaultTarget);
    const [duration, setDuration] = useState(getDefaultDuration);
    const titleRef = useRef<HTMLInputElement>(null);
    const timeRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        titleRef.current?.focus();
        const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const durationSeconds = countdownType === "duration" ? parseDuration(duration) : null;
    const canSubmit =
        title.trim() !== "" &&
        (countdownType === "duration" ? !!durationSeconds && durationSeconds > 0 : !!targetAt);

    const changeType = (type: CountdownType) => {
        setCountdownType(type);
        if (type === "duration") setDuration(getDefaultDuration());
        else setTargetAt(defaultTargetFor(type));
    };

    const openPicker = () => {
        try {
            timeRef.current?.showPicker?.();
        } catch {
            // showPicker is not available everywhere; the native input still works.
        }
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSubmit) return;
        onAdd({
            id: uuid(),
            title: title.trim(),
            targetAt: countdownType === "duration" ? "" : targetAt,
            type: countdownType,
            durationSeconds: durationSeconds ?? undefined,
            startedAt: countdownType === "duration" ? Date.now() : undefined,
        });
        onClose();
    };

    const timeLabel =
        countdownType === "daysSince"
            ? "Từ ngày"
            : countdownType === "dailyCountdown"
                ? "Giờ mỗi ngày"
                : countdownType === "duration"
                    ? "Thời lượng (giờ : phút : giây)"
                    : "Đến ngày giờ";

    return createPortal(
        <div
            className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
            onPointerDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-countdown-title"
                onSubmit={submit}
                className="w-full rounded-t-2xl border border-white/10 bg-neutral-900/95 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:max-w-md sm:rounded-2xl sm:pb-5"
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 id="add-countdown-title" className="flex items-center gap-2 text-lg font-semibold">
                        <CalendarHeart size={20} className="text-white/70" /> Thêm đếm ngược
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Đóng"
                        className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-4">
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-white/50">Tên</span>
                        <input
                            ref={titleRef}
                            type="text"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Bạn đang chờ đợi điều gì?"
                            maxLength={255}
                            className={fieldClass}
                        />
                    </label>

                    <div>
                        <span className="mb-1.5 block text-xs font-medium text-white/50">Kiểu đếm</span>
                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kiểu đếm">
                            {TYPE_OPTIONS.map((option) => {
                                const active = countdownType === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        title={option.hint}
                                        onClick={() => changeType(option.value)}
                                        className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                            active
                                                ? "border-white bg-white font-medium text-black"
                                                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-1.5 text-xs text-white/40">
                            {TYPE_OPTIONS.find((option) => option.value === countdownType)?.hint}
                        </p>
                    </div>

                    <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-white/50">{timeLabel}</span>
                        <input
                            ref={timeRef}
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
                            className={`${fieldClass} cursor-pointer [color-scheme:dark]`}
                        />
                    </label>

                    {countdownType === "duration" && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="mr-1 flex items-center gap-1 text-xs text-white/40">
                                <Clock size={12} /> Chọn nhanh:
                            </span>
                            {DURATION_PRESETS.map((preset) => (
                                <button
                                    key={preset.value}
                                    type="button"
                                    onClick={() => setDuration(preset.value)}
                                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                                        duration === preset.value
                                            ? "bg-white font-semibold text-black"
                                            : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                                    }`}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        Hủy
                    </button>
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Thêm
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
}

export default function ScreenCountdowns() {
    const countdowns = useCountdowns();
    const saveNewCountdown = useAddCountdown();
    const deleteCountdown = useDeleteCountdown();
    const handleReorder = useReorderCountdowns();
    const [isAdding, setIsAdding] = useState(false);
    const closeAdd = useCallback(() => setIsAdding(false), []);

    // Drag and drop: state drives the visuals, the ref lets the handlers below
    // stay stable so idle items never re-render while another one is dragged.
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const drag = useRef<{ from: number | null; over: number | null }>({ from: null, over: null });

    const dnd = useMemo<DragHandlers>(() => {
        const setFrom = (index: number | null) => {
            drag.current.from = index;
            setDraggedIndex(index);
        };
        const setOver = (index: number | null) => {
            if (drag.current.over === index) return;
            drag.current.over = index;
            setDragOverIndex(index);
        };
        const reset = () => {
            setFrom(null);
            setOver(null);
        };
        const finish = (to: number | null) => {
            const { from } = drag.current;
            if (from !== null && to !== null && from !== to) handleReorder(from, to);
            reset();
        };

        return {
            start: setFrom,
            over: setOver,
            leave: (index) => drag.current.over === index && setOver(null),
            drop: (index) => finish(index),
            end: reset,
            touchStart: (index) => {
                setFrom(index);
                setOver(index);
            },
            touchMove: (clientX, clientY) => {
                const item = document
                    .elementFromPoint(clientX, clientY)
                    ?.closest("[data-countdown-index]");
                const index = Number(item?.getAttribute("data-countdown-index"));
                if (item && !Number.isNaN(index)) setOver(index);
            },
            touchEnd: () => finish(drag.current.over),
        };
    }, [handleReorder]);

    return (
        <div className="flex h-full flex-col text-white">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <CalendarHeart size={20} /> Countdowns
                </h3>
                <button
                    onClick={() => setIsAdding(true)}
                    aria-label="Thêm đếm ngược"
                    title="Thêm đếm ngược"
                    className="rounded-lg bg-white p-1.5 text-black transition-colors hover:bg-white/90"
                >
                    <Plus size={18} />
                </button>
            </div>

            {isAdding && <AddCountdownDialog onAdd={saveNewCountdown} onClose={closeAdd} />}

            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {countdowns.length === 0 && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="w-full rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/40 transition-colors hover:border-white/30 hover:text-white/70"
                    >
                        Chưa có mốc nào. Bấm + để thêm ngày đặc biệt.
                    </button>
                )}

                {countdowns.map((countdown, index) => (
                    <CountdownItem
                        key={countdown.id}
                        countdown={countdown}
                        index={index}
                        isDragging={draggedIndex === index}
                        isDragOver={dragOverIndex === index && draggedIndex !== index}
                        dnd={dnd}
                        onDelete={deleteCountdown}
                    />
                ))}
            </div>
        </div>
    );
}
