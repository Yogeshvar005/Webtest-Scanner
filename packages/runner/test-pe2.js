import { addExtra } from 'playwright-extra';
import { chromium } from 'playwright-core';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const pe = addExtra(chromium);
try {
  pe.use(StealthPlugin());
  console.log("Success");
} catch (e) {
  console.log("Error:", e.message);
}
