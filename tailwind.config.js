/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        synthia: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          900: '#0F0F1A',
          card: '#16162A',
          border: '#2A2A45',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-grid': "url('/grid.svg')",
      },
      animation: {
        'gradient-x': 'gradient-x 12s ease infinite',
        'float': 'float 5s ease-in-out infinite',
        'pulse-slow': 'pulse 4s ease-in-out infinite',
      },
      keyframes: {
        'gradient-x': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%':     { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-18px)' },
        },
      },
    },
  },
  plugins: [],
};
