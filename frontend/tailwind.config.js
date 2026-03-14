/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#00FFA3",
          500: "#00E092",
          600: "#00C47F",
          700: "#00A86C",
          800: "#008C5A",
          900: "#006644",
        },
        surface: {
          0: "#0A0B14",
          1: "#10111C",
          2: "#161825",
          3: "#1C1E2E",
          4: "#232538",
        },
        border: {
          DEFAULT: "#2A2D42",
          light: "#353854",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "glass-gradient": "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
        "card-glow": "linear-gradient(135deg, rgba(0,255,163,0.03) 0%, transparent 50%, rgba(59,130,246,0.03) 100%)",
        "accent-gradient": "linear-gradient(135deg, #00FFA3 0%, #00D4AA 50%, #00B4D8 100%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(0, 255, 163, 0.1)",
        "glow-lg": "0 0 40px rgba(0, 255, 163, 0.15)",
        card: "0 4px 24px rgba(0, 0, 0, 0.3)",
        "card-hover": "0 8px 40px rgba(0, 0, 0, 0.4)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 15px rgba(0,255,163,0.1)" },
          "50%": { boxShadow: "0 0 30px rgba(0,255,163,0.2)" },
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
    },
  },
  plugins: [],
};
