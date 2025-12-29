import { test, expect } from '@playwright/test';

/**
 * Example Playwright E2E Test
 *
 * This demonstrates basic UI/UX testing patterns.
 * Replace this with your actual feature tests.
 */
test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});

/**
 * TEMPLATE PATTERNS for testing UI features:
 */

// Pattern 1: Test element visibility
test.skip('feature element appears on page', async ({ page }) => {
  await page.goto('/feature-page');

  const element = page.getByRole('button', { name: /submit/i });
  await expect(element).toBeVisible();
});

// Pattern 2: Test button click interaction
test.skip('button click triggers expected behavior', async ({ page }) => {
  await page.goto('/feature-page');

  const button = page.getByRole('button', { name: /toggle/i });
  await button.click();

  // Verify outcome (e.g., URL change, element appears, state changes)
  await expect(page).toHaveURL(/.*success/);
});

// Pattern 3: Test form submission
test.skip('form submission works correctly', async ({ page }) => {
  await page.goto('/form-page');

  // Fill form fields
  await page.getByLabel(/username/i).fill('testuser');
  await page.getByLabel(/password/i).fill('testpass');

  // Submit form
  await page.getByRole('button', { name: /submit/i }).click();

  // Verify success
  await expect(page.getByText(/success/i)).toBeVisible();
});

// Pattern 4: Test navigation flow
test.skip('navigation flow works end-to-end', async ({ page }) => {
  await page.goto('/');

  // Step 1: Click navigation link
  await page.getByRole('link', { name: /features/i }).click();
  await expect(page).toHaveURL(/.*features/);

  // Step 2: Interact with feature
  await page.getByRole('button', { name: /try it/i }).click();

  // Step 3: Verify final state
  await expect(page.getByText(/result/i)).toBeVisible();
});

// Pattern 5: Test error handling
test.skip('error states display correctly', async ({ page }) => {
  await page.goto('/form-page');

  // Submit invalid data
  await page.getByRole('button', { name: /submit/i }).click();

  // Verify error message appears
  await expect(page.getByText(/error|invalid|required/i)).toBeVisible();
});

/**
 * USAGE NOTES:
 *
 * - Remove .skip from tests to enable them
 * - Use test.only to run a single test during development
 * - Selectors priority: role > label > placeholder > text > test-id
 * - Always use regex for text matching: /text/i (case-insensitive)
 * - Wait for elements with expect().toBeVisible() (auto-retry)
 * - Test from user perspective (what they see/click), not implementation details
 */
