/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        node: {
          requirement: '#e0f2fe', // sky-100
          function: '#dcfce7',    // emerald-100
          mechanism: '#fef3c7',   // amber-100
          structure: '#f3e8ff',   // purple-100
          constraint: '#fee2e2',  // rose-100
          note: '#f1f5f9',        // slate-100
        }
      }
    },
  },
  plugins: [],
};
