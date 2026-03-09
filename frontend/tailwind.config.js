/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  "#e8eaf6",
          100: "#c5c9e8",
          200: "#9fa6d8",
          300: "#7983c8",
          400: "#5c68bc",
          500: "#3f4db0",
          600: "#3846a9",
          700: "#2f3ca0",
          800: "#273397",
          900: "#1a2387",
        },
        dark: {
          50:  "#f0f1f5",
          100: "#d9dce7",
          200: "#b3b9d0",
          300: "#8d96b8",
          400: "#6d78a5",
          500: "#525d92",
          600: "#44508a",
          700: "#38427f",
          800: "#2c3475",
          900: "#1a2163",
          950: "#0d1033",
        },
        surface: {
          DEFAULT: "#0f1224",
          card:    "#161b35",
          hover:   "#1e2540",
          border:  "#2a3055",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
        "gradient-card":  "linear-gradient(145deg, #161b35 0%, #1e2540 100%)",
      },
      boxShadow: {
        card: "0 4px 24px rgba(0, 0, 0, 0.4)",
        glow: "0 0 20px rgba(79, 70, 229, 0.35)",
      },
      animation: {
        "fade-in":   "fadeIn 0.2s ease-out",
        "slide-in":  "slideIn 0.25s ease-out",
        "pulse-slow":"pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%":   { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)",    opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
