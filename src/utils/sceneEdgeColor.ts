import type { Scene } from "../types";

/**
 * Paint the page (html) background and theme-color with the colour at the top
 * edge of the current scene.
 *
 * Why: the installed iOS app does not draw the page under the status bar (no
 * black-translucent — with it, iOS 26 leaves an unpaintable strip at the
 * bottom, WebKit bug 301108). iOS fills the status-bar area with the page
 * background colour instead — that is why the hoctienganh app shows a light
 * bar (its page background is #f3f6fb) and why ours was black (#09101e).
 * Matching it to the top of the image makes the bar continue the scene.
 */

const FALLBACK = "#09101e";
// The background has a 20% black overlay on images (Background.tsx).
const IMAGE_OVERLAY_DARKEN = 0.8;

const setPageColors = (color: string) => {
    const root = document.documentElement;
    root.style.backgroundColor = color;
    // Safari 26+ tints the status bar from the fixed element touching the top
    // edge (our fixed app shell), not from the page background: the shell and
    // the background layer use this colour behind the image.
    root.style.setProperty("--scene-edge", color);
    // Remembered so index.html can apply it before the first paint next launch.
    try {
        localStorage.setItem("ifocus-scene-edge", color);
    } catch {
        // Private mode / storage blocked: the colour is still applied now.
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
};

const toHex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** Average colour of a horizontal band of an image (fractions of its height). */
const averageBand = (ctx: CanvasRenderingContext2D, size: number, from: number, to: number) => {
    const y = Math.floor(size * from);
    const h = Math.max(1, Math.floor(size * (to - from)));
    const { data } = ctx.getImageData(0, y, size, h);
    let r = 0, g = 0, b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
    }
    return toHex(
        (r / n) * IMAGE_OVERLAY_DARKEN,
        (g / n) * IMAGE_OVERLAY_DARKEN,
        (b / n) * IMAGE_OVERLAY_DARKEN
    );
};

let requestId = 0;

export const applySceneEdgeColors = (scene: Scene) => {
    const id = ++requestId;

    if (scene.type === "color") {
        setPageColors(scene.url);
        return;
    }
    if (scene.type === "gradient") {
        // Use the first colour stop of the CSS gradient.
        const stops = scene.url.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi);
        if (stops?.length) setPageColors(stops[0]);
        else setPageColors(FALLBACK);
        return;
    }
    if (scene.type !== "image") {
        setPageColors("#000000");
        return;
    }

    // Sample a small copy (CORS-enabled request, separate from the displayed
    // <img>, so a host without CORS only skips the colour, never the image).
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
        if (id !== requestId) return;
        try {
            const size = 32;
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) return;
            // Same framing as object-fit: cover is not needed for edge bands.
            ctx.drawImage(img, 0, 0, size, size);
            setPageColors(averageBand(ctx, size, 0, 0.08));
        } catch {
            setPageColors(FALLBACK);
        }
    };
    img.onerror = () => id === requestId && setPageColors(FALLBACK);
    img.src = scene.thumbnail || scene.url;
};
