import { test, expect } from '@playwright/test';

test.describe('App Shell', () => {
  test('loads the landing page with session lobby', async ({ page }) => {
    await page.goto('/');

    // The app-shell element should be present
    const appShell = page.locator('app-shell');
    await expect(appShell).toBeAttached();

    // The session lobby renders inside app-shell's shadow DOM
    // Playwright pierces shadow DOM by default with locators
    const heading = page.getByRole('heading', { name: 'Seam' });
    await expect(heading).toBeVisible();
  });

  test('shows create and join session options', async ({ page }) => {
    await page.goto('/');

    // The landing page should show both session options
    await expect(page.getByText('Start a Session')).toBeVisible();
    await expect(page.getByText('Join a Session')).toBeVisible();
  });

  test('shows solo mode link', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Load files locally')).toBeVisible();
  });

  test('clicking solo mode shows file drop zone', async ({ page }) => {
    await page.goto('/');

    await page.getByText('Load files locally').click();

    // After clicking solo mode, the file-drop-zone hero should appear
    const dropZone = page.locator('file-drop-zone');
    await expect(dropZone).toBeAttached();
  });
});
