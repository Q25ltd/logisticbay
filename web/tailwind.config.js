/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a',
        muted:   '#64748b',
        accent:  '#2563eb',
        surface: '#f1f5f9',
        border:  '#e2e8f0',
      },
      boxShadow: {
        'focus': '0 0 0 3px rgba(37, 99, 235, 0.15)',
        'card':  '0 1px 3px rgba(15, 23, 42, 0.06), 0 4px 20px rgba(15, 23, 42, 0.04)',
        'card-lg': '0 2px 8px rgba(15, 23, 42, 0.08), 0 8px 32px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
}
