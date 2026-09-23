import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
async function test() {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AQ.Ab8RN6LZdMkyPrdzPo7kh19D-BgHsOHHu0j4KH4ar5hGysqbGg";
  try {
    const { text } = await generateText({
      model: google('gemini-3.1-pro-preview'),
      prompt: 'Hello',
    });
    console.log("Success:", text);
  } catch (e) {
    console.error("Error Message:", e.message);
  }
}
test();
