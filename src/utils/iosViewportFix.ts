/**
 * iOS Home Screen app: make the app fill the whole screen.
 *
 * With the status bar drawn over the page (black-translucent — still active in
 * apps installed before we removed that meta, since iOS reads it at install
 * time), iOS draws the page from the very top of the screen but sizes the
 * viewport as if it started below the status bar. 100dvh and position:fixed
 * bottom:0 then stop one status-bar height short, leaving a dark strip at the
 * bottom.
 *
 * Detect that case — standalone iOS, a top safe-area inset (status bar drawn
 * over the page) and a viewport shorter than the screen — and expose the
 * corrected height as --app-height. In every other case (browser tab,
 * Android, desktop, apps without the bug) the variable is not set and layouts
 * fall back to 100dvh.
 */

const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Resolved env(safe-area-inset-top) in CSS pixels. */
const topInset = () => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)";
    document.body.appendChild(probe);
    const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    return inset;
};

const apply = () => {
    const root = document.documentElement;
    const inset = topInset();
    const viewport = window.innerHeight;
    const portrait = viewport >= window.innerWidth;
    const screenHeight = portrait
        ? Math.max(window.screen.width, window.screen.height)
        : Math.min(window.screen.width, window.screen.height);

    // Buggy case: the page is drawn from under the status bar (inset > 0) but
    // the viewport is shorter than the screen. Extend it by what is missing,
    // never past the physical screen. If iOS ever sizes it correctly
    // (viewport == screen) nothing changes.
    const missing = Math.min(inset, screenHeight - viewport);
    const short = inset > 0 && missing > 1;

    if (short) {
        const height = viewport + missing;
        root.style.setProperty("--app-height", `${height}px`);
        root.dataset.iosViewportFix = `${viewport}+${missing}=${height} (screen ${screenHeight}, inset ${inset})`;
    } else {
        root.style.removeProperty("--app-height");
        delete root.dataset.iosViewportFix;
    }
};

export const installIOSViewportFix = () => {
    if (typeof window === "undefined" || !isIOS() || !isStandalone()) return;
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", () => window.setTimeout(apply, 250));
};
