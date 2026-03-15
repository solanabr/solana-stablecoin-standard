import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        sans: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        paper: '#EBE9E1',
        ink: '#0A0A0A',
        accent: '#FF3E00',
        blue: '#0044FF',
      },
    },
  },
  plugins: [],
};

export default config;
