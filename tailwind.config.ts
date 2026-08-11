import type { Config } from 'tailwindcss'
import { BRAND_COLORS } from './lib/siteConfig'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette. Edit lib/siteConfig.ts (or the BRAND_COLOR_* env
        // vars) to rebrand -- these names are semantic so they survive a
        // change of hue.
        'brand-primary': BRAND_COLORS.primary,
        'brand-primary-light': BRAND_COLORS.primaryLight,
        'brand-secondary': BRAND_COLORS.secondary,
        'brand-dark': BRAND_COLORS.dark,
        'brand-accent': BRAND_COLORS.accent,
        // Portal dark-mode surfaces (blue-tinted zinc)
        'portal-bg': '#0b0e14',
        'portal-surface': '#141820',
        'portal-border': '#1f2937',
        'portal-hover': '#1a2030',
        'portal-accent': '#d4845e',
      },
      fontFamily: {
        sans: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', '"DM Sans"', 'sans-serif'],
      },
      borderRadius: {
        'xl': '14px',
        '2xl': '16px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
    },
  },
  plugins: [],
}
export default config
