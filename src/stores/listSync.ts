import { apiRequest, withRetry } from "../utils/api";
import { onPageHide } from "../utils/onPageHide";
import { reportSaveError, reportSaveSuccess } from "./syncStatus";

/**
 * Server sync for per-user lists (tasks, notes, countdowns). Each item is its
 * own row on the server, so every change sends only that item.
 *
 * Requests for the same item run one after another, so "create → update →
 * delete" always reach the server in that order even if the user is fast.
 */

export type ListName = "tasks" | "notes" | "countdowns";

const queues = new Map<string, Promise<unknown>>();

const enqueue = <T>(queueKey: string, request: () => Promise<T>): Promise<T> => {
    const previous = queues.get(queueKey) ?? Promise.resolve();
    // A failed earlier request must not block the ones after it.
    const next = previous.catch(() => undefined).then(request);
    queues.set(queueKey, next);
    next.then(
        () => queues.get(queueKey) === next && queues.delete(queueKey),
        () => queues.get(queueKey) === next && queues.delete(queueKey)
    );
    return next;
};

/**
 * Send one write, retrying transient failures (all list writes are idempotent),
 * and report the outcome so the UI can warn when a change could not be saved.
 */
const send = (path: string, method: string, body?: unknown, keepalive = false) =>
    withRetry(() =>
        apiRequest(path, {
            method,
            keepalive,
            body: body === undefined ? undefined : JSON.stringify(body),
        })
    ).then(
        (result) => {
            reportSaveSuccess();
            return result;
        },
        (error) => {
            reportSaveError(error);
            throw error;
        }
    );

export const fetchList = async <T>(list: ListName): Promise<T[]> =>
    (await apiRequest<{ items: T[] }>(`/api/${list}`)).items;

export const createItem = (list: ListName, item: { id: string }) =>
    enqueue(`${list}:${item.id}`, () => send(`/api/${list}`, "POST", item));

export const updateItem = (list: ListName, id: string, changes: object, keepalive = false) =>
    enqueue(`${list}:${id}`, () =>
        send(`/api/${list}/${encodeURIComponent(id)}`, "PATCH", changes, keepalive)
    );

export const deleteItem = (list: ListName, id: string) => {
    cancelPendingUpdate(list, id);
    return enqueue(`${list}:${id}`, () =>
        send(`/api/${list}/${encodeURIComponent(id)}`, "DELETE")
    );
};

export const reorderItems = (list: ListName, ids: string[]) =>
    enqueue(`${list}:__order`, () => send(`/api/${list}/order`, "PUT", { ids }));

// ---------------------------------------------------------------------------
// Debounced updates (e.g. typing in a note): changes are merged and sent once
// the user pauses, and flushed immediately when the page is hidden/closed.
// ---------------------------------------------------------------------------

interface PendingUpdate {
    list: ListName;
    id: string;
    changes: Record<string, unknown>;
    timer: number;
    onError: (error: unknown) => void;
}

const pending = new Map<string, PendingUpdate>();

const flushPendingUpdate = (key: string, keepalive = false) => {
    const entry = pending.get(key);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.delete(key);
    updateItem(entry.list, entry.id, entry.changes, keepalive).catch(entry.onError);
};

export const updateItemDebounced = (
    list: ListName,
    id: string,
    changes: object,
    onError: (error: unknown) => void,
    delayMs = 600
) => {
    const key = `${list}:${id}`;
    const entry = pending.get(key);
    if (entry) window.clearTimeout(entry.timer);

    pending.set(key, {
        list,
        id,
        onError,
        changes: { ...(entry?.changes ?? {}), ...changes },
        timer: window.setTimeout(() => flushPendingUpdate(key), delayMs),
    });
};

const cancelPendingUpdate = (list: ListName, id: string) => {
    const key = `${list}:${id}`;
    const entry = pending.get(key);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.delete(key);
};

onPageHide(() => {
    for (const key of [...pending.keys()]) flushPendingUpdate(key, true);
});
