import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
async function test() {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "this_is_fake_xyz123";
  try {
    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
      prompt: 'Hello',
    });
    console.log("Success:", text);
  } catch (e) {
    console.error("Error Name:", e.name);
    console.error("Error Message:", e.message);
  }
}
test();
