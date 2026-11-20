import type { Scene } from "../types";

/**
 * Paint the page (html) background with the colour at the bottom edge of the
 * current scene, and the theme-color with its top edge.
 *
 * Why: an installed iOS 26 app with the status bar drawn over the page
 * (black-translucent) cannot paint the bottom strip of the screen — a WebKit
 * regression (bug 301108); no CSS height reaches it. iOS fills that strip with
 * the page background colour, so matching it to the image makes the strip
 * blend in instead of showing a dark band.
 */

const FALLBACK = "#09101e";
// The background has a 20% black overlay on images (Background.tsx).
const IMAGE_OVERLAY_DARKEN = 0.8;

const setPageColors = (bottom: string, top: string = bottom) => {
    document.documentElement.style.backgroundColor = bottom;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", top);
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
        // Use the first and last colour stops of the CSS gradient.
        const stops = scene.url.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi);
        if (stops?.length) setPageColors(stops[stops.length - 1], stops[0]);
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
            setPageColors(averageBand(ctx, size, 0.9, 1), averageBand(ctx, size, 0, 0.1));
        } catch {
            setPageColors(FALLBACK);
        }
    };
    img.onerror = () => id === requestId && setPageColors(FALLBACK);
    img.src = scene.thumbnail || scene.url;
};
