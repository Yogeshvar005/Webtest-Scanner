import type { Page } from 'playwright-core';
import type { Step } from '@wts/dsl';
import { decideRouteLLM } from '@wts/nlp';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StepResult } from './types';

// Human-like random delay
function humanDelay(minMs = 80, maxMs = 400): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Animate mouse to element
async function animateMouseTo(page: Page, locator: import('playwright-core').Locator) {
  try {
    const box = await locator.boundingBox();
    if (box) {
      const targetX = box.x + box.width / 2;
      const targetY = box.y + box.height / 2;
      await page.mouse.move(targetX, targetY, { steps: 10 });
    }
  } catch {
    // Ignore
  }
}

export async function runAgenticCrawler(
  page: Page,
  step: Step,
  maxDepth: number,
  runId: string,
  artifactDir: string
): Promise<StepResult[]> {
  const subResults: StepResult[] = [];
  const visitedUrls = new Set<string>();
  const initialUrl = page.url();
  let exploredCount = 1;

  async function crawlNode(currentDepth: number) {
    if (currentDepth >= maxDepth) return;
    
    // 1. Observe: Get page content & elements
    // We only wait for idle momentarily
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: 3000 }),
      page.waitForLoadState('domcontentloaded', { timeout: 2000 })
    ]).catch(() => {});
    
    const currentUrl = page.url();
    visitedUrls.add(currentUrl);

    // If we've somehow left the origin entirely (optional, but good for safety), we should backtrack,
    // though the crawler prompt implies internal links.

    const pageTitle = await page.title().catch(() => '');
    const pageText = await page.textContent('body').catch(() => '') || '';
    
    const locators = await page.locator('a:visible, button:visible').all().catch(() => []);
    const interactiveElements = [];
    for (let i = 0; i < locators.length; i++) {
      const loc = locators[i]!;
      if (await loc.isVisible().catch(() => false)) {
        const text = await loc.textContent().catch(() => '') || '';
        const tagName = await loc.evaluate((el: any) => el.tagName.toLowerCase()).catch(() => '');
        const elemRole = await loc.getAttribute('role').catch(() => null) || '';
        const nameAttr = await loc.getAttribute('name').catch(() => null) || '';
        const placeholder = await loc.getAttribute('placeholder').catch(() => null) || '';
        
        interactiveElements.push({
          id: i.toString(),
          role: elemRole || tagName,
          text: text.trim().substring(0, 100),
          placeholder,
          name: nameAttr,
          tagName,
        });
      }
    }

    // 2. Decide: Query LLM with state
    const decision = await decideRouteLLM({
      pageUrl: currentUrl,
      pageTitle,
      elements: interactiveElements,
      pageText,
      visitedUrls: Array.from(visitedUrls)
    });

    // 3. Act: Snapshot current page if relevant
    if (decision.isRelevant && currentDepth > 0) { // root page is handled by parent step
      const screenshotBuffer = await page.screenshot({ fullPage: step.evidence?.fullPage ?? false, timeout: 15_000 }).catch(() => null);
      let screenshotUrl = undefined;
      if (screenshotBuffer) {
        const file = `${runId}-${String(step.index).padStart(2, '0')}-explore-${exploredCount}.png`;
        await writeFile(join(artifactDir, file), screenshotBuffer).catch(() => {});
        screenshotUrl = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
      }
      
      subResults.push({
        id: `${step.id}-explore-${exploredCount}`,
        index: Number((step.index + (exploredCount * 0.01)).toFixed(2)),
        intent: `Explored: ${currentUrl} - ${decision.pageSummary}`,
        status: 'passed',
        durationMs: 0,
        screenshot: screenshotUrl,
        assertions: [],
        consoleErrors: [],
        provenanceSource: step.provenance.source,
        provenanceConfidence: step.provenance.confidence,
      });
      exploredCount++;
    }

    // 4. Backtrack if it's a leaf node or requested
    if (decision.shouldBacktrack) {
      return;
    }

    // Iterate over links to explore
    const linksToExplore = decision.nextLinksToExplore || [];
    const maxLinks = Math.min(linksToExplore.length, 4);

    for (let i = 0; i < maxLinks; i++) {
      const selectedIndex = parseInt(linksToExplore[i]!, 10);
      if (isNaN(selectedIndex)) continue;

      // Re-query because DOM could have changed after back navigation
      const currentLocators = await page.locator('a:visible, button:visible').all().catch(() => []);
      const loc = currentLocators[selectedIndex];
      if (!loc) continue;
      
      if (!(await loc.isVisible().catch(()=>false))) continue;
      
      await animateMouseTo(page, loc);
      await loc.hover({ timeout: 2000 }).catch(() => {});
      await humanDelay(120, 350);
      
      const preUrl = page.url();
      
      const popupPromise = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
      await loc.click({ timeout: 5000, delay: 50 }).catch(() => {});
      
      const popup = await popupPromise;
      let targetPage = popup || page;
      
      if (popup) {
        await targetPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      } else {
        await Promise.race([
          targetPage.waitForLoadState('networkidle', { timeout: 3000 }),
          targetPage.waitForLoadState('domcontentloaded', { timeout: 2000 }),
        ]).catch(() => {});
      }
      
      const postUrl = targetPage.url();
      
      if (postUrl !== preUrl || popup) {
        await targetPage.waitForTimeout(1500).catch(() => {});
        
        // Depth-first traversal
        if (!visitedUrls.has(postUrl)) {
          await crawlNode(currentDepth + 1);
        }
      }
      
      // Navigate Back (Backtrack)
      if (popup) {
        await popup.close().catch(() => {});
      } else if (page.url() !== currentUrl) { // if the page changed
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(async () => {
          await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(()=>{});
        });
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      }
    }
  }

  // Start crawling from root (depth 0)
  const exploreStartedAt = Date.now();
  await crawlNode(0);
  
  // Set accurate duration for subresults (approximate)
  subResults.forEach(r => {
    if (r.durationMs === 0) r.durationMs = Date.now() - exploreStartedAt;
  });

  return subResults;
}
