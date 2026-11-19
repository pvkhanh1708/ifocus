/**
 * Run callbacks when the page is being hidden or closed, so debounced saves
 * still reach the server (requests sent here should use `keepalive`).
 */
const callbacks = new Set<() => void>();

const runAll = () => callbacks.forEach((callback) => callback());

if (typeof window !== "undefined") {
    window.addEventListener("pagehide", runAll);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") runAll();
    });
}

export const onPageHide = (callback: () => void) => {
    callbacks.add(callback);
    return () => callbacks.delete(callback);
};
