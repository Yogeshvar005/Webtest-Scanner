import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { uiSans, serif } from './fonts';
import { AuthProvider } from '../lib/auth-context';
import { ThemeProvider } from 'next-themes';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './tailwind-compiled.css';
import './motion.css';

export const metadata: Metadata = {
  title: 'Webtest Scanner | Intelligent Browser Audits in Plain English',
  description: 'Execute automated tests, visual diffs, and deep compliance audits using natural language commands.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${uiSans.variable} ${serif.variable}`}>
      <head>
        {/* Google Fonts: Inter, Newsreader for editorial display & JetBrains Mono for telemetry */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* Phosphor Icons for developer UI */}
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css" />
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/bold/style.css" />
      </head>
      <body className="min-h-screen font-sans selection:bg-sky-500/30 selection:text-white relative pb-20">
        <div aria-hidden="true" className="ambient-noise" />
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem>
          <AuthProvider>{children}</AuthProvider>
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
