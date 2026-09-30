const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);
  console.log("HTML length:", (await page.content()).length);
  await browser.close();
})();
