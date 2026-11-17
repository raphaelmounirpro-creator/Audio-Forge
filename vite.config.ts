import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import vercel from "./vercel.json";

// The preview server applies the same headers as Vercel, so the browser
// tests run under the production Content-Security-Policy.
const siteHeaders = Object.fromEntries(
  vercel.headers[0].headers.map(({ key, value }) => [key, value]),
);

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: { __AUDIOFORGE_WEB__: JSON.stringify(mode === "web") },
  server: { port: 1420, strictPort: true },
  preview: { port: 1420, strictPort: true, headers: siteHeaders },
  // ffmpeg.wasm starts its own worker, which pre-bundling would break.
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
  clearScreen: false,
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
