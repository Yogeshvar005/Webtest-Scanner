const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('response', resp => {
    if (resp.url().includes('/api/run')) {
      console.log('API /run status:', resp.status());
    }
  });
  
  await page.goto('https://webtest-scanner-web.vercel.app/login', { waitUntil: 'networkidle' });
  
  // Fill email and password (using the one we just created)
  await page.fill('input[type="email"]', 'test_newuser123@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  
  await page.waitForURL('https://webtest-scanner-web.vercel.app/');
  console.log('Navigated to main page');
  
  // Click Run test
  await page.click('button:has-text("Run test")');
  console.log('Clicked Run test');
  
  // Wait for the response from /api/run
  try {
    const res = await page.waitForResponse(resp => resp.url().includes('/api/run'), { timeout: 20000 });
    console.log('/api/run returned', res.status());
    const json = await res.json().catch(() => null);
    console.log('Response JSON:', json);
  } catch(e) {
    console.log('Wait for /api/run timed out');
  }
  
  const errorMsg = await page.locator('.err').textContent({ timeout: 1000 }).catch(() => null);
  if (errorMsg) {
     console.log('FOUND ERROR ON PAGE:', errorMsg);
  }
  
  await page.screenshot({ path: 'scratch/screenshot-run.png' });
  await browser.close();
})();
