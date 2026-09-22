import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
async function test() {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AQ.Ab8RN6LFVqyM8tI03NUqyoWcCM7Th42s9Mom9nv3akmsqIOIrA";
  try {
    const { text } = await generateText({
      model: google('gemini-pro-latest'),
      prompt: 'Hello',
    });
    console.log("Success:", text);
  } catch (e) {
    console.error("Error Name:", e.name);
    console.error("Error Message:", e.message);
  }
}
test();
