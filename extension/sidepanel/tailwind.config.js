/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#558ae0',
          dark: '#4a7acc',
          light: '#8faee0',
          lighter: '#e5efff',
          50: '#ecf3ff',
        }
      }
    },
  },
  plugins: [],
}
