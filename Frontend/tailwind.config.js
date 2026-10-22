/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    // Override default colors entirely to prevent accidental purple, violet, indigo, cream, paper, etc.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      bg: '#0A0A0A',
      surface: '#111111',
      raised: '#171717',
      ide: '#0D0D0D',
      line: '#262626',
      'line-strong': '#3D3D3D',
      text: '#EDEDED',
      muted: '#A1A1A1',
      subtle: '#737373',
      green: '#1BA94C',
      'green-hover': '#17933F',
      'green-bright': '#00EA64',
      'green-soft': '#0B2A1A',
      terracotta: '#C46B4A',
      ember: '#E8935F',
      danger: '#E5484D',
      slate: '#7FA3BD',
      sage: '#9DB08F',
      // For white button (Rule 5: "WHITE (bg = text token, near-black label)")
      white: '#EDEDED',
      black: '#0A0A0A',
    },
    extend: {
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '8px',
        full: '9999px',
      },
      borderWidth: {
        DEFAULT: '1px',
        hairline: '1px',
      },
      fontFamily: {
        sans: [
          '"Geist Sans Variable"',
          '"Geist Sans"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: [
          '"Geist Mono Variable"',
          '"Geist Mono"',
          '"JetBrains Mono"',
          'ui-monospace',
          'monospace',
        ],
      },
      letterSpacing: {
        tightest: '-0.03em',
        headline: '-0.03em',
      },
    },
  },
  plugins: [],
};