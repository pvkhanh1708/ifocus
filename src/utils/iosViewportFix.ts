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
 * Detect exactly that case — viewport height + top safe-area inset equals the
 * screen height — and expose the corrected height as --app-height. In every
 * other case (browser tab, Android, desktop, apps without the bug) the
 * variable is not set and layouts fall back to 100%.
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

    // Buggy case: the page is short of the physical screen by exactly the inset.
    const short = inset > 0 && Math.abs(viewport + inset - screenHeight) <= 2;

    if (short) {
        root.style.setProperty("--app-height", `${screenHeight}px`);
        root.dataset.iosViewportFix = `${viewport}+${inset}=${screenHeight}`;
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
