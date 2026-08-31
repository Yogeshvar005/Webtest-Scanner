import { test, expect } from '@playwright/test';

test.describe('Webtest Scanner End-to-End', () => {
  test('Complete flow: Authentication, Scan, Downloads, Modals', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    // 1. Authentication
    await page.goto('/');
    
    // We expect it to redirect to /login if not logged in
    await page.waitForURL('**/login');
    
    // Switch to Sign Up mode
    await page.click('text=Create Account');

    const randomEmail = `testuser_${Date.now()}@example.com`;
    const password = 'Password123!';

    await page.fill('input#email', randomEmail);
    await page.fill('input#password', password);
    
    // Wait for Create Account button
    const createBtn = page.locator('button', { hasText: 'Create Account' }).nth(1);
    await createBtn.click();

    // Wait to be redirected to home page
    await page.waitForURL('**/', { timeout: 15000 });

    // 2. Main Page Scan
    const urlInput = page.getByPlaceholder('https://github.com');
    await urlInput.waitFor({ state: 'visible' });
    await urlInput.fill('https://github.com');
    
    // Start scan
    const inspectButton = page.getByRole('button', { name: /Inspect/i });
    await inspectButton.click();

    // 3. Wait for completion
    const newInspectionBtn = page.getByRole('button', { name: /New Inspection/i });
    await newInspectionBtn.waitFor({ state: 'visible', timeout: 90000 });

    // 4. Download PDF verification
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download PDF/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');

    // 5. Download JSON verification
    const jsonDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Full JSON/i }).click();
    const jsonDownload = await jsonDownloadPromise;
    expect(jsonDownload.suggestedFilename()).toContain('.json');

    // Go back to main start
    await newInspectionBtn.click();

    // 6. History modal
    await page.click('button[title="Recent Scan History"]');
    await expect(page.locator('text=Audit History & Trends')).toBeVisible();
    await page.click('.modal-header .theme-toggle'); // Close button

    // 7. Schedules modal
    await page.click('button[title="Scheduled Synthetic Monitoring"]');
    await expect(page.locator('text=Synthetic Scheduled Monitoring')).toBeVisible();
    
    // Add a schedule
    const scheduleModal = page.locator('.modal-dialog');
    await scheduleModal.locator('input[placeholder="https://github.com"]').fill('https://github.com');
    await scheduleModal.locator('button:has-text("+ Add Schedule")').click();
    
    // Modal should close automatically after adding
    await expect(scheduleModal).toBeHidden();
    
    // Re-open to verify it was added
    await page.click('button[title="Scheduled Synthetic Monitoring"]');
    await expect(page.locator('text=Active Monitored Targets (1)')).toBeVisible();
    
    // Close schedules manually
    await page.click('.modal-header .theme-toggle'); 
  });
});
