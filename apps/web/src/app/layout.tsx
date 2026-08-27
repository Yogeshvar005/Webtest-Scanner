import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { uiSans, serif } from './fonts';
import { AuthProvider } from '../lib/auth-context';
import { ThemeProvider } from 'next-themes';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import './motion.css';

export const metadata: Metadata = {
  title: 'Webtest Scanner',
  description: 'Describe a test in plain English, watch a real browser run it, and get screenshot evidence.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${uiSans.variable} ${serif.variable}`}>
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <AuthProvider>{children}</AuthProvider>
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
