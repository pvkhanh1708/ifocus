/**
 * Full-screen height for the app shell, without keeping a fixed element on
 * screen.
 *
 * Observed on an iPhone (iOS 27, installed web app, no black-translucent):
 * - 100dvh / 100% stop one status-bar height short of the bottom;
 * - position: fixed; inset: 0 reaches the bottom, but while a full-screen
 *   fixed element covers the top, iOS paints the status bar black instead of
 *   the page background colour (the scene colour, see sceneEdgeColor.ts).
 *
 * So: measure a fixed inset-0 probe once (removed right away) and give the
 * in-flow app shell that height via --app-height. Updated on resize and
 * rotation; layouts fall back to 100dvh before the first measurement.
 */

const measure = () => {
    const probe = document.createElement("div");
    probe.style.cssText =
        "position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    if (height > 0) {
        document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
    }
};

export const installAppHeight = () => {
    if (typeof window === "undefined") return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", () => window.setTimeout(measure, 300));
    window.visualViewport?.addEventListener("resize", measure);
};
