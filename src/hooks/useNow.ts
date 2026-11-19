import { useSyncExternalStore } from "react";

/**
 * Shared clock. One timer per interval for the whole app (not one per
 * component), aligned to the wall-clock boundary so a 1s ticker never skips
 * or repeats a second the way a drifting setInterval does.
 */

interface Ticker {
    now: number;
    listeners: Set<() => void>;
    timer: number | null;
}

const tickers = new Map<number, Ticker>();

const getTicker = (intervalMs: number): Ticker => {
    let ticker = tickers.get(intervalMs);
    if (!ticker) {
        ticker = { now: Date.now(), listeners: new Set(), timer: null };
        tickers.set(intervalMs, ticker);
    }
    return ticker;
};

const schedule = (intervalMs: number, ticker: Ticker) => {
    const delay = intervalMs - (Date.now() % intervalMs) + 5;
    ticker.timer = window.setTimeout(() => {
        ticker.now = Date.now();
        ticker.listeners.forEach((listener) => listener());
        schedule(intervalMs, ticker);
    }, delay);
};

const subscribe = (intervalMs: number) => (listener: () => void) => {
    const ticker = getTicker(intervalMs);
    ticker.listeners.add(listener);
    if (ticker.timer === null) {
        ticker.now = Date.now();
        schedule(intervalMs, ticker);
    }
    return () => {
        ticker.listeners.delete(listener);
        if (ticker.listeners.size === 0 && ticker.timer !== null) {
            window.clearTimeout(ticker.timer);
            ticker.timer = null;
        }
    };
};

const subscribers = new Map<number, (listener: () => void) => () => void>();

/** Current time in ms, re-rendering the caller every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
    let sub = subscribers.get(intervalMs);
    if (!sub) {
        sub = subscribe(intervalMs);
        subscribers.set(intervalMs, sub);
    }
    return useSyncExternalStore(sub, () => getTicker(intervalMs).now);
}
