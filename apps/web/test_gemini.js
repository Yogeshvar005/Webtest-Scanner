import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
async function test() {
  try {
    const { text } = await generateText({
      model: google('gemini-3.1-pro'),
      prompt: 'Hello',
    });
    console.log("Success:", text);
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
