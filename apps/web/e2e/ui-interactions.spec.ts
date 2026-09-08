import { test, expect } from '@playwright/test';

test.describe('Webtest Scanner UI Interactions', () => {
  test('Escape key closes modals', async ({ page }) => {
    test.setTimeout(60000); // 1 minute

    // 1. Authentication
    await page.goto('/');
    
    // We expect it to redirect to /login if not logged in
    await page.waitForURL('**/login');
    
    const randomEmail = `testuser_${Date.now()}@example.com`;
    const password = 'Password123!';

    await page.click('text=Create Account');
    await page.fill('input#email', randomEmail);
    await page.fill('input#password', password);
    
    const createBtn = page.locator('button', { hasText: 'Create Account' }).nth(1);
    await createBtn.click();

    await page.waitForURL('**/', { timeout: 15000 });

    // Open History modal
    await page.click('button[title="Recent Scan History"]');
    await expect(page.locator('text=Audit History & Trends')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Verify modal is closed
    await expect(page.locator('text=Audit History & Trends')).toBeHidden();

    // Open Schedules modal
    await page.click('button[title="Scheduled Synthetic Monitoring"]');
    await expect(page.locator('text=Synthetic Scheduled Monitoring')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Verify modal is closed
    await expect(page.locator('text=Synthetic Scheduled Monitoring')).toBeHidden();
  });
});
