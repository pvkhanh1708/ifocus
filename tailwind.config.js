import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

/**
 * Tailwind v3 compiled at build time (replaces the cdn.tailwindcss.com runtime,
 * which compiled CSS in the browser on every page load). Default theme, same as
 * the CDN build that was used before.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
    content: [`${src}/**/*.{html,ts,tsx}`],
    future: {
        // hover: / group-hover: only apply on devices that really hover (mouse,
        // trackpad). Avoids "sticky" hover after a tap on iOS; touch screens use
        // .touch-show / .tap-reveal instead (see style.css).
        hoverOnlyWhenSupported: true,
    },
    theme: {
        extend: {},
    },
    plugins: [],
};
