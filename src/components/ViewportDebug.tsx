import { useEffect, useState } from "react";

/**
 * Hidden diagnostics for layout issues on phones (opened by tapping the logo
 * five times). Shows what the device reports so a screenshot is enough to see
 * how iOS sizes the page.
 */

const readInset = (side: "top" | "bottom" | "left" | "right") => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;padding-${side}:env(safe-area-inset-${side})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).getPropertyValue(`padding-${side}`);
    probe.remove();
    return value;
};

const measure = () => {
    const root = document.querySelector(".pip-capture-root") as HTMLElement | null;
    const rect = root?.getBoundingClientRect();
    const metas = Array.from(document.querySelectorAll('meta[name^="apple"], meta[name="theme-color"], meta[name="viewport"]'))
        .map((m) => `${m.getAttribute("name")}=${m.getAttribute("content")}`);
    return {
        ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, ""),
        standalone: `${matchMedia("(display-mode: standalone)").matches} / navigator.standalone=${String((navigator as Navigator & { standalone?: boolean }).standalone)}`,
        "screen (w×h)": `${screen.width}×${screen.height} @${devicePixelRatio}x`,
        "innerWidth×innerHeight": `${innerWidth}×${innerHeight}`,
        visualViewport: window.visualViewport
            ? `${Math.round(visualViewport!.width)}×${Math.round(visualViewport!.height)} offsetTop=${Math.round(visualViewport!.offsetTop)}`
            : "n/a",
        "html clientHeight": String(document.documentElement.clientHeight),
        "safe-area top/bottom": `${readInset("top")} / ${readInset("bottom")}`,
        "--safe-top": getComputedStyle(document.documentElement).getPropertyValue("--safe-top").trim(),
        "--app-height": document.documentElement.style.getPropertyValue("--app-height") || "(not set)",
        "ios fix": document.documentElement.dataset.iosViewportFix || "(not applied)",
        "app root top/bottom/height": rect ? `${Math.round(rect.top)} / ${Math.round(rect.bottom)} / ${Math.round(rect.height)}` : "n/a",
        metas: metas.join(" | "),
    };
};

export default function ViewportDebug({ onClose }: { onClose: () => void }) {
    const [data, setData] = useState(measure);

    useEffect(() => {
        const update = () => setData(measure());
        window.addEventListener("resize", update);
        const id = window.setInterval(update, 1000);
        return () => {
            window.removeEventListener("resize", update);
            window.clearInterval(id);
        };
    }, []);

    return (
        // Centred, not over the logo, and closed only by its button: the tap that
        // opens it must not also close it (its click lands right after).
        <div className="fixed inset-x-3 top-1/2 z-[200] max-h-[70%] -translate-y-1/2 overflow-y-auto rounded-xl border border-white/20 bg-black/90 p-3 font-mono text-[11px] leading-snug text-white shadow-2xl">
            <div className="mb-2 flex items-center justify-between font-sans text-xs font-semibold">
                <span>Chẩn đoán màn hình</span>
                <button onClick={onClose} className="rounded-md bg-white/15 px-2 py-1 text-xs">
                    Đóng
                </button>
            </div>
            {Object.entries(data).map(([key, value]) => (
                <div key={key} className="break-all">
                    <span className="text-emerald-300">{key}:</span> {value}
                </div>
            ))}
        </div>
    );
}
