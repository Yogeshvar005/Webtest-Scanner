import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export const maxDuration = 60; // Allow more time for generation

// Configure the OpenAI SDK to use BazaarLink
const bazaarlink = createOpenAI({
  baseURL: 'https://api.bazaarlink.ai/v1',
  apiKey: process.env.BAZAARLINK_API_KEY || '',
});

export async function POST(req: Request) {
  try {
    const { resultsJSON } = await req.json();

    if (!resultsJSON) {
      return NextResponse.json({ error: 'No scan results provided' }, { status: 400 });
    }

    if (!process.env.BAZAARLINK_API_KEY) {
      return NextResponse.json(
        { error: 'BAZAARLINK_API_KEY is not set in the environment variables.' },
        { status: 500 }
      );
    }

    // Limit JSON string length to avoid extreme token usage, taking the first chunk of findings.
    // Usually, the first ~50k chars of the JSON is enough to get the gist of the issues.
    const contextStr = JSON.stringify(resultsJSON).slice(0, 50000);

    const prompt = `You are a Principal Application Security Engineer and Web Auditor. 
A comprehensive web scan was just performed on a target website. 

Here are the extracted JSON results of the scan:
${contextStr}

Please provide an Executive Summary of these findings to be placed on the first page of the formal PDF report.
The tone should be highly professional, objective, and executive-friendly.

Structure your response using Markdown:
1. **Executive Summary:** A 2-3 sentence overview of the site's posture.
2. **Key Findings:** 3-5 bullet points of the most critical or notable issues (include UI, Security, Accessibility, or Performance issues).
3. **Remediation Advice:** 2-3 bullet points of high-level next steps to correct the issues.

Do not use raw JSON or technical jargon that a non-technical executive wouldn't understand. Keep it concise.`;

    const { text } = await generateText({
      model: bazaarlink('auto:free'), // Use the strictly free rate-limited tier since credits are empty
      prompt,
    });

    return NextResponse.json({ summary: text });
  } catch (error: any) {
    console.error('AI Summary Generation Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate AI summary' },
      { status: 500 }
    );
  }
}
