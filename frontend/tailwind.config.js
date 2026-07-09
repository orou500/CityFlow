/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        card: 'var(--color-card)',
        border: 'var(--color-border)',
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        muted: 'var(--color-muted)',
        brand: 'var(--color-brand)',
        'brand-dark': 'var(--color-brand-dark)',
        accent: 'var(--color-accent)',
        'accent-dark': 'var(--color-accent-dark)',
      },
    },
  },
  plugins: [],
};
