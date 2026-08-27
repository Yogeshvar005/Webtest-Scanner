import { chromium } from 'playwright';
import { Ollama } from 'ollama';
import { Command } from 'commander';

const program = new Command();

program
  .name('local-scanner')
  .description('A local AI-driven web scanner that bypasses bot protection by running on your machine.')
  .requiredOption('-u, --url <url>', 'The URL to scan (e.g., https://etihad.com)')
  .option('-i, --instructions <instructions>', 'Instructions for the AI to perform', 'Analyze this webpage and tell me what you see.')
  .option('-m, --model <model>', 'The Ollama vision model to use', 'llava:latest')
  .option('--host <host>', 'The Ollama host', 'http://127.0.0.1:11434');

program.parse();

const options = program.opts();

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function addLabels(page) {
  return await page.evaluate(() => {
    const elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [tabindex="0"]');
    const labels = {};
    elements.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      // Ensure element is visible in the current viewport
      if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top <= window.innerHeight) {
        const labelId = index.toString();
        // Calculate center for clicking
        labels[labelId] = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        
        // Create visual label
        const labelEl = document.createElement('div');
        labelEl.innerText = labelId;
        labelEl.style.position = 'absolute';
        labelEl.style.top = `${rect.top + window.scrollY}px`;
        labelEl.style.left = `${rect.left + window.scrollX}px`;
        labelEl.style.background = 'red';
        labelEl.style.color = 'white';
        labelEl.style.fontSize = '12px';
        labelEl.style.fontWeight = 'bold';
        labelEl.style.zIndex = '999999';
        labelEl.style.padding = '2px 4px';
        labelEl.style.borderRadius = '3px';
        labelEl.className = 'ai-label';
        document.body.appendChild(labelEl);
      }
    });
    return labels;
  });
}

async function removeLabels(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.ai-label').forEach(el => el.remove());
  });
}

async function run() {
  console.log(`🚀 Starting Local AI Scanner...`);
  console.log(`🌐 Target: ${options.url}`);
  console.log(`🧠 Model: ${options.model} (Host: ${options.host})`);
  
  // 1. Setup Ollama client
  const ollama = new Ollama({ host: options.host });

  // Verify Ollama connection
  try {
    const list = await ollama.list();
    const hasModel = list.models.some(m => m.name === options.model || m.name === `${options.model}:latest`);
    if (!hasModel) {
      console.warn(`⚠️  Warning: Model '${options.model}' might not be pulled in your local Ollama instance.`);
      console.warn(`   Run 'ollama run ${options.model}' in a separate terminal to download it.`);
    }
  } catch (err) {
    console.error(`❌ Failed to connect to Ollama at ${options.host}. Is it running?`);
    process.exit(1);
  }

  // 2. Launch browser (headful mode to bypass headless detection)
  console.log(`\n💻 Launching real browser to bypass WAFs...`);
  const browser = await chromium.launch({
    headless: false, // Must be visible to bypass standard bot protection
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // Hide webdriver navigator property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log(`🧭 Navigating to ${options.url}...`);
    await page.goto(options.url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Give WAFs time to settle
    console.log(`⏳ Waiting 5 seconds for bot protection checks to pass...`);
    await delay(5000);

    let steps = 0;
    const maxSteps = 10;
    
    while (steps < maxSteps) {
      console.log(`\n--- Step ${steps + 1} ---`);
      
      console.log(`🏷️  Adding visual labels to interactive elements...`);
      const labels = await addLabels(page);

      console.log(`📸 Taking screenshot...`);
      const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 80 });
      const base64Image = screenshotBuffer.toString('base64');

      console.log(`🧹 Removing labels...`);
      await removeLabels(page);

      console.log(`🤖 Sending screenshot to local AI (${options.model}) for decision...`);
      const prompt = `You are an expert web automation agent. The user's instruction is: "${options.instructions}".
You are looking at a screenshot of a webpage with RED NUMBERED LABELS on interactive elements.
Decide on the next action to take to fulfill the user's instruction.

Respond ONLY with a valid JSON object in the following format:
{
  "thought": "Your reasoning here",
  "action": "click" | "type" | "scroll" | "done",
  "label": "number as string, required for click and type (e.g. '5')",
  "text": "text to type, required for type",
  "message": "Final answer or message to user, required for done"
}`;

      const response = await ollama.chat({
        model: options.model,
        format: 'json',
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [base64Image]
          }
        ]
      });

      let aiMsg;
      try {
        aiMsg = JSON.parse(response.message.content);
      } catch (e) {
        console.error(`❌ Failed to parse AI response as JSON:`, response.message.content);
        break;
      }

      console.log(`🧠 Thought: ${aiMsg.thought}`);
      
      if (aiMsg.action === 'done') {
         console.log(`✅ Task Complete: ${aiMsg.message}`);
         break;
      } else if (aiMsg.action === 'click') {
         const pos = labels[aiMsg.label];
         if (pos) {
            console.log(`🖱️  Clicking element ${aiMsg.label}`);
            await page.mouse.click(pos.x, pos.y);
         } else {
            console.log(`⚠️  Label ${aiMsg.label} not found in this viewport.`);
         }
      } else if (aiMsg.action === 'type') {
         const pos = labels[aiMsg.label];
         if (pos) {
            console.log(`⌨️  Typing "${aiMsg.text}" into element ${aiMsg.label}`);
            await page.mouse.click(pos.x, pos.y);
            // clear existing text just in case
            await page.keyboard.down('Meta');
            await page.keyboard.press('a');
            await page.keyboard.up('Meta');
            await page.keyboard.press('Backspace');
            await page.keyboard.type(aiMsg.text);
            await page.keyboard.press('Enter');
         } else {
            console.log(`⚠️  Label ${aiMsg.label} not found in this viewport.`);
         }
      } else if (aiMsg.action === 'scroll') {
         console.log(`📜 Scrolling page...`);
         await page.mouse.wheel(0, 600);
      } else {
         console.log(`❓ Unknown action: ${aiMsg.action}`);
      }
      
      await delay(3000); // Wait for page to react to action
      steps++;
    }
    
    if (steps >= maxSteps) {
      console.log(`⚠️  Reached maximum steps (${maxSteps}). Stopping.`);
    }

  } catch (err) {
    console.error(`❌ Error during execution:`, err);
  } finally {
    console.log(`🧹 Cleaning up browser...`);
    await browser.close();
    console.log(`🏁 Local AI Scanner finished.`);
  }
}

run().catch(console.error);
