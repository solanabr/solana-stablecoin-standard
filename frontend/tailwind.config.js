/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        accent: {
          DEFAULT: "#06b6d4",
          muted: "#0891b2",
        },
      },
    },
  },
  plugins: [],
};
