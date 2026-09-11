const fs = require('fs');
let css = fs.readFileSync('apps/web/src/app/globals.css', 'utf-8');

// The dark block variables to replace root
const darkVars = `  --bg: #0c0908;
  --bg-surface: rgba(23, 19, 17, 0.85);
  --bg-surface-rgb: 23, 19, 17;
  --bg-surface-glass: rgba(18, 14, 12, 0.72);
  --bg-hover: rgba(255, 255, 255, 0.05);
  
  --accent-glow-1: rgba(180, 83, 9, 0.18);
  --accent-glow-2: rgba(154, 52, 18, 0.22);
  --accent-glow-3: rgba(69, 26, 3, 0.28);
  --accent-glow-4: rgba(217, 119, 6, 0.12);
  
  --text: #f3f4f6;
  --text-secondary: #a3a19d;
  --text-muted: #73706b;
  
  --border: rgba(255, 255, 255, 0.09);
  --border-focus: rgba(56, 189, 248, 0.5);
  
  --accent: #f59e0b; /* Core Amber */
  --accent-hover: #d97706;
  --accent-sky: #0ea5e9; /* Sky Blue */
  
  --radius-xl: 24px;
  --radius: 16px;
  --radius-md: 10px;
  --radius-sm: 6px;
  --radius-pill: 9999px;
  
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 6px 16px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.08);

  /* Status Colors */
  --pass: #10b981;
  --pass-bg: rgba(16, 185, 129, 0.1);
  --fail: #ef4444;
  --fail-bg: rgba(239, 68, 68, 0.1);
  --warn: #f59e0b;
  --warn-bg: rgba(245, 158, 11, 0.1);`;

// We just replace the entire :root { ... } up to .dark { ... }
const rootStart = css.indexOf(':root {');
// Find end of .dark block
const darkEnd = css.indexOf('}', css.indexOf('.dark {')) + 1;

if (rootStart !== -1 && darkEnd !== -1) {
    const newCss = css.slice(0, rootStart) + ':root {\n' + darkVars + '\n}\n\n' + css.slice(darkEnd);
    fs.writeFileSync('apps/web/src/app/globals.css', newCss);
    console.log('Successfully patched globals.css');
} else {
    console.log('Failed to find blocks');
}
