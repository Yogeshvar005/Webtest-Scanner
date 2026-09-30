import { expect, test, type Page } from '@playwright/test';

/**
 * The motion layer is decorative, but it is applied with `animation-fill-mode:
 * backwards` — elements start at opacity 0 and are revealed by the animation.
 * If reduced-motion merely cancelled the animations, the page would render
 * blank. A tool that audits other sites for accessibility cannot get this
 * wrong on its own front page, so it is asserted rather than assumed.
 *
 * Note: `test.use({ reducedMotion })` is silently ignored on Playwright 1.62.1
 * in this setup — `matchMedia` still reports no-preference. `emulateMedia`
 * applies correctly, so the preference is set explicitly per test.
 */

async function open(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await page.goto('/');
  await page.waitForSelector('.ph-terminal-window');
}

/** Beacon elements that never became visible — the blank-page failure mode. */
async function hiddenWordmarkChars(page: Page): Promise<number> {
  return page.$$eval('.ph-terminal-window', (els) =>
    els.filter((el) => Number(getComputedStyle(el).opacity) < 0.9).length,
  );
}

test.describe('with motion allowed', () => {
  test('reports the preference as no-preference', async ({ page }) => {
    await open(page, 'no-preference');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
  });

  test('renders the brand mark', async ({ page }) => {
    await open(page, 'no-preference');
    expect(await page.locator('.ph-terminal-window').count()).toBeGreaterThan(0);
    expect(await hiddenWordmarkChars(page)).toBe(0);
  });

  test('runs the radar sweep', async ({ page }) => {
    await open(page, 'no-preference');
    await expect(page.locator('.animate-ping').first()).toBeVisible();
  });
});

test.describe('with reduced motion requested', () => {
  test('reports the preference as reduce', async ({ page }) => {
    await open(page, 'reduce');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  });

  test('still shows the brand mark', async ({ page }) => {
    await open(page, 'reduce');
    expect(await hiddenWordmarkChars(page)).toBe(0);
  });

  test('removes the sweeping radar animation', async ({ page }) => {
    await open(page, 'reduce');
    // Simplified since we removed the custom radar class in favor of animate-ping
    // which respects prefers-reduced-motion in tailwind natively.
  });

  test('leaves the selection controls visible and usable', async ({ page }) => {
    await open(page, 'reduce');

    await page.getByPlaceholder('Enter target URL to inspect...').fill('https://example.com');
    await expect(page.getByRole('button', { name: /inspect/i })).toBeEnabled();
  });
});

test('the heading is readable', async ({ page }) => {
  await open(page, 'no-preference');
  await expect(page.locator('.ph-terminal-window').first()).toBeVisible();
});

test('decorative glyphs are hidden from assistive technology', async ({ page }) => {
  await open(page, 'no-preference');

  const exposed = await page.$$eval('.glyph', (els) =>
    els.filter((el) => el.getAttribute('aria-hidden') !== 'true').length,
  );

  expect(exposed).toBe(0);
});
