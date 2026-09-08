import { defineConfig } from "@playwright/test";

const headed =
  process.env.PLAYWRIGHT_HEADED === "1" ||
  process.env.PLAYWRIGHT_HEADED === "true" ||
  process.env.PLAYWRIGHT_HEADED === "sim";

const videoEnv = (process.env.PLAYWRIGHT_VIDEO ?? "").toLowerCase();
const video =
  videoEnv === "on"
    ? "on"
    : videoEnv === "on-first-retry"
      ? "on-first-retry"
      : headed
        ? "retain-on-failure"
        : "off";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: "./helpers/global-setup.ts",
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL,
    locale: "pt-BR",
    headless: !headed,
    launchOptions: headed ? { slowMo: Number(process.env.TOUR_SLOWMO ?? "150") || 150 } : undefined,
    trace: headed ? "on" : "retain-on-failure",
    screenshot: headed ? "on" : "only-on-failure",
    video,
    storageState: ".auth/session.json",
  },
  projects: [
    {
      name: "login-flows",
      testMatch: /US_AUTH_001\.spec\.ts$/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: "app",
      testIgnore: /US_AUTH_001\.spec\.ts$/,
    },
  ],
});
