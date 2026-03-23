// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
const host = process.env.TAURI_DEV_HOST;
export default defineConfig({
    plugins: [react()],
    clearScreen: false,
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    server: {
        port: Number(process.env.PORT) || 1420,
        strictPort: true,
        host: host || false,
        hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
        watch: { ignored: ["**/src-tauri/**"] },
        proxy: {
            "/local-ai": {
                target: "http://127.0.0.1:4891",
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/local-ai/, ""),
            },
        },
    },
});
