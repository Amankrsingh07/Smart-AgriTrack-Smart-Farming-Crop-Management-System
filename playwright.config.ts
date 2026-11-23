import { defineConfig } from "@playwright/test";
import { requireTestDatabase } from "./src/lib/test-database-safety";
const database = requireTestDatabase(process.env.TEST_DATABASE_URL);
export default defineConfig({
 testDir: "./e2e", fullyParallel: false, workers: 1, timeout: 60_000,
 use: { baseURL: "http://127.0.0.1:3107", headless: true, screenshot: "only-on-failure", trace: "retain-on-failure" },
 webServer: { command: "npm run start -- --hostname 127.0.0.1 --port 3107", url: "http://127.0.0.1:3107", reuseExistingServer: false, timeout: 120_000, env: { GEMINI_API_KEY:"", GOOGLE_API_KEY:"", GEMINI_MODEL:"", DATABASE_URL: database, SESSION_SECRET: "isolated-soil-tests-only-32-characters-minimum" } },
});
