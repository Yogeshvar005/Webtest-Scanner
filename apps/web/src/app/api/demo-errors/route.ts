import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Console Error Demonstration Target - Webtest Scanner</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; }
    .card { background: #1e293b; padding: 28px; border-radius: 12px; border: 1px solid #334155; max-width: 640px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { color: #f43f5e; margin-top: 0; font-size: 22px; display: flex; align-items: center; gap: 10px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
    .btn { background: #e11d48; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-right: 8px; font-size: 13px; }
    .btn:hover { opacity: 0.9; }
    .badge { display: inline-block; padding: 4px 8px; background: rgba(244,63,94,0.2); color: #f43f5e; border-radius: 6px; font-family: monospace; font-size: 11px; margin-bottom: 12px; font-weight: 700; }
    .log-box { margin-top: 20px; background: #090d16; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #f43f5e; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">SIMULATED QA TARGET</span>
    <h1>🚨 Web Application Console Error Target</h1>
    <p>This page automatically simulates real-world frontend and network errors upon load to test Webtest Scanner's browser console detection, real-time terminal output, and Root Cause Analysis (RCA).</p>
    
    <div style="margin-top: 20px;">
      <button id="checkout-button" class="btn" onclick="triggerPaymentCrash()">Checkout Button</button>
      <button id="search-button" class="btn" style="background: #3b82f6;" onclick="triggerSearch()">Search Button</button>
    </div>

    <div class="log-box">
      <div>[00:01] Initializing client application...</div>
      <div>[00:02] StripeSDK: Invalid API publishable key provided</div>
      <div>[00:03] Uncaught TypeError: Cannot read properties of undefined</div>
    </div>
  </div>

  <script>
    // 1. Immediate console warnings and errors
    console.warn("[DEPRECATION] Synchronous XMLHttpRequest is deprecated and will be removed.");
    console.error("[PAYMENT GATEWAY ERROR] StripeSDK: Invalid API publishable key provided: pk_test_invalid_83921938");
    console.error("[AUTH ERROR] Token expired: Failed to refresh bearer token from auth provider.");
    console.error("[API ERROR] Failed to load resource: the server responded with a status of 404 (Not Found)");

    // 2. Failed network requests
    fetch('/api/non-existent-user-endpoint-404').catch(e => {
      console.error("[NETWORK ERROR] Fetch failed for /api/non-existent-user-endpoint-404:", e.message);
    });

    // 3. Uncaught TypeError in runtime
    setTimeout(() => {
      try {
        window.userProfile.address.getZipCode();
      } catch (err) {
        console.error("Uncaught TypeError: Cannot read properties of undefined (reading 'address') at UserProfile.js:48:12");
      }
    }, 150);

    function triggerPaymentCrash() {
      console.error("CriticalPaymentFailure: Transaction declined due to invalid payment token payload.");
      alert("Payment Error Triggered!");
    }

    function triggerSearch() {
      console.log("Search query executed: 'test query'");
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
