import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default defineConfig(({ mode }) => {
    return {
        base: "./",
        root: "src",
        // Copied as-is to the web root on build (stable URLs): PWA manifest,
        // service worker, icons. Relative to `root`, i.e. src/public.
        publicDir: "public",
        build: {
            // The SPA is built into Laravel's web root, next to index.php.
            outDir: "../public",
            copyPublicDir: true,
            assetsDir: "static",
            // Never wipe the folder: it also holds Laravel's index.php and .htaccess.
            emptyOutDir: false,
            rollupOptions: {
                output: {
                    // Content hash in every file name, so the web server can let
                    // browsers cache /static/* forever (see public/.htaccess).
                    assetFileNames: "static/assets/[name]-[hash][extname]",
                    manualChunks(id): string | undefined {
                        // Only the libraries every page needs go into the shared
                        // vendor chunk. Others (YouTube player, uuid...) stay with
                        // the lazy component that imports them, so they are not
                        // downloaded before that component is opened.
                        if (id.includes("node_modules")) {
                            return /[\\/]node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store|@loadable|lucide-react|hoist-non-react-statics|react-is|@babel[\\/]runtime)[\\/]/.test(id)
                                ? "vendor"
                                : undefined;
                        }

                        for (const folder of [
                            "components",
                            // "assets",
                            "visualizers",
                        ]) {
                            if (id.includes(`/${folder}/`)) {
                                const componentName = id.split(".")?.[0]?.split(`/`)?.at?.(-1);
                                if (componentName) {
                                    return `${folder}/${componentName.toLowerCase()}`;
                                }
                            }
                        }

                        return "default";
                    },
                },
            },
        },
        server: {
            port: 3000,
            host: "0.0.0.0",
            proxy: {
                "/api": "http://localhost:8000",
            },
        },
        css: {
            // Inline so it does not depend on where Vite (root: "src") looks for a config.
            postcss: {
                plugins: [
                    tailwindcss({ config: path.resolve(__dirname, "tailwind.config.js") }),
                    autoprefixer(),
                ],
            },
        },
        plugins: [react()],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "."),
            },
        },
    };
});
