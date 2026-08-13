/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
    './planora_frontend_with_api.jsx',
    './planora_frontend.jsx',
  ],
  theme: {
    extend: {
      colors: {
        ivory: '#FBF8EF',
        butter: '#F3E6A5',
        'soft-butter': '#F8EDBF',
        teal: {
          DEFAULT: '#155E63',
          dark: '#103F43',
          muted: '#6F9691',
        },
        taupe: '#8C8272',
        champagne: '#D7C58A',
        ink: '#173B3D',
        mist: '#657574',
      },
      fontFamily: {
        serif: [
          'Palatino Linotype',
          'Palatino',
          'Iowan Old Style',
          'Book Antiqua',
          'Georgia',
          'serif',
        ],
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        quiet: '0 10px 30px -24px rgba(16, 63, 67, 0.35)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [],
};
