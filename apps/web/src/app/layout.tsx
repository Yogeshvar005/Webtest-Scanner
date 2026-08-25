import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { codeMono, uiSans } from './fonts';
import { AuthProvider } from '../lib/auth-context';
import './globals.css';
import './motion.css';

export const metadata: Metadata = {
  title: 'Webtest Scanner',
  description: 'Describe a test in plain English, watch a real browser run it, and get screenshot evidence.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${uiSans.variable} ${codeMono.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
