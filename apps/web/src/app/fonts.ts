import { Inter, Lora } from 'next/font/google';

/**
 * Typography chosen for a highly refined, minimal aesthetic:
 * Inter for clean UI elements and Lora for elegant serif headings.
 */
export const uiSans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-ui',
  display: 'swap',
});

export const serif = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});
