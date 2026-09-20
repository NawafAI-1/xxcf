/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Keep in step with DOMAIN_COLORS in src/lib/types.ts.
        domain: {
          environmental: '#0284c7',
          ecological: '#047857',
          production: '#d97706',
          'nutrition-health': '#e11d48',
          'socio-economic': '#7c3aed',
        },
        // The site's own water: page background and the deep end of the hero.
        sea: {
          surface: '#f2f8fa',
          shallow: '#0e7490',
          deep: '#134e4a',
        },
      },
    },
  },
  plugins: [],
};
