import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cp: {
          black: '#0A0A0A',
          dark: '#111111',
          charcoal: '#1A1A1A',
          border: '#2A2A2A',
          muted: '#3A3A3A',
          grey: '#888888',
          light: '#CCCCCC',
          white: '#FFFFFF',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Space Grotesk', 'sans-serif'],
        body: ['var(--font-body)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
