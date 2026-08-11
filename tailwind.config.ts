import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff1f2',
          100: '#ffe4e7',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e83145',
          600: '#c51a2b',
          700: '#a91324',
          800: '#861322',
          900: '#63121f',
          950: '#37070e',
        },
        gold: {
          50: '#fff9db',
          100: '#fff0a8',
          200: '#ffe36b',
          300: '#ffd43b',
          400: '#ffc107',
          500: '#f4b000',
          600: '#d49400',
          700: '#a86800',
          800: '#7a4a05',
          900: '#4d3007',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 12px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config
