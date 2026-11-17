import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: true,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:1420",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    // Production build of the website, served with the Vercel headers.
    command: "npm run web:build && npm run web:preview",
    timeout: 180_000,
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 850 } } },
    { name: "compact", use: { viewport: { width: 780, height: 700 } } },
    { name: "text-zoom", use: { viewport: { width: 1100, height: 850 } } },
  ],
});
