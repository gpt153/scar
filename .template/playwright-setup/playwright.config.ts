import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for E2E Testing
 *
 * This config enables browser-based testing to validate UI/UX functionality.
 *
 * Usage:
 *   npm run test:e2e              - Run all tests
 *   npm run test:e2e -- --ui      - Run with UI mode
 *   npm run test:e2e -- --debug   - Run in debug mode
 */
export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry failed tests on CI
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter: HTML report for local, GitHub Actions reporter for CI
  reporter: process.env.CI ? 'github' : 'html',

  // Shared settings for all tests
  use: {
    // Base URL for page.goto('/')
    baseURL: 'http://localhost:3000',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Browser projects to test against
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Add more browsers as needed:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Development server configuration
  // Playwright will automatically start this before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes
  },
});
