const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  try {
    await page.goto('https://webtest-scanner-web.vercel.app/login', { waitUntil: 'networkidle' });
    
    console.log('Clicking Continue with Google...');
    await page.click('button:has-text("Continue with Google")');
    
    await page.waitForTimeout(3000);
    
    const errText = await page.evaluate(() => {
      const errEl = document.querySelector('.err');
      return errEl ? errEl.innerText : null;
    });
    
    console.log('UI ERROR DISPLAYED:', errText);
    
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await browser.close();
  }
})();
