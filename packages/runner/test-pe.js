import { addExtra } from 'playwright-extra';
import * as playwright from 'playwright-core';
const pe = addExtra(playwright);
console.log(typeof pe.chromium.launch);
console.log(typeof pe.chromium.use);
