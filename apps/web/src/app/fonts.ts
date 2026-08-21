import { IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';

/**
 * Typography chosen from the ui-ux-pro-max design-system search for a
 * "developer tool / technical audience" product: IBM Plex Sans for UI text,
 * JetBrains Mono for anything code-shaped (the scenario textarea, raw JSON,
 * evidence snippets). Loaded via next/font so the files are self-hosted at
 * build time — no runtime request to Google, no layout shift while it loads.
 */
export const uiSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});

export const codeMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});
