import { apiRequest, withRetry } from "../utils/api";
import { onPageHide } from "../utils/onPageHide";
import { reportSaveError, reportSaveSuccess } from "./syncStatus";

/**
 * UI settings (scene, filters, volumes, visualizer options...) stored as
 * key => JSON value in /api/data.
 *
 * - Read once: the cache is filled by the single /api/state request at load,
 *   so components no longer each fetch /api/data.
 * - Saved debounced per key: dragging a slider sends one request when the user
 *   lets go, not one per pixel. Pending saves are flushed when the page hides.
 */

let cache: Record<string, unknown> = {};

export const setSettingsCache = (data: Record<string, unknown>) => {
    cache = { ...data };
};

export const getSetting = <T>(key: string, fallback: T): T =>
    key in cache ? (cache[key] as T) : fallback;

export const DEFAULT_SAVE_DELAY_MS = 500;

interface Pending {
    value: unknown;
    timer: number;
}

const pending = new Map<string, Pending>();

const send = (key: string, value: unknown, keepalive = false) =>
    withRetry(() =>
        apiRequest("/api/data", {
            method: "PATCH",
            keepalive,
            body: JSON.stringify({ key, value }),
        })
    ).then(reportSaveSuccess, (error) => {
        console.error(`Không thể lưu "${key}":`, error);
        reportSaveError(error);
    });

const flush = (key: string, keepalive = false) => {
    const entry = pending.get(key);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.delete(key);
    void send(key, entry.value, keepalive);
};

/** Update the cache now and persist after `delayMs` without further changes. */
export const saveSetting = (key: string, value: unknown, delayMs = DEFAULT_SAVE_DELAY_MS) => {
    cache[key] = value;

    const existing = pending.get(key);
    if (existing) window.clearTimeout(existing.timer);

    pending.set(key, {
        value,
        timer: window.setTimeout(() => flush(key), delayMs),
    });
};

onPageHide(() => {
    for (const key of [...pending.keys()]) flush(key, true);
});
