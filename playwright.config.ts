import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    // Uses the locally installed Google Chrome, so no browser download is needed.
    channel: 'chrome',
    viewport: { width: 1400, height: 1000 },
  },
  outputDir: process.env.PW_OUT ?? 'test-results',
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
