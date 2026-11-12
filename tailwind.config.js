/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic brand roles — CSS variable channels so opacity modifiers work (bg-brand-secondary/50).
        'brand-primary': 'rgb(var(--brand-primary-rgb) / <alpha-value>)',
        'brand-secondary': 'rgb(var(--brand-secondary-rgb) / <alpha-value>)',
        'brand-accent': 'rgb(var(--brand-accent-rgb) / <alpha-value>)',
        'brand-highlight': 'rgb(var(--brand-highlight-rgb) / <alpha-value>)',
        'sidebar-font': 'rgb(var(--sidebar-font-rgb) / <alpha-value>)',
        // Teton palette. The pale-* tints are FILLS — pair them with text-teton-ink, never use as text.
        teton: {
          ink: 'rgb(var(--teton-ink-rgb) / <alpha-value>)',
          'near-black': 'rgb(var(--teton-near-black-rgb) / <alpha-value>)',
          'dark-gray': 'rgb(var(--teton-dark-gray-rgb) / <alpha-value>)',
          neutral: 'rgb(var(--teton-neutral-rgb) / <alpha-value>)',
          'ui-gray': 'rgb(var(--teton-ui-gray-rgb) / <alpha-value>)',
          'light-gray': 'rgb(var(--teton-light-gray-rgb) / <alpha-value>)',
          'pale-gray': 'rgb(var(--teton-pale-gray-rgb) / <alpha-value>)',
          'off-white': 'rgb(var(--teton-off-white-rgb) / <alpha-value>)',
          'almost-white': 'rgb(var(--teton-almost-white-rgb) / <alpha-value>)',
          'pale-green': 'rgb(var(--teton-pale-green-rgb) / <alpha-value>)',
          'pale-purple': 'rgb(var(--teton-pale-purple-rgb) / <alpha-value>)',
          'pale-yellow': 'rgb(var(--teton-pale-yellow-rgb) / <alpha-value>)',
          green: 'rgb(var(--teton-green-rgb) / <alpha-value>)',
          blue: 'rgb(var(--teton-blue-rgb) / <alpha-value>)',
          amber: 'rgb(var(--teton-amber-rgb) / <alpha-value>)',
          red: 'rgb(var(--teton-red-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        serif: ['var(--font-heading)', 'sans-serif'],
        sans: ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
