import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50: '#f0f7ff',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          glow: 'rgba(56, 189, 248, 0.15)',
        },
        ambient: {
          dark: '#0e0b0a',
          card: 'rgba(23, 20, 19, 0.72)',
          cardBorder: 'rgba(255, 255, 255, 0.08)',
        }
      },
      boxShadow: {
        'glow': '0 0 45px -10px rgba(245, 158, 11, 0.18), 0 0 20px -5px rgba(56, 189, 248, 0.15)',
        'card-glass': '0 20px 40px -15px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        'pill-active': '0 0 15px rgba(56, 189, 248, 0.35)',
        'luminous': '0 0 25px -4px rgba(14, 165, 233, 0.55), 0 0 12px -2px rgba(56, 189, 248, 0.4), inset 0 1px 1px 0 rgba(255, 255, 255, 0.45)',
        'luminous-hover': '0 0 35px -2px rgba(14, 165, 233, 0.75), 0 0 18px 0 rgba(56, 189, 248, 0.5), inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.65)',
      },
      animation: {
        'shimmer-slide': 'shimmerSlide 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-subtle': 'subtlePulse 2.5s ease-in-out infinite',
      },
      keyframes: {
        shimmerSlide: {
          '0%': { transform: 'translateX(-150%) skewX(-20deg)' },
          '35%, 100%': { transform: 'translateX(250%) skewX(-20deg)' },
        },
        subtlePulse: {
          '0%, 100%': { opacity: '0.8', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        }
      }
    }
  },
  plugins: [],
};

export default config;
