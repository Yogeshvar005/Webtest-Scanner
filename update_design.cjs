const fs = require('fs');

// Read user raw HTML
const html = fs.readFileSync('/Users/yogeshvar/.gemini/antigravity/brain/06008798-6de2-4260-81c9-bfbf9b9b6058/scratch/user_raw.html', 'utf8');

// Extract tailwind config
const twMatch = html.match(/tailwind\.config = (\{[\s\S]*?\})\s*<\/script>/);
if (twMatch) {
  let configStr = twMatch[1];
  // Re-write apps/web/tailwind.config.js to include this
  let existingTw = fs.readFileSync('/Users/yogeshvar/Downloads/Webtest scanner/apps/web/tailwind.config.js', 'utf8');
  
  // We'll replace the theme.extend block with what they have.
  // Actually, let's just write a new tailwind.config.ts / .js based on it.
  const newTw = `
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: ${configStr}.theme,
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
export default config;
  `;
  fs.writeFileSync('/Users/yogeshvar/Downloads/Webtest scanner/apps/web/tailwind.config.ts', newTw);
  console.log("Updated tailwind.config.ts");
  // If there was a js version, delete it to avoid conflict
  if (fs.existsSync('/Users/yogeshvar/Downloads/Webtest scanner/apps/web/tailwind.config.js')) {
    fs.unlinkSync('/Users/yogeshvar/Downloads/Webtest scanner/apps/web/tailwind.config.js');
  }
}

// Extract globals CSS
const cssMatch = html.match(/<style data-purpose="ambient-backdrop">([\s\S]*?)<\/style>/);
if (cssMatch) {
  let existingCss = fs.readFileSync('/Users/yogeshvar/Downloads/Webtest scanner/apps/web/src/app/globals.css', 'utf8');
  // Strip out old body/noise stuff and append this new stuff, or just append it.
  const newCss = existingCss + "\n\n/* NEW AMBIENT BACKDROP */\n" + cssMatch[1];
  fs.writeFileSync('/Users/yogeshvar/Downloads/Webtest scanner/apps/web/src/app/globals.css', newCss);
  console.log("Updated globals.css");
}
