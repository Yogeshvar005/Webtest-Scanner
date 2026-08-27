const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('https://webtest-scanner-web.vercel.app/login', { waitUntil: 'networkidle' });
  
  // Click "Create Account" tab to switch mode
  await page.click('button[type="button"]:has-text("Create Account")');
  
  // Fill email and password
  await page.fill('input[type="email"]', 'test_newuser123@example.com');
  await page.fill('input[type="password"]', 'password123');
  
  // Click the submit button
  await page.click('button[type="submit"]');
  
  // Wait a bit to see if there's an error displayed
  await page.waitForTimeout(4000);
  
  const errorMsg = await page.locator('.err').textContent().catch(() => null);
  if (errorMsg) {
     console.log('FOUND ERROR ON PAGE:', errorMsg);
  }
  
  console.log('Current URL after submit:', page.url());
  
  await page.screenshot({ path: 'scratch/screenshot-login-submit.png' });
  await browser.close();
})();
