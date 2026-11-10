import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

// End-to-end tests: a real browser against the real UI and the real API.
//
// The tests never touch your own data. They start their own API on its own
// port, seeded into a fresh temporary folder, and their own UI in front of it.
const API_PORT = 8010
const UI_PORT = 5174

// One folder per run (the seed refuses to run twice into the same folder).
// Kept in the environment so the teardown removes the same folder.
process.env.FAIRTOY_E2E_DATA_DIR ??= path.join(os.tmpdir(), `fairtoy-e2e-${Date.now()}`)
const dataDir = process.env.FAIRTOY_E2E_DATA_DIR

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/teardown.ts',
  // The tests share one API and record findings in it, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${UI_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'API',
      command: `uv run python -m app.seed && uv run uvicorn app.main:app --port ${API_PORT}`,
      cwd: '../backend',
      env: { FAIRTOY_DATA_DIR: dataDir, FAIRTOY_SECRET: 'end-to-end-tests-only-secret-0123456789' },
      url: `http://127.0.0.1:${API_PORT}/docs`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      name: 'UI',
      command: `npm run dev -- --port ${UI_PORT} --strictPort`,
      env: { FAIRTOY_API_URL: `http://127.0.0.1:${API_PORT}` },
      url: `http://localhost:${UI_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
