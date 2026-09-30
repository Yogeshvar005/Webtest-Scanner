import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { uiSans, serif } from './fonts';
import { AuthProvider } from '../lib/auth-context';
import { SpeedInsights } from '@vercel/speed-insights/next';
import AmbientBackground from '../components/AmbientBackground';
import './tailwind-compiled.css';
import './motion.css';

export const metadata: Metadata = {
  title: 'Webtest Scanner | Intelligent Browser Audits in Plain English',
  description: 'Execute automated tests, visual diffs, and deep compliance audits using natural language commands.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Webtest Scanner',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0808',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${uiSans.variable} ${serif.variable}`}>
      <head>
        {/* Google Fonts: Geist, Inter, Newsreader, JetBrains Mono, Material Symbols */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700;800;900&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=JetBrains+Mono:wght@400;500;600&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        {/* Phosphor Icons for developer UI */}
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css" />
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/bold/style.css" />
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/fill/style.css" />
      </head>
      <body className="min-h-screen font-sans selection:bg-brand-500/30 selection:text-white relative pb-20">
        <AmbientBackground />
        <AuthProvider>{children}</AuthProvider>
        <aside aria-label="Support and feedback" className="fixed bottom-6 right-6 z-30">
          <div className="relative flex items-center justify-center">
            {/* Continuous Radar Ripple Waves */}
            <span className="absolute inset-0 rounded-full bg-amber-500/40 animate-radar-wave-1 pointer-events-none"></span>
            <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-radar-wave-2 pointer-events-none"></span>
            <button aria-label="Open support and assistant" className="relative z-10 w-11 h-11 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-300 text-white flex items-center justify-center shadow-lg shadow-amber-900/50 hover:shadow-amber-500/50 hover:scale-110 active:scale-90 transition-all duration-300 border border-amber-300/40 cursor-pointer group" title="Need help? Ask AI assistant" type="button">
              <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform duration-200">forum</span>
            </button>
          </div>
        </aside>
        <SpeedInsights />
      </body>
    </html>
  );
}
