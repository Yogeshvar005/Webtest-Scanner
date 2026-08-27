const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  // We need a persistent context or just do it in one context
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  try {
    console.log('Navigating to login...');
    await page.goto('https://webtest-scanner-web.vercel.app/login', { waitUntil: 'networkidle' });
    
    console.log('Logging in...');
    await page.fill('input[type="email"]', 'test_newuser123@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    await page.waitForTimeout(3000);
    console.log('URL after login:', page.url());
    
    console.log('Reloading / pasting link again...');
    await page.goto('https://webtest-scanner-web.vercel.app/', { waitUntil: 'networkidle' });
    
    await page.waitForTimeout(2000);
    
    const errText = await page.evaluate(() => {
      const errEl = document.querySelector('.err');
      return errEl ? errEl.innerText : null;
    });
    
    const h2Text = await page.evaluate(() => {
      const h2 = document.querySelector('h2');
      return h2 ? h2.innerText : null;
    });

    console.log('UI ERROR DISPLAYED:', errText);
    console.log('H2 displayed:', h2Text);
    
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await browser.close();
  }
})();
