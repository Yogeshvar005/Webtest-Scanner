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
  await page.waitForSelector('.wordmark .ch');
}

/** Characters that never became visible — the blank-page failure mode. */
async function hiddenWordmarkChars(page: Page): Promise<number> {
  return page.$$eval('.wordmark .ch', (els) =>
    els.filter((el) => Number(getComputedStyle(el).opacity) < 0.9).length,
  );
}

test.describe('with motion allowed', () => {
  test('reports the preference as no-preference', async ({ page }) => {
    await open(page, 'no-preference');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
  });

  test('renders every wordmark character', async ({ page }) => {
    await open(page, 'no-preference');
    expect(await page.locator('.wordmark .ch').count()).toBe(15);
    expect(await hiddenWordmarkChars(page)).toBe(0);
  });

  test('runs the radar sweep', async ({ page }) => {
    await open(page, 'no-preference');
    await expect(page.locator('.radar .sweep')).toHaveCSS('display', 'block');
  });
});

test.describe('with reduced motion requested', () => {
  test('reports the preference as reduce', async ({ page }) => {
    await open(page, 'reduce');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  });

  test('still shows every wordmark character', async ({ page }) => {
    await open(page, 'reduce');
    expect(await hiddenWordmarkChars(page)).toBe(0);
  });

  test('removes the sweeping radar animation', async ({ page }) => {
    await open(page, 'reduce');
    await expect(page.locator('.radar .sweep')).toHaveCSS('display', 'none');
  });

  test('shows exactly one tagline word rather than stacking all of them', async ({ page }) => {
    await open(page, 'reduce');

    const visible = await page.$$eval('.tagline .rotator > span', (els) =>
      els.filter((el) => Number(getComputedStyle(el).opacity) > 0.5).length,
    );

    expect(visible).toBe(1);
  });

  test('leaves the selection controls visible and usable', async ({ page }) => {
    await open(page, 'reduce');

    await expect(page.locator('.option').first()).toHaveCSS('opacity', '1');
    await expect(page.getByLabel('Functional')).toBeVisible();
    await expect(page.getByRole('button', { name: /run test/i })).toBeEnabled();
  });
});

test('the heading is readable despite being split into per-character spans', async ({ page }) => {
  await open(page, 'no-preference');
  // Visible characters are aria-hidden; one sr-only node carries the name.
  await expect(page.locator('.wordmark .sr-only')).toHaveText('Webtest Scanner');
});

test('every checkbox has an associated label', async ({ page }) => {
  await open(page, 'no-preference');
  await page.waitForSelector('.option input[type="checkbox"]');

  const unlabelled = await page.$$eval('input[type="checkbox"]', (boxes) =>
    boxes.filter((b) => !(b as HTMLInputElement).labels?.length).length,
  );

  expect(unlabelled).toBe(0);
});

test('decorative glyphs are hidden from assistive technology', async ({ page }) => {
  await open(page, 'no-preference');

  const exposed = await page.$$eval('.glyph', (els) =>
    els.filter((el) => el.getAttribute('aria-hidden') !== 'true').length,
  );

  expect(exposed).toBe(0);
});
