const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  const response = await page.goto('https://webtest-scanner-web.vercel.app/', { waitUntil: 'networkidle' });
  console.log('Status:', response.status());
  
  await page.screenshot({ path: 'scratch/screenshot.png' });
  await browser.close();
})();
